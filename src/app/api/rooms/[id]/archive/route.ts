import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { countActiveRooms, findRoomForMember, MAX_ROOMS_PER_USER } from "@/lib/rooms";

const archiveSchema = z.object({
  archived: z.boolean(),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const { id } = await params;
  const room = await findRoomForMember(id, session.userId);
  if (!room) {
    return NextResponse.json({ error: "Raum nicht gefunden" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = archiveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  }

  if (!parsed.data.archived && (await countActiveRooms(session.userId)) >= MAX_ROOMS_PER_USER) {
    return NextResponse.json(
      {
        error: `Du bist bereits in ${MAX_ROOMS_PER_USER} aktiven Räumen. Archiviere einen anderen, um diesen zurückzuholen.`,
      },
      { status: 409 }
    );
  }

  await prisma.room.update({
    where: { id: room.id },
    data: { archivedAt: parsed.data.archived ? new Date() : null },
  });

  return NextResponse.json({ archived: parsed.data.archived });
}
