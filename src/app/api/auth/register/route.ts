import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSessionCookie } from "@/lib/auth";
import { normalizeAccessCode } from "@/lib/codes";

// Two ways in: an access code from the admin, or a room invite link. Both are
// secret and single-use, so an invite is vouching enough on its own.
const registerSchema = z
  .object({
    username: z
      .string()
      .trim()
      .min(3, "Benutzername muss mindestens 3 Zeichen haben")
      .max(32, "Benutzername darf höchstens 32 Zeichen haben")
      .regex(/^[a-zA-Z0-9_-]+$/, "Nur Buchstaben, Zahlen, - und _ erlaubt"),
    password: z.string().min(6, "Passwort muss mindestens 6 Zeichen haben").max(200),
    code: z.string().trim().optional(),
    inviteCode: z.string().trim().optional(),
  })
  .refine((data) => data.code || data.inviteCode, {
    message: "Zugangscode fehlt",
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

  const { username, password, inviteCode } = parsed.data;

  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser) {
    return NextResponse.json({ error: "Dieser Benutzername ist bereits vergeben" }, { status: 409 });
  }

  let isAdminSetup = false;
  let accessCodeId: string | null = null;
  let roomId: string | null = null;

  if (inviteCode) {
    const room = await prisma.room.findUnique({ where: { inviteCode } });
    if (!room) {
      return NextResponse.json({ error: "Diese Einladung ist ungültig" }, { status: 403 });
    }
    if (room.playerBId) {
      return NextResponse.json({ error: "Dieser Raum ist bereits vollständig" }, { status: 409 });
    }
    roomId = room.id;
  } else {
    const code = normalizeAccessCode(parsed.data.code!);
    const setupCode = process.env.ADMIN_SETUP_CODE
      ? normalizeAccessCode(process.env.ADMIN_SETUP_CODE)
      : null;
    const adminExists = (await prisma.user.count({ where: { isAdmin: true } })) > 0;
    isAdminSetup = Boolean(setupCode) && code === setupCode && !adminExists;

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

  if (roomId) {
    // Same idea for the room seat: if somebody else claimed it in the meantime,
    // the half-finished account is removed again.
    const claimed = await prisma.room.updateMany({
      where: { id: roomId, playerBId: null },
      data: { playerBId: user.id },
    });

    if (claimed.count === 0) {
      await prisma.user.delete({ where: { id: user.id } });
      return NextResponse.json({ error: "Dieser Raum ist bereits vollständig" }, { status: 409 });
    }
  }

  await createSessionCookie({ userId: user.id, username: user.username });

  return NextResponse.json({
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    roomId,
  });
}
