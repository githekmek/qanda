import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializable, mutationError } from "@/lib/transaction";
import { findRoomForMember } from "@/lib/rooms";
import { draftData, draftSchema, serializeDraft, MAX_DRAFTS_PER_ROOM } from "@/lib/drafts";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { id } = await params;
  const room = await findRoomForMember(id, session.userId);
  if (!room) {
    return NextResponse.json({ error: "Raum nicht gefunden" }, { status: 404 });
  }

  // Drafts are private: the opponent never sees what is being prepared.
  const drafts = await prisma.questionDraft.findMany({
    where: { roomId: room.id, userId: session.userId },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(drafts.map(serializeDraft), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const parsed = draftSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" }, { status: 400 });
  }

  try {
    return await serializable(async (tx) => {
      const { id } = await params;
      const room = await findRoomForMember(id, session.userId, tx);
      if (!room) {
        return NextResponse.json({ error: "Raum nicht gefunden" }, { status: 404 });
      }
      if (room.archivedAt) {
        return NextResponse.json({ error: "Dieser Raum ist archiviert" }, { status: 409 });
      }
      const count = await tx.questionDraft.count({ where: { roomId: room.id, userId: session.userId } });
      if (count >= MAX_DRAFTS_PER_ROOM) {
        return NextResponse.json(
          { error: `Höchstens ${MAX_DRAFTS_PER_ROOM} Entwürfe pro Raum. Lösche zuerst einen alten Entwurf.` },
          { status: 409 }
        );
      }

      const draft = await tx.questionDraft.create({
        data: { ...draftData(parsed.data), roomId: room.id, userId: session.userId },
      });
      return NextResponse.json(serializeDraft(draft));
    });
  } catch (error) {
    return mutationError(error);
  }
}
