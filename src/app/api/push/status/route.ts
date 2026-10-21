import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

const schema = z.object({ endpoint: z.string().url().max(2048) }).strict();

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const source = new URL(origin);
    return source.host === request.headers.get("host") &&
      source.protocol === new URL(request.url).protocol;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültiges Push-Abonnement" }, { status: 400 });
  const subscription = await prisma.pushSubscription.findFirst({
    where: { endpoint: parsed.data.endpoint, userId: session.userId },
    select: { endpoint: true, notifyTurn: true, notifyComments: true },
  });
  return NextResponse.json({ subscription }, { headers: { "Cache-Control": "no-store" } });
}
