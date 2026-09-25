import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { serializable, mutationError } from "@/lib/transaction";
import { countActiveRooms, findRoomForMember, MAX_ROOMS_PER_USER } from "@/lib/rooms";

const archiveSchema = z.object({
  archived: z.boolean(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = archiveSchema.safeParse(body);
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

      if (!parsed.data.archived && room.archivedAt) {
        const playerIds = [room.playerAId, room.playerBId].filter((value): value is string => value !== null);
        for (const playerId of playerIds) {
          if ((await countActiveRooms(playerId, tx)) >= MAX_ROOMS_PER_USER) {
            return NextResponse.json(
              { error: "Einer der Spieler hat bereits fünf aktive Räume. Bitte zuerst einen anderen Raum archivieren." },
              { status: 409 }
            );
          }
        }
      }

      await tx.room.update({
        where: { id: room.id },
        data: { archivedAt: parsed.data.archived ? new Date() : null },
      });

      return NextResponse.json({ archived: parsed.data.archived });
    });
  } catch (error) {
    return mutationError(error);
  }
}
