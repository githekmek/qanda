import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { MAX_PLAYERS } from "@/lib/game";

export async function GET() {
  const session = await getSession();
  const playerCount = await prisma.user.count();

  return NextResponse.json({
    user: session ? { id: session.userId, username: session.username } : null,
    playerCount,
    registrationOpen: playerCount < MAX_PLAYERS,
  });
}
