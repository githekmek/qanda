-- Additive release migration: existing users, sessions, rooms, questions,
-- answers, reactions and queued notifications remain unchanged.

ALTER TABLE "Question" ADD COLUMN "parentQuestionId" TEXT;

CREATE UNIQUE INDEX "Question_parentQuestionId_key" ON "Question"("parentQuestionId");

ALTER TABLE "Question"
  ADD CONSTRAINT "Question_parentQuestionId_fkey"
  FOREIGN KEY ("parentQuestionId") REFERENCES "Question"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Notification"
  ADD COLUMN "channel" TEXT NOT NULL DEFAULT 'email';

DROP INDEX IF EXISTS "Notification_userId_kind_idx";
CREATE INDEX "Notification_userId_kind_channel_idx"
  ON "Notification"("userId", "kind", "channel");

CREATE TABLE "PushSubscription" (
  "id" TEXT NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "notifyTurn" BOOLEAN NOT NULL DEFAULT false,
  "notifyComments" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,

  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key"
  ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_idx"
  ON "PushSubscription"("userId");

ALTER TABLE "PushSubscription"
  ADD CONSTRAINT "PushSubscription_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
