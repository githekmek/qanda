-- Preserve all existing accounts, hashes, sessions and game data.
ALTER TABLE "User" ADD COLUMN "email" TEXT,
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3),
  ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "RecoveryToken" (
  "tokenHash" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "sessionVersion" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RecoveryToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RecoveryToken_userId_purpose_idx" ON "RecoveryToken"("userId", "purpose");
CREATE INDEX "RecoveryToken_expiresAt_idx" ON "RecoveryToken"("expiresAt");
