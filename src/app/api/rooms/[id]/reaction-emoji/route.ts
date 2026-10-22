import { rejectForeignOrigin } from "@/lib/requestOrigin";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { findRoomForMember } from "@/lib/rooms";
import { serializable, mutationError } from "@/lib/transaction";
import { COMMENT_EMOJIS } from "@/lib/commentEmojis";
const schema = z.object({ reactionId: z.string().min(1).max(64), emoji: z.enum(COMMENT_EMOJIS), active: z.boolean() }).strict();
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const rejected = rejectForeignOrigin(request);
  if (rejected) return rejected;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Eingabe" }, { status: 400 });
  const { id } = await params;
  try {
    return await serializable(async (tx) => {
      const room = await findRoomForMember(id, session.userId, tx);
      if (!room) return NextResponse.json({ error: "Raum nicht gefunden" }, { status: 404 });
      if (room.archivedAt) return NextResponse.json({ error: "Dieser Raum ist archiviert" }, { status: 409 });
      const { reactionId, emoji, active } = parsed.data;
      const comment = await tx.reaction.findFirst({ where: { id: reactionId, question: { roomId: id, status: "ANSWERED" } } });
      if (!comment) return NextResponse.json({ error: "Kommentar nicht gefunden" }, { status: 404 });
      const key = { reactionId, userId: session.userId, emoji };
      if (active) await tx.commentEmoji.upsert({ where: { reactionId_userId_emoji: key }, create: key, update: {} });
      else await tx.commentEmoji.deleteMany({ where: key });
      return NextResponse.json({ ok: true });
    });
  } catch (error) { return mutationError(error); }
}
