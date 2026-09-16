import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSessionCookie } from "@/lib/auth";
import { MAX_PLAYERS } from "@/lib/game";

const registerSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Benutzername muss mindestens 3 Zeichen haben")
    .max(32, "Benutzername darf höchstens 32 Zeichen haben")
    .regex(/^[a-zA-Z0-9_-]+$/, "Nur Buchstaben, Zahlen, - und _ erlaubt"),
  password: z.string().min(6, "Passwort muss mindestens 6 Zeichen haben").max(200),
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

  const existingCount = await prisma.user.count();
  if (existingCount >= MAX_PLAYERS) {
    return NextResponse.json(
      { error: "Es sind bereits zwei Spieler registriert. Diese App ist auf ein Spiel mit 2 Spielern ausgelegt." },
      { status: 403 }
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { username } });
  if (existingUser) {
    return NextResponse.json({ error: "Dieser Benutzername ist bereits vergeben" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { username, passwordHash },
  });

  await createSessionCookie({ userId: user.id, username: user.username });

  return NextResponse.json({ id: user.id, username: user.username });
}
