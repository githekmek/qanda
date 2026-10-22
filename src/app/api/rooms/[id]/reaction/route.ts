import { enqueueNotification, dispatchNotifications } from "@/lib/notifications";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { serializable, mutationError } from "@/lib/transaction";
import { findRoomForMember } from "@/lib/rooms";
import {
  loadQuestionWithRelations,
  serializeQuestionForViewer,
  MAX_REACTION_LENGTH,
} from "@/lib/game";

export const maxDuration = 60;

const reactionSchema = z.object({
  questionId: z.string().min(1),
  replyToId: z.string().min(1).max(64).optional(),
  text: z.string().trim().min(1).max(MAX_REACTION_LENGTH),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = reactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  try {
    const response = await serializable(async (tx) => {
      const { id } = await params;
      const room = await findRoomForMember(id, session.userId, tx);
      if (!room) {
        return NextResponse.json({ error: "Raum nicht gefunden" }, { status: 404 });
      }
      if (room.archivedAt) {
        return NextResponse.json({ error: "Dieser Raum ist archiviert" }, { status: 409 });
      }

      const { questionId, text, replyToId } = parsed.data;

      const question = await loadQuestionWithRelations(questionId, tx);
      if (!question || question.roomId !== room.id) {
        return NextResponse.json({ error: "Frage nicht gefunden" }, { status: 404 });
      }
      if (question.status !== "ANSWERED") {
        return NextResponse.json(
          { error: "Reaktionen sind erst möglich, wenn beide geantwortet haben" },
          { status: 403 }
        );
      }

      if (replyToId) {
        const original = await tx.reaction.findFirst({ where: { id: replyToId, questionId: question.id } });
        if (!original) return NextResponse.json({ error: "Der zitierte Kommentar gehört nicht zu dieser Frage." }, { status: 400 });
      }
      const reaction = await tx.reaction.create({
        data: { questionId: question.id, authorId: session.userId, text, replyToId },
      });

      await enqueueNotification(tx, room.playerAId === session.userId ? room.playerBId : room.playerAId, room.id, "comment", reaction.id);
      const updated = await loadQuestionWithRelations(question.id, tx);
      return NextResponse.json(serializeQuestionForViewer(updated!, session.userId));
    });
    if (response.ok) after(async () => { await dispatchNotifications().catch(() => { console.error("Notification dispatch deferred."); }); });
    return response;
  } catch (error) {
    return mutationError(error);
  }
}
