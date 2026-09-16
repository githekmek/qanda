import { prisma } from "@/lib/db";

export const MAX_ROOMS_PER_USER = 5;

export type RoomWithPlayers = NonNullable<Awaited<ReturnType<typeof findRoomForMember>>>;

/**
 * Loads a room only if the given user is one of its two players. Every
 * room-scoped endpoint goes through here, so a stranger holding a room id
 * can never read the questions or answers inside it.
 */
export async function findRoomForMember(roomId: string, userId: string) {
  const room = await prisma.room.findFirst({
    where: {
      id: roomId,
      OR: [{ playerAId: userId }, { playerBId: userId }],
    },
    include: { playerA: true, playerB: true },
  });

  return room;
}

export function opponentOf(room: RoomWithPlayers, userId: string) {
  return room.playerAId === userId ? room.playerB : room.playerA;
}

/** Archived rooms stay readable but no longer occupy one of the player's slots. */
export async function countActiveRooms(userId: string) {
  return prisma.room.count({
    where: {
      archivedAt: null,
      OR: [{ playerAId: userId }, { playerBId: userId }],
    },
  });
}

export async function hasFreeRoomSlot(userId: string) {
  return (await countActiveRooms(userId)) < MAX_ROOMS_PER_USER;
}
