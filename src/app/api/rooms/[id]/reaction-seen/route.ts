import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { findRoomForMember } from "@/lib/rooms";
import { serializable, mutationError } from "@/lib/transaction";

const schema = z.object({ reactionIds: z.array(z.string().min(1).max(128)).max(100) });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  const { id } = await params;
  try {
    return await serializable(async (tx) => {
      if (!await findRoomForMember(id, session.userId, tx)) {
        return NextResponse.json({ error: "Raum nicht gefunden" }, { status: 404 });
      }
      const visit = await tx.roomReactionVisit.findUnique({
        where: { userId_roomId: { userId: session.userId, roomId: id } },
      });
      // Snapshot exact existing IDs, never a global time watermark. Concurrent new
      // reactions not in this snapshot remain unread, including on older questions.
      const reactions = await tx.reaction.findMany({
        where: {
          question: { roomId: id, status: "ANSWERED" },
          authorId: { not: session.userId },
          ...(visit ? { id: { in: parsed.data.reactionIds } } : {}),
        },
        select: { id: true },
      });
      if (!visit) await tx.roomReactionVisit.create({ data: { userId: session.userId, roomId: id } });
      await tx.reactionRead.createMany({
        data: reactions.map((r) => ({ userId: session.userId, reactionId: r.id })),
        skipDuplicates: true,
      });
      return NextResponse.json({ ok: true });
    });
  } catch (error) {
    return mutationError(error);
  }
}
