import { NextResponse } from "next/server";
import { z } from "zod";
import { parseMultipleAnswer } from "@/lib/choiceAnswers.mjs";
import { getSession } from "@/lib/auth";
import { serializable, mutationError } from "@/lib/transaction";
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

  const body = await request.json().catch(() => null);
  const parsed = answerSchema.safeParse(body);
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

      const { questionId, value } = parsed.data;

      const question = await loadQuestionWithRelations(questionId, tx);
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

      let storedValue = value;
      if (question.type === "MULTIPLE_SELECT") {
        const options: string[] = question.options ? JSON.parse(question.options) : [];
        const indices = parseMultipleAnswer(value, options.length);
        if (!indices) {
          return NextResponse.json({ error: "Bitte mindestens eine gültige Antwortoption ohne Duplikate auswählen" }, { status: 400 });
        }
        storedValue = JSON.stringify(indices);
      }
      if (question.type === "MULTIPLE_CHOICE") {
        const options: string[] = question.options ? JSON.parse(question.options) : [];
        const index = Number(value);
        if (!Number.isInteger(index) || index < 0 || index >= options.length) {
          return NextResponse.json({ error: "Ungültige Antwortoption" }, { status: 400 });
        }
      }

      // Resume a partial write from an older version without replacing its answer.
      if (!question.answer) {
        await tx.answer.create({
          data: { questionId: question.id, responderId: session.userId, value: storedValue },
        });
      }
      await tx.question.update({ where: { id: question.id }, data: { status: "ANSWERED" } });
      // Whoever just answered gets to ask the next question.
      await tx.room.update({
        where: { id: room.id },
        data: { currentAskerId: session.userId },
      });

      const updated = await loadQuestionWithRelations(question.id, tx);
      return NextResponse.json(serializeQuestionForViewer(updated!, session.userId));
    });
  } catch (error) {
    return mutationError(error);
  }
}
