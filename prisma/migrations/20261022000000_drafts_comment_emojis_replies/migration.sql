-- Additive release migration: existing users, sessions, rooms, questions,
-- answers, comments, read receipts and notifications remain unchanged.

ALTER TABLE "Reaction" ADD COLUMN "replyToId" TEXT;

ALTER TABLE "Reaction"
  ADD CONSTRAINT "Reaction_replyToId_fkey"
  FOREIGN KEY ("replyToId") REFERENCES "Reaction"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ReactionEmoji" (
  "reactionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "emoji" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ReactionEmoji_pkey" PRIMARY KEY ("reactionId", "userId", "emoji")
);

CREATE INDEX "ReactionEmoji_userId_idx" ON "ReactionEmoji"("userId");

ALTER TABLE "ReactionEmoji"
  ADD CONSTRAINT "ReactionEmoji_reactionId_fkey"
  FOREIGN KEY ("reactionId") REFERENCES "Reaction"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReactionEmoji"
  ADD CONSTRAINT "ReactionEmoji_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "QuestionDraft" (
  "id" TEXT NOT NULL,
  "type" "QuestionType" NOT NULL,
  "text" TEXT NOT NULL,
  "options" TEXT,
  "askerAnswer" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "roomId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,

  CONSTRAINT "QuestionDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "QuestionDraft_roomId_userId_updatedAt_idx"
  ON "QuestionDraft"("roomId", "userId", "updatedAt");
CREATE INDEX "QuestionDraft_userId_idx" ON "QuestionDraft"("userId");

ALTER TABLE "QuestionDraft"
  ADD CONSTRAINT "QuestionDraft_roomId_fkey"
  FOREIGN KEY ("roomId") REFERENCES "Room"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuestionDraft"
  ADD CONSTRAINT "QuestionDraft_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
