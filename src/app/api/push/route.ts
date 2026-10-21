import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { publicPushConfig } from "@/lib/push";
import { mutationError, RequestError, serializable } from "@/lib/transaction";

const endpoint = z.string().url().max(2048);
const keys = z.object({
  p256dh: z.string().min(16).max(512),
  auth: z.string().min(8).max(256),
}).strict();
const subscribeSchema = z.object({
  endpoint,
  keys,
  userAgent: z.string().max(300).optional(),
}).strict();
const updateSchema = z.object({
  endpoint,
  notifyTurn: z.boolean().optional(),
  notifyComments: z.boolean().optional(),
}).strict().refine((data) => data.notifyTurn !== undefined || data.notifyComments !== undefined);
const deleteSchema = z.object({ endpoint }).strict();

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

const select = { endpoint: true, notifyTurn: true, notifyComments: true } as const;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  return NextResponse.json(
    { ...publicPushConfig(), subscription: null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 403 });
  if (!publicPushConfig().available) {
    return NextResponse.json({ error: "Push-Benachrichtigungen sind noch nicht eingerichtet." }, { status: 503 });
  }
  const parsed = subscribeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültiges Push-Abonnement" }, { status: 400 });
  try {
    const subscription = await serializable(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: session.userId } });
      if (!user || user.sessionVersion !== session.sessionVersion) throw new RequestError(401, "Bitte erneut anmelden.");
      return tx.pushSubscription.upsert({
        where: { endpoint: parsed.data.endpoint },
        update: {
          userId: session.userId,
          p256dh: parsed.data.keys.p256dh,
          auth: parsed.data.keys.auth,
          userAgent: parsed.data.userAgent,
          notifyTurn: false,
          notifyComments: false,
        },
        create: {
          userId: session.userId,
          endpoint: parsed.data.endpoint,
          p256dh: parsed.data.keys.p256dh,
          auth: parsed.data.keys.auth,
          userAgent: parsed.data.userAgent,
        },
        select,
      });
    });
    return NextResponse.json({ subscription });
  } catch (error) {
    return mutationError(error);
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Push-Einstellungen" }, { status: 400 });
  try {
    const subscription = await prisma.pushSubscription.updateMany({
      where: { endpoint: parsed.data.endpoint, userId: session.userId },
      data: {
        ...(parsed.data.notifyTurn !== undefined ? { notifyTurn: parsed.data.notifyTurn } : {}),
        ...(parsed.data.notifyComments !== undefined ? { notifyComments: parsed.data.notifyComments } : {}),
      },
    });
    if (!subscription.count) return NextResponse.json({ error: "Gerät ist nicht angemeldet" }, { status: 404 });
    const updated = await prisma.pushSubscription.findFirst({
      where: { endpoint: parsed.data.endpoint, userId: session.userId },
      select,
    });
    return NextResponse.json({ subscription: updated });
  } catch (error) {
    return mutationError(error);
  }
}

export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  if (!sameOrigin(request)) return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 403 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültiges Push-Abonnement" }, { status: 400 });
  await prisma.pushSubscription.deleteMany({
    where: { endpoint: parsed.data.endpoint, userId: session.userId },
  });
  return NextResponse.json({ ok: true });
}
