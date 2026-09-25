import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSessionCookie } from "@/lib/auth";
import { limitLogin } from "@/lib/loginRateLimit";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(32),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  const { username, password } = parsed.data;

  const limited = await limitLogin(request, username);
  if (limited) return limited;

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    return NextResponse.json({ error: "Benutzername oder Passwort falsch" }, { status: 401 });
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    return NextResponse.json({ error: "Benutzername oder Passwort falsch" }, { status: 401 });
  }

  await createSessionCookie({ userId: user.id, username: user.username });

  return NextResponse.json({ id: user.id, username: user.username });
}
