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

  const historyRaw = await prisma.question.findMany({
    where: { roomId: room.id, status: "ANSWERED" },
    include: questionInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
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
    history: historyRaw.map((q) => serializeQuestionForViewer(q, session.userId)),
  });
}
