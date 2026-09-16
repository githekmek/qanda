import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  loadQuestionWithRelations,
  serializeQuestionForViewer,
  MAX_REACTION_LENGTH,
} from "@/lib/game";

const reactionSchema = z.object({
  questionId: z.string().min(1),
  text: z.string().trim().min(1).max(MAX_REACTION_LENGTH),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = reactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  const { questionId, text } = parsed.data;

  const question = await loadQuestionWithRelations(questionId);
  if (!question) {
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
