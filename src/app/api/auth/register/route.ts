import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createSessionCookie } from "@/lib/auth";
import { normalizeAccessCode } from "@/lib/codes";
import { serializable, mutationError, RequestError } from "@/lib/transaction";

const registerSchema = z.object({
  username: z.string().trim().min(3, "Benutzername muss mindestens 3 Zeichen haben")
    .max(32, "Benutzername darf höchstens 32 Zeichen haben")
    .regex(/^[a-zA-Z0-9_-]+$/, "Nur Buchstaben, Zahlen, - und _ erlaubt"),
  // New accounts only. Existing password hashes and login rules stay valid.
  password: z.string().min(12, "Passwort muss mindestens 12 Zeichen haben").max(200)
    .refine((value) => Buffer.byteLength(value, "utf8") <= 72, "Passwort darf höchstens 72 UTF-8-Bytes haben"),
  code: z.string().trim().max(200).optional(),
  inviteCode: z.string().trim().max(200).optional(),
}).refine((data) => data.code || data.inviteCode, { message: "Zugangscode fehlt" });

type Registration = z.infer<typeof registerSchema>;

async function checkRegistration(db: Prisma.TransactionClient, data: Registration) {
  if (await db.user.findUnique({ where: { username: data.username } })) {
    throw new RequestError(409, "Dieser Benutzername ist bereits vergeben");
  }
  if (data.inviteCode) {
    const room = await db.room.findUnique({ where: { inviteCode: data.inviteCode } });
    if (!room) throw new RequestError(403, "Diese Einladung ist ungültig");
    if (room.playerBId) throw new RequestError(409, "Dieser Raum ist bereits vollständig");
    return { roomId: room.id, accessCodeId: null, isAdmin: false };
  }
  const code = normalizeAccessCode(data.code!);
  const setupCode = process.env.ADMIN_SETUP_CODE
    ? normalizeAccessCode(process.env.ADMIN_SETUP_CODE) : null;
  if (setupCode && code === setupCode &&
      (await db.user.count({ where: { isAdmin: true } })) === 0) {
    return { roomId: null, accessCodeId: null, isAdmin: true };
  }
  const accessCode = await db.accessCode.findUnique({ where: { code } });
  if (!accessCode || accessCode.revokedAt) throw new RequestError(403, "Dieser Zugangscode ist ungültig");
  if (accessCode.redeemedById) throw new RequestError(403, "Dieser Zugangscode wurde bereits eingelöst");
  return { roomId: null, accessCodeId: accessCode.id, isAdmin: false };
}

export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" }, { status: 400 }
    );
  }
  try {
    // Cheap preflight before bcrypt, then repeat ALL checks in the transaction.
    await checkRegistration(prisma, parsed.data);
    const passwordHash = await bcrypt.hash(parsed.data.password, 10);
    const result = await serializable(async (tx) => {
      const gate = await checkRegistration(tx, parsed.data);
      const user = await tx.user.create({
        data: { username: parsed.data.username, passwordHash, isAdmin: gate.isAdmin },
        select: { id: true, username: true, isAdmin: true },
      });
      if (gate.accessCodeId) {
        const claimed = await tx.accessCode.updateMany({
          where: { id: gate.accessCodeId, redeemedById: null, revokedAt: null },
          data: { redeemedById: user.id, redeemedAt: new Date() },
        });
        if (claimed.count !== 1) throw new RequestError(403, "Dieser Zugangscode wurde bereits eingelöst oder zurückgezogen");
      }
      if (gate.roomId) {
        const claimed = await tx.room.updateMany({
          where: { id: gate.roomId, inviteCode: parsed.data.inviteCode, playerBId: null },
          data: { playerBId: user.id },
        });
        if (claimed.count !== 1) throw new RequestError(409, "Diese Einladung ist nicht mehr verfügbar");
      }
      return { ...user, roomId: gate.roomId };
    });
    await createSessionCookie({ userId: result.id, username: result.username });
    return NextResponse.json(result);
  } catch (error) {
    return mutationError(error);
  }
}
