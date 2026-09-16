import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findRoomForMember } from "@/lib/rooms";
import {
  loadQuestionWithRelations,
  serializeQuestionForViewer,
  MAX_TEXT_LENGTH,
} from "@/lib/game";

const answerSchema = z.object({
  questionId: z.string().min(1),
  value: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
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
  const parsed = answerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  const { questionId, value } = parsed.data;

  const question = await loadQuestionWithRelations(questionId);
  if (!question || question.roomId !== room.id) {
    return NextResponse.json({ error: "Frage nicht gefunden" }, { status: 404 });
  }
  if (question.status !== "PENDING") {
    return NextResponse.json({ error: "Diese Frage wurde bereits beantwortet" }, { status: 409 });
  }
  if (question.askerId === session.userId) {
    return NextResponse.json(
      { error: "Du hast diese Frage gestellt und kannst sie nicht selbst beantworten" },
      { status: 403 }
    );
  }

  if (question.type === "MULTIPLE_CHOICE") {
    const options: string[] = question.options ? JSON.parse(question.options) : [];
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0 || index >= options.length) {
      return NextResponse.json({ error: "Ungültige Antwortoption" }, { status: 400 });
    }
  }

  await prisma.answer.create({
    data: { questionId: question.id, responderId: session.userId, value },
  });
  await prisma.question.update({ where: { id: question.id }, data: { status: "ANSWERED" } });
  // Whoever just answered gets to ask the next question.
  await prisma.room.update({
    where: { id: room.id },
    data: { currentAskerId: session.userId },
  });

  const updated = await loadQuestionWithRelations(question.id);
  return NextResponse.json(serializeQuestionForViewer(updated!, session.userId));
}
