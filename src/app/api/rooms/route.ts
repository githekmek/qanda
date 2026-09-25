import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { serializable, mutationError } from "@/lib/transaction";
import { generateInviteCode } from "@/lib/codes";
import { countActiveRooms, MAX_ROOMS_PER_USER } from "@/lib/rooms";

const createRoomSchema = z.object({
  name: z.string().trim().max(60).optional(),
});

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const rooms = await prisma.room.findMany({
    where: { OR: [{ playerAId: session.userId }, { playerBId: session.userId }] },
    include: {
      playerA: { select: { id: true, username: true } },
      playerB: { select: { id: true, username: true } },
      questions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, askerId: true, createdAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const summaries = rooms.map((room) => {
    const opponent = room.playerAId === session.userId ? room.playerB : room.playerA;
    const latest = room.questions[0] ?? null;
    const pending = latest && latest.status === "PENDING" ? latest : null;

    return {
      id: room.id,
      name: room.name,
      createdAt: room.createdAt.toISOString(),
      archived: room.archivedAt !== null,
      opponent,
      inviteCode: room.playerBId ? null : room.inviteCode,
      lastActivityAt: (latest?.createdAt ?? room.createdAt).toISOString(),
      awaitingMyAnswer: Boolean(pending && pending.askerId !== session.userId),
      isMyTurnToAsk:
        !pending && room.playerBId !== null && room.currentAskerId === session.userId,
      waitingForOpponentAnswer: Boolean(pending && pending.askerId === session.userId),
    };
  });

  return NextResponse.json({
    rooms: summaries,
    activeCount: summaries.filter((r) => !r.archived).length,
    maxRooms: MAX_ROOMS_PER_USER,
  });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createRoomSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültiger Raumname" }, { status: 400 });
  }

  try {
    return await serializable(async (tx) => {

      if ((await countActiveRooms(session.userId, tx)) >= MAX_ROOMS_PER_USER) {
        return NextResponse.json(
          {
            error: `Du bist bereits in ${MAX_ROOMS_PER_USER} aktiven Räumen. Archiviere einen, um Platz zu schaffen.`,
          },
          { status: 409 }
        );
      }

      const room = await tx.room.create({
        data: {
          name: parsed.data.name || null,
          inviteCode: generateInviteCode(),
          playerAId: session.userId,
          currentAskerId: session.userId,
        },
      });

      return NextResponse.json({ id: room.id, inviteCode: room.inviteCode });
    });
  } catch (error) {
    return mutationError(error);
  }
}
