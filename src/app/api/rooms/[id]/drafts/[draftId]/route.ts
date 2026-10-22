import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { serializable, mutationError } from "@/lib/transaction";
import { findRoomForMember } from "@/lib/rooms";
import { draftData, draftSchema, serializeDraft } from "@/lib/drafts";

type Params = { params: Promise<{ id: string; draftId: string }> };

export async function PATCH(request: Request, { params }: Params) {
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
      const { id, draftId } = await params;
      const room = await findRoomForMember(id, session.userId, tx);
      if (!room) {
        return NextResponse.json({ error: "Raum nicht gefunden" }, { status: 404 });
      }
      if (room.archivedAt) {
        return NextResponse.json({ error: "Dieser Raum ist archiviert" }, { status: 409 });
      }

      const { count } = await tx.questionDraft.updateMany({
        where: { id: draftId, roomId: room.id, userId: session.userId },
        data: draftData(parsed.data),
      });
      if (count === 0) {
        return NextResponse.json({ error: "Entwurf nicht gefunden" }, { status: 404 });
      }
      const draft = await tx.questionDraft.findUniqueOrThrow({ where: { id: draftId } });
      return NextResponse.json(serializeDraft(draft));
    });
  } catch (error) {
    return mutationError(error);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { id, draftId } = await params;
  const room = await findRoomForMember(id, session.userId);
  if (!room) {
    return NextResponse.json({ error: "Raum nicht gefunden" }, { status: 404 });
  }

  const { count } = await serializable((tx) => tx.questionDraft.deleteMany({
    where: { id: draftId, roomId: room.id, userId: session.userId },
  }));
  if (count === 0) {
    return NextResponse.json({ error: "Entwurf nicht gefunden" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
