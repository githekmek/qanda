import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { findRoomForMember, opponentOf } from "@/lib/rooms";
import { questionInclude, serializeQuestionForViewer } from "@/lib/game";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { id } = await params;
  const room = await findRoomForMember(id, session.userId);
  if (!room) {
    return NextResponse.json({ error: "Raum nicht gefunden" }, { status: 404 });
  }

  const opponent = opponentOf(room, session.userId);
  const archived = room.archivedAt !== null;

  const pending = await prisma.question.findFirst({
    where: { roomId: room.id, status: "PENDING" },
    include: questionInclude,
  });

  const visit = await prisma.roomReactionVisit.findUnique({
    where: { userId_roomId: { userId: session.userId, roomId: room.id } },
  });
  const unread = visit ? await prisma.reaction.findMany({
    where: {
      question: { roomId: room.id, status: "ANSWERED" },
      authorId: { not: session.userId },
      reads: { none: { userId: session.userId } },
    },
    select: { id: true, questionId: true },
  }) : [];
  const historyRaw = await prisma.question.findMany({
    where: { roomId: room.id, status: "ANSWERED" },
    include: questionInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Keep older questions already loaded in this visit, even after their receipts
  // have been saved. The membership-scoped query cannot expose other rooms.
  const sinceText = new URL(_request.url).searchParams.get("historySince");
  const since = sinceText ? new Date(sinceText) : null;
  const older = await prisma.question.findMany({
    where: {
      roomId: room.id, status: "ANSWERED",
      id: { notIn: historyRaw.map((q) => q.id) },
      OR: [
        { id: { in: unread.map((r) => r.questionId) } },
        ...(since && !Number.isNaN(since.getTime()) ? [{ createdAt: { gte: since } }] : []),
      ],
    },
    include: questionInclude,
    orderBy: { createdAt: "desc" },
  });
  const history = [...historyRaw, ...older].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  return NextResponse.json({
    unreadReactionIds: unread.map((r) => r.id),
    room: {
      id: room.id,
      name: room.name,
      archived,
      inviteCode: room.playerBId ? null : room.inviteCode,
    },
    me: { id: session.userId, username: session.username },
    opponent: opponent ? { id: opponent.id, username: opponent.username } : null,
    isMyTurnToAsk:
      !archived && !pending && room.playerBId !== null && room.currentAskerId === session.userId,
    awaitingMyAnswer: !archived && Boolean(pending && pending.askerId !== session.userId),
    pendingQuestion: pending ? serializeQuestionForViewer(pending, session.userId) : null,
    history: history.map((q) => serializeQuestionForViewer(q, session.userId)),
  });
}
