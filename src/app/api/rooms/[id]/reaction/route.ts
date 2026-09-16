import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findRoomForMember } from "@/lib/rooms";
import {
  loadQuestionWithRelations,
  serializeQuestionForViewer,
  MAX_REACTION_LENGTH,
} from "@/lib/game";

const reactionSchema = z.object({
  questionId: z.string().min(1),
  text: z.string().trim().min(1).max(MAX_REACTION_LENGTH),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { id } = await params;
  const room = await findRoomForMember(id, session.userId);
  if (!room) {
    return NextResponse.json({ error: "Raum nicht gefunden" }, { status: 404 });
  }
  if (room.archivedAt) {
    return NextResponse.json({ error: "Dieser Raum ist archiviert" }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const parsed = reactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  const { questionId, text } = parsed.data;

  const question = await loadQuestionWithRelations(questionId);
  if (!question || question.roomId !== room.id) {
    return NextResponse.json({ error: "Frage nicht gefunden" }, { status: 404 });
  }
  if (question.status !== "ANSWERED") {
    return NextResponse.json(
      { error: "Reaktionen sind erst möglich, wenn beide geantwortet haben" },
      { status: 403 }
    );
  }

  await prisma.reaction.create({
    data: { questionId: question.id, authorId: session.userId, text },
  });

  const updated = await loadQuestionWithRelations(question.id);
  return NextResponse.json(serializeQuestionForViewer(updated!, session.userId));
}
