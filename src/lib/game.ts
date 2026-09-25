import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

export const MAX_OPTIONS = 5;
export const MIN_OPTIONS = 2;
export const MAX_TEXT_LENGTH = 255;
export const MAX_REACTION_LENGTH = 500;

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
  reactions: {
    id: string;
    text: string;
    createdAt: string;
    author: { id: string; username: string };
  }[];
};

type QuestionWithRelations = NonNullable<Awaited<ReturnType<typeof loadQuestionWithRelations>>>;

export const questionInclude = {
  asker: true,
  answer: { include: { responder: true } },
  reactions: { include: { author: true }, orderBy: { createdAt: "asc" } },
} as const;

export async function loadQuestionWithRelations(questionId: string, db: Prisma.TransactionClient = prisma) {
  return db.question.findUnique({
    where: { id: questionId },
    include: questionInclude,
  });
}

export async function findPendingQuestion(roomId: string) {
  return prisma.question.findFirst({
    where: { roomId, status: "PENDING" },
    include: questionInclude,
  });
}

/**
 * Shapes a question for a specific viewer, hiding the asker's answer from
 * the responder until they have answered too.
 */
export function serializeQuestionForViewer(
  question: QuestionWithRelations,
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
    reactions: question.reactions.map((reaction) => ({
      id: reaction.id,
      text: reaction.text,
      createdAt: reaction.createdAt.toISOString(),
      author: { id: reaction.author.id, username: reaction.author.username },
    })),
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
      responder: {
        id: question.answer.responder.id,
        username: question.answer.responder.username,
      },
    };
    base.isMatch = question.askerAnswer === question.answer.value;
  }

  return base;
}
