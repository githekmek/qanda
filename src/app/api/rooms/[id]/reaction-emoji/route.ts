import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { serializable, mutationError } from "@/lib/transaction";
import { findRoomForMember } from "@/lib/rooms";
import { isCommentEmoji } from "@/lib/commentEmojis";
import { loadQuestionWithRelations, serializeQuestionForViewer } from "@/lib/game";

const emojiSchema = z.object({
  reactionId: z.string().min(1).max(64),
  emoji: z.string().refine(isCommentEmoji),
  active: z.boolean(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const parsed = emojiSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
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

      const { reactionId, emoji, active } = parsed.data;
      const reaction = await tx.reaction.findUnique({
        where: { id: reactionId },
        select: { questionId: true, question: { select: { roomId: true } } },
      });
      if (!reaction || reaction.question.roomId !== room.id) {
        return NextResponse.json({ error: "Kommentar nicht gefunden" }, { status: 404 });
      }

      // Setting and clearing are idempotent, so a double tap cannot flip the state back.
      if (active) {
        await tx.reactionEmoji.createMany({
          data: [{ reactionId, userId: session.userId, emoji }],
          skipDuplicates: true,
        });
      } else {
        await tx.reactionEmoji.deleteMany({ where: { reactionId, userId: session.userId, emoji } });
      }

      const updated = await loadQuestionWithRelations(reaction.questionId, tx);
      return NextResponse.json(serializeQuestionForViewer(updated!, session.userId));
    });
  } catch (error) {
    return mutationError(error);
  }
}
