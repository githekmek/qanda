import { after, NextResponse } from "next/server";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { serializable, RequestError, mutationError } from "@/lib/transaction";
import { recoveryConfig, sendRecoveryMail } from "@/lib/recoveryMail";
import { allowRecovery } from "@/lib/recoveryLimit";
import { limitLogin } from "@/lib/loginRateLimit";

export const maxDuration = 30;

const emailSchema = z.string().trim().toLowerCase().email().max(254);
const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("request"), email: emailSchema }),
  z.object({ action: z.literal("email"), email: emailSchema, password: z.string().min(1).max(200) }),
  z.object({ action: z.literal("verify"), token: tokenSchema }),
  z.object({ action: z.literal("reset"), token: tokenSchema,
    password: z.string().min(12).max(200).refine((value) => Buffer.byteLength(value, "utf8") <= 72) }),
]);
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
const neutral = () => NextResponse.json({ message: "Wenn die Adresse für diesen Vorgang verwendet werden kann, erhältst du einen Link per E-Mail. Prüfe auch den Spamordner." });
const invalidLink = () => new RequestError(400, "Dieser Link ist ungültig oder abgelaufen. Bitte fordere einen neuen Link an.");

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.userId }, select: { email: true, emailVerifiedAt: true },
  });
  return NextResponse.json({ email: user?.email ?? null, verified: Boolean(user?.emailVerifiedAt), available: Boolean(recoveryConfig()) },
    { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    let sameOrigin = false;
    try {
      const source = new URL(origin);
      // Next's internal URL can use localhost behind a proxy. Compare the
      // browser Origin with the actual HTTP Host, which browser JS cannot set.
      sameOrigin = source.host === request.headers.get("host") &&
        source.protocol === new URL(request.url).protocol;
    } catch { /* Invalid and opaque origins are rejected. */ }
    if (!sameOrigin) return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte prüfe deine Eingaben. Neue Passwörter benötigen mindestens 12 Zeichen und höchstens 72 UTF-8-Bytes." }, { status: 400 });
  const data = parsed.data;
  try {
    if (data.action === "request" || data.action === "email") {
      const session = data.action === "email" ? await getSession() : null;
      if (data.action === "email" && !session) throw new RequestError(401, "Nicht angemeldet");
      if (!recoveryConfig()) throw new RequestError(503, "Der E-Mail-Versand ist noch nicht eingerichtet. Bitte versuche es später erneut.");
      if (!await allowRecovery(request, data.action + ":" + (session?.userId ?? data.email), true)) {
        throw new RequestError(429, "Zu viele Anfragen. Bitte versuche es später erneut.");
      }
      if (data.action === "email" && session) {
        const limited = await limitLogin(request, session.username);
        if (limited) return limited;
        const user = await prisma.user.findUnique({ where: { id: session.userId } });
        if (!user || !await bcrypt.compare(data.password, user.passwordHash)) throw new RequestError(403, "Das aktuelle Passwort ist nicht korrekt.");
        const token = randomBytes(32).toString("hex");
        const created = await serializable(async (tx) => {
          const current = await tx.user.findUnique({ where: { id: user.id } });
          if (!current || current.passwordHash !== user.passwordHash || current.sessionVersion !== session.sessionVersion) {
            throw new RequestError(401, "Bitte melde dich erneut an.");
          }
          if (await tx.user.findUnique({ where: { email: data.email } })) return false;
          await tx.recoveryToken.deleteMany({ where: { userId: user.id, purpose: "verify" } });
          await tx.recoveryToken.create({ data: { tokenHash: hash(token), userId: user.id, purpose: "verify",
            email: data.email, sessionVersion: current.sessionVersion, expiresAt: new Date(Date.now() + 30 * 60000) } });
          return true;
        });
        if (created) {
          try { await sendRecoveryMail(data.email, "verify", token); }
          catch {
            await prisma.recoveryToken.deleteMany({ where: { tokenHash: hash(token) } });
            throw new RequestError(503, "Die Bestätigungsmail konnte nicht versendet werden. Bitte versuche es später erneut.");
          }
        }
        return neutral();
      }

      // Delivery runs after the neutral response, so provider latency does not
      // reveal whether an account exists. Neither response nor logs contain tokens.
      after(async () => {
        const token = randomBytes(32).toString("hex");
        try {
          const sentTo = await serializable(async (tx) => {
            const user = await tx.user.findUnique({ where: { email: data.email } });
            if (!user?.emailVerifiedAt || !user.email) return null;
            await tx.recoveryToken.deleteMany({ where: { userId: user.id, purpose: "reset" } });
            await tx.recoveryToken.create({ data: { tokenHash: hash(token), userId: user.id, purpose: "reset",
              email: user.email, sessionVersion: user.sessionVersion, expiresAt: new Date(Date.now() + 30 * 60000) } });
            return user.email;
          });
          if (sentTo) await sendRecoveryMail(sentTo, "reset", token);
        } catch {
          await prisma.recoveryToken.deleteMany({ where: { tokenHash: hash(token) } }).catch(() => {});
          console.error("Recovery mail could not be delivered.");
        }
      });
      return neutral();
    }

    if (!await allowRecovery(request, "consume:" + hash(data.token), false)) {
      throw new RequestError(429, "Zu viele Anfragen. Bitte versuche es später erneut.");
    }
    // Reject invalid tokens before the expensive password hash.
    const tokenHash = hash(data.token);
    const preliminary = await prisma.recoveryToken.findUnique({ where: { tokenHash } });
    const purpose = data.action === "verify" ? "verify" : "reset";
    if (!preliminary || preliminary.purpose !== purpose || preliminary.expiresAt <= new Date()) throw invalidLink();
    const passwordHash = data.action === "reset" ? await bcrypt.hash(data.password, 10) : null;
    await serializable(async (tx) => {
      const token = await tx.recoveryToken.findUnique({ where: { tokenHash }, include: { user: true } });
      if (!token || token.purpose !== purpose || token.expiresAt <= new Date() ||
          token.sessionVersion !== token.user.sessionVersion) throw invalidLink();
      if (data.action === "verify") {
        const owner = await tx.user.findUnique({ where: { email: token.email } });
        if (owner && owner.id !== token.userId) throw invalidLink();
        await tx.user.update({ where: { id: token.userId }, data: { email: token.email, emailVerifiedAt: new Date() } });
      } else {
        if (!token.user.emailVerifiedAt || token.user.email !== token.email) throw invalidLink();
        await tx.user.update({ where: { id: token.userId }, data: { passwordHash: passwordHash!, sessionVersion: { increment: 1 } } });
      }
      // Consume this link and invalidate outstanding links for this account.
      await tx.recoveryToken.deleteMany({ where: { userId: token.userId } });
    });
    return NextResponse.json({ message: data.action === "verify" ? "Deine E-Mail-Adresse ist bestätigt." : "Dein Passwort wurde geändert. Bitte melde dich mit dem neuen Passwort an." });
  } catch (error) {
    return mutationError(error);
  }
}
