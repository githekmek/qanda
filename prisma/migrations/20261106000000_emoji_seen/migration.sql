-- Additive release migration: emoji reactions get a "seen" timestamp so the
-- comment author can be told about new ones. Existing reactions count as seen.

ALTER TABLE "ReactionEmoji" ADD COLUMN "seenAt" TIMESTAMP(3);
UPDATE "ReactionEmoji" SET "seenAt" = "createdAt";
