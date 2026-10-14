ALTER TABLE "User"
  ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'standard',
  ADD COLUMN "notifyTurn" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "notifyComments" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "Notification" (
 "id" TEXT NOT NULL PRIMARY KEY,
 "eventKey" TEXT NOT NULL,
 "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "roomId" TEXT NOT NULL REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE,
 "kind" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "dueAt" TIMESTAMP(3) NOT NULL,
 "claim" TEXT,
 "lockedUntil" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00',
 "attempts" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "Notification_eventKey_key" ON "Notification"("eventKey");
CREATE INDEX "Notification_dueAt_lockedUntil_idx" ON "Notification"("dueAt", "lockedUntil");
CREATE INDEX "Notification_userId_kind_idx" ON "Notification"("userId", "kind");
