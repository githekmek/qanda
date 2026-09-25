import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializable, mutationError } from "@/lib/transaction";
import { countActiveRooms, MAX_ROOMS_PER_USER } from "@/lib/rooms";

/** What the invited person sees before deciding to join. */
export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;

  const room = await prisma.room.findUnique({
    where: { inviteCode: code },
    include: { playerA: { select: { id: true, username: true } } },
  });

  if (!room) {
    return NextResponse.json({ error: "Diese Einladung ist ungültig" }, { status: 404 });
  }
  if (room.playerBId) {
    return NextResponse.json({ error: "Dieser Raum ist bereits vollständig" }, { status: 409 });
  }

  return NextResponse.json({
    roomName: room.name,
    invitedBy: room.playerA.username,
  });
}

export async function POST(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  try {
    return await serializable(async (tx) => {
      const { code } = await params;

      const room = await tx.room.findUnique({ where: { inviteCode: code } });
      if (!room) {
        return NextResponse.json({ error: "Diese Einladung ist ungültig" }, { status: 404 });
      }
      if (room.playerAId === session.userId) {
        return NextResponse.json(
          { error: "Das ist dein eigener Raum – schicke den Link deinem Mitspieler" },
          { status: 400 }
        );
      }
      if (room.playerBId) {
        return NextResponse.json(
          { error: room.playerBId === session.userId ? "Du bist bereits in diesem Raum" : "Dieser Raum ist bereits vollständig" },
          { status: 409 }
        );
      }

      if ((await countActiveRooms(session.userId, tx)) >= MAX_ROOMS_PER_USER) {
        return NextResponse.json(
          {
            error: `Du bist bereits in ${MAX_ROOMS_PER_USER} aktiven Räumen. Archiviere einen, um beitreten zu können.`,
          },
          { status: 409 }
        );
      }

      // Only claim the seat if it is still empty, so two people opening the same
      // link cannot both join.
      const claimed = await tx.room.updateMany({
        where: { id: room.id, inviteCode: code, playerBId: null },
        data: { playerBId: session.userId },
      });

      if (claimed.count === 0) {
        return NextResponse.json({ error: "Dieser Raum ist bereits vollständig" }, { status: 409 });
      }

      return NextResponse.json({ roomId: room.id });
    });
  } catch (error) {
    return mutationError(error);
  }
}
