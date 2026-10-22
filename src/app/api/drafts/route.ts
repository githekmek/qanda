import { rejectForeignOrigin } from "@/lib/requestOrigin";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializable, mutationError } from "@/lib/transaction";
import { draftPayloadSchema } from "@/lib/drafts";
const schema = z.object({ id: z.string().min(1).max(64).optional(), version: z.number().int().positive().optional(), payload: draftPayloadSchema }).strict();
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const drafts = await prisma.questionDraft.findMany({ where: { userId: session.userId }, orderBy: { updatedAt: "desc" } });
  return NextResponse.json(drafts.map((d) => ({ id: d.id, version: d.version, updatedAt: d.updatedAt.toISOString(), payload: JSON.parse(d.payload) })), { headers: { "Cache-Control": "private, no-store" } });
}
export async function POST(request: Request) {
  const rejected = rejectForeignOrigin(request);
  if (rejected) return rejected;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültiger Entwurf" }, { status: 400 });
  try {
    return await serializable(async (tx) => {
      const { id, version, payload } = parsed.data;
      if (payload.parent) {
        const parent = await tx.question.findFirst({ where: { id: payload.parent.id, roomId: payload.parent.roomId, status: "ANSWERED", room: { OR: [{ playerAId: session.userId }, { playerBId: session.userId }] } } });
        if (!parent) return NextResponse.json({ error: "Ausgangsfrage nicht verfügbar" }, { status: 400 });
        payload.parent.text = parent.text;
      }
      if (id) {
        if (!version) return NextResponse.json({ error: "Version fehlt" }, { status: 400 });
        const changed = await tx.questionDraft.updateMany({ where: { id, userId: session.userId, version }, data: { payload: JSON.stringify(payload), version: { increment: 1 } } });
        if (!changed.count) return NextResponse.json({ error: "Der Entwurf wurde inzwischen geändert oder entfernt. Bitte neu laden oder als neuen Entwurf speichern." }, { status: 409 });
      }
      const draft = id ? await tx.questionDraft.findUniqueOrThrow({ where: { id } }) : await tx.questionDraft.create({ data: { userId: session.userId, payload: JSON.stringify(payload) } });
      return NextResponse.json({ id: draft.id, version: draft.version, updatedAt: draft.updatedAt.toISOString(), payload });
    });
  } catch (error) { return mutationError(error); }
}
export async function DELETE(request: Request) {
  const rejected = rejectForeignOrigin(request);
  if (rejected) return rejected;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const parsed = z.object({ id: z.string().min(1).max(64), version: z.number().int().positive() }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  const deleted = await prisma.questionDraft.deleteMany({ where: { ...parsed.data, userId: session.userId } });
  return NextResponse.json(deleted.count ? { ok: true } : { error: "Entwurf inzwischen geändert oder entfernt. Bitte neu laden." }, { status: deleted.count ? 200 : 409 });
}
