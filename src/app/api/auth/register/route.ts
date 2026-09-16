import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSessionCookie } from "@/lib/auth";
import { normalizeAccessCode } from "@/lib/codes";

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Benutzername muss mindestens 3 Zeichen haben")
    .max(32, "Benutzername darf höchstens 32 Zeichen haben")
    .regex(/^[a-zA-Z0-9_-]+$/, "Nur Buchstaben, Zahlen, - und _ erlaubt"),
  password: z.string().min(6, "Passwort muss mindestens 6 Zeichen haben").max(200),
  code: z.string().trim().min(1, "Zugangscode fehlt"),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" },
      { status: 400 }
    );
  }

  const { username, password } = parsed.data;
  const code = normalizeAccessCode(parsed.data.code);

  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser) {
    return NextResponse.json({ error: "Dieser Benutzername ist bereits vergeben" }, { status: 409 });
  }

  const setupCode = process.env.ADMIN_SETUP_CODE
    ? normalizeAccessCode(process.env.ADMIN_SETUP_CODE)
    : null;
  const adminExists = (await prisma.user.count({ where: { isAdmin: true } })) > 0;
  const isAdminSetup = Boolean(setupCode) && code === setupCode && !adminExists;

  let accessCodeId: string | null = null;

  if (!isAdminSetup) {
    const accessCode = await prisma.accessCode.findUnique({ where: { code } });
    if (!accessCode || accessCode.revokedAt) {
      return NextResponse.json({ error: "Dieser Zugangscode ist ungültig" }, { status: 403 });
    }
    if (accessCode.redeemedById) {
      return NextResponse.json(
        { error: "Dieser Zugangscode wurde bereits eingelöst" },
        { status: 403 }
      );
    }
    accessCodeId = accessCode.id;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, passwordHash, isAdmin: isAdminSetup },
  });

  if (accessCodeId) {
    // Claim the code only if it is still unclaimed, so two people racing on the
    // same code cannot both end up with an account.
    const claimed = await prisma.accessCode.updateMany({
      where: { id: accessCodeId, redeemedById: null, revokedAt: null },
      data: { redeemedById: user.id, redeemedAt: new Date() },
    });

    if (claimed.count === 0) {
      await prisma.user.delete({ where: { id: user.id } });
      return NextResponse.json(
        { error: "Dieser Zugangscode wurde bereits eingelöst" },
        { status: 403 }
      );
    }
  }

  await createSessionCookie({ userId: user.id, username: user.username });

  return NextResponse.json({ id: user.id, username: user.username, isAdmin: user.isAdmin });
}
