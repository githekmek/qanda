import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin";
import { limitLogin } from "@/lib/loginRateLimit";
import { mutationError, RequestError, serializable } from "@/lib/transaction";

const usernameSchema = z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_-]+$/);
const bodySchema = z.object({ username: usernameSchema }).strict();
const hash = (token: string) => createHash("sha256").update(token).digest("hex");

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const source = new URL(origin);
    return source.host === request.headers.get("host") &&
      source.protocol === new URL(request.url).protocol;
  } catch { return false; }
}

export async function GET(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  const parsed = usernameSchema.safeParse(new URL(request.url).searchParams.get("username"));
  if (!parsed.success) return NextResponse.json({ error: "Bitte gib einen gültigen Spielernamen ein." }, { status: 400 });
  const user = await prisma.user.findUnique({
    where: { username: parsed.data },
    select: { username: true },
  });
  return NextResponse.json({ user }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 403 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte gib einen gültigen Spielernamen ein." }, { status: 400 });
  const limited = await limitLogin(request, "admin-reset:" + admin.id,
    "Zu viele Reset-Links erzeugt. Bitte versuche es später erneut.");
  if (limited) return limited;

  const token = randomBytes(32).toString("hex");
  try {
    await serializable(async (tx) => {
      const currentAdmin = await tx.user.findUnique({
        where: { id: admin.id }, select: { isAdmin: true },
      });
      if (!currentAdmin?.isAdmin) throw new RequestError(403, "Kein Zugriff");
      const user = await tx.user.findUnique({ where: { username: parsed.data.username } });
      if (!user) throw new RequestError(404, "Spieler nicht gefunden.");
      await tx.recoveryToken.deleteMany({ where: { userId: user.id, purpose: "admin-reset" } });
      await tx.recoveryToken.create({ data: {
        tokenHash: hash(token), userId: user.id, purpose: "admin-reset",
        email: "", sessionVersion: user.sessionVersion,
        expiresAt: new Date(Date.now() + 30 * 60000),
      } });
    });
    // The fragment stays out of HTTP access logs and is shown only in this response.
    return NextResponse.json({ path: "/konto/passwort#token=" + token, expiresInMinutes: 30 });
  } catch (error) { return mutationError(error); }
}
