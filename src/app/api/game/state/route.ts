import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getOrInitGameState, questionInclude, serializeQuestionForViewer } from "@/lib/game";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const opponent = users.find((u) => u.id !== session.userId) ?? null;

  const gameState = await getOrInitGameState();

  const pending = await prisma.question.findFirst({
    where: { status: "PENDING" },
    include: questionInclude,
  });

  const historyRaw = await prisma.question.findMany({
    where: { status: "ANSWERED" },
    include: questionInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const pendingQuestion = pending ? serializeQuestionForViewer(pending, session.userId) : null;
  const history = historyRaw.map((q) => serializeQuestionForViewer(q, session.userId));

  const isMyTurnToAsk = !pending && gameState.currentAskerId === session.userId;
  const awaitingMyAnswer = Boolean(pending && pending.askerId !== session.userId);

  return NextResponse.json({
    me: { id: session.userId, username: session.username },
    opponent: opponent ? { id: opponent.id, username: opponent.username } : null,
    isMyTurnToAsk,
    awaitingMyAnswer,
    pendingQuestion,
    history,
  });
}
