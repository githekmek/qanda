-- Additive only: no existing game data is rewritten or removed.
CREATE TABLE "RoomReactionVisit" (
  "userId" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RoomReactionVisit_pkey" PRIMARY KEY ("userId", "roomId"),
  CONSTRAINT "RoomReactionVisit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RoomReactionVisit_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "ReactionRead" (
  "userId" TEXT NOT NULL,
  "reactionId" TEXT NOT NULL,
  "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReactionRead_pkey" PRIMARY KEY ("userId", "reactionId"),
  CONSTRAINT "ReactionRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReactionRead_reactionId_fkey" FOREIGN KEY ("reactionId") REFERENCES "Reaction"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RoomReactionVisit_roomId_idx" ON "RoomReactionVisit"("roomId");
CREATE INDEX "ReactionRead_reactionId_idx" ON "ReactionRead"("reactionId");
CREATE INDEX "Reaction_questionId_createdAt_idx" ON "Reaction"("questionId", "createdAt");
