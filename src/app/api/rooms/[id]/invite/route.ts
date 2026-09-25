import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { serializable, mutationError } from "@/lib/transaction";
import { generateInviteCode } from "@/lib/codes";
import { findRoomForMember } from "@/lib/rooms";

/** Issues a fresh invite code, which invalidates the previous link. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  try {
    return await serializable(async (tx) => {
      const { id } = await params;
      const room = await findRoomForMember(id, session.userId, tx);
      if (!room) {
        return NextResponse.json({ error: "Raum nicht gefunden" }, { status: 404 });
      }
      if (room.playerBId) {
        return NextResponse.json({ error: "Dieser Raum ist bereits vollständig" }, { status: 409 });
      }

      const updated = await tx.room.update({
        where: { id: room.id },
        data: { inviteCode: generateInviteCode() },
      });

      return NextResponse.json({ inviteCode: updated.inviteCode });
    });
  } catch (error) {
    return mutationError(error);
  }
}
