import { prisma } from "@/lib/db";

export const MAX_PLAYERS = 2;
export const MAX_OPTIONS = 5;
export const MIN_OPTIONS = 2;
export const MAX_TEXT_LENGTH = 255;

const GAME_STATE_ID = "singleton";

/**
 * Ensures the singleton GameState row exists. If no asker is set yet and at
 * least one player has registered, the earliest-registered player starts.
 */
export async function getOrInitGameState() {
  let state = await prisma.gameState.findUnique({ where: { id: GAME_STATE_ID } });

  if (!state) {
    state = await prisma.gameState.create({ data: { id: GAME_STATE_ID } });
  }

  if (!state.currentAskerId) {
    const firstPlayer = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (firstPlayer) {
      state = await prisma.gameState.update({
        where: { id: GAME_STATE_ID },
        data: { currentAskerId: firstPlayer.id },
      });
    }
  }

  return state;
}

export async function setCurrentAsker(userId: string) {
  await prisma.gameState.upsert({
    where: { id: GAME_STATE_ID },
    create: { id: GAME_STATE_ID, currentAskerId: userId },
    update: { currentAskerId: userId },
  });
}

export type PublicQuestion = {
  id: string;
  type: "MULTIPLE_CHOICE" | "TEXT";
  text: string;
  options: string[] | null;
  status: "PENDING" | "ANSWERED";
  createdAt: string;
  asker: { id: string; username: string };
  // Only present once the viewer is allowed to see it.
  askerAnswer?: string;
  answer?: {
    value: string;
    createdAt: string;
    responder: { id: string; username: string };
  };
  isMatch?: boolean;
};

type QuestionWithRelations = Awaited<ReturnType<typeof loadQuestionWithRelations>>;

export async function loadQuestionWithRelations(questionId: string) {
  return prisma.question.findUnique({
    where: { id: questionId },
    include: {
      asker: true,
      answer: { include: { responder: true } },
    },
  });
}

/**
 * Shapes a question for a specific viewer, hiding the asker's answer from
 * the responder until they have answered too.
 */
export function serializeQuestionForViewer(
  question: NonNullable<QuestionWithRelations>,
  viewerId: string
): PublicQuestion {
  const base: PublicQuestion = {
    id: question.id,
    type: question.type,
    text: question.text,
    options: question.options ? (JSON.parse(question.options) as string[]) : null,
    status: question.status,
    createdAt: question.createdAt.toISOString(),
    asker: { id: question.asker.id, username: question.asker.username },
  };

  const viewerIsAsker = question.askerId === viewerId;
  const resolved = question.status === "ANSWERED" && question.answer;

  if (viewerIsAsker || resolved) {
    base.askerAnswer = question.askerAnswer;
  }

  if (resolved && question.answer) {
    base.answer = {
      value: question.answer.value,
      createdAt: question.answer.createdAt.toISOString(),
      responder: { id: question.answer.responder.id, username: question.answer.responder.username },
    };
    base.isMatch = question.askerAnswer === question.answer.value;
  }

  return base;
}
