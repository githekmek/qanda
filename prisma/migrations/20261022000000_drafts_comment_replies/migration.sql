-- Additive only: preserve all users, sessions, rooms, game state and comments.
ALTER TABLE "Reaction" ADD COLUMN "replyToId" TEXT;
CREATE INDEX "Reaction_replyToId_idx" ON "Reaction"("replyToId");
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "Reaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "QuestionDraft" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "payload" TEXT NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "QuestionDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "QuestionDraft_userId_updatedAt_idx" ON "QuestionDraft"("userId", "updatedAt");
CREATE TABLE "CommentEmoji" (
  "reactionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  PRIMARY KEY ("reactionId", "userId", "emoji"),
  CONSTRAINT "CommentEmoji_reactionId_fkey" FOREIGN KEY ("reactionId") REFERENCES "Reaction"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CommentEmoji_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "CommentEmoji_userId_idx" ON "CommentEmoji"("userId");
