import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateInviteCode } from "@/lib/codes";
import { findRoomForMember } from "@/lib/rooms";

/** Issues a fresh invite code, which invalidates the previous link. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { id } = await params;
  const room = await findRoomForMember(id, session.userId);
  if (!room) {
    return NextResponse.json({ error: "Raum nicht gefunden" }, { status: 404 });
  }
  if (room.playerBId) {
    return NextResponse.json({ error: "Dieser Raum ist bereits vollständig" }, { status: 409 });
  }

  const updated = await prisma.room.update({
    where: { id: room.id },
    data: { inviteCode: generateInviteCode() },
  });

  return NextResponse.json({ inviteCode: updated.inviteCode });
}
