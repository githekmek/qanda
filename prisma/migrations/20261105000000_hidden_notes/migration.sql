-- Additive release migration: existing users, rooms, questions, answers,
-- comments and drafts remain unchanged; old rounds simply have no note.

ALTER TABLE "Question" ADD COLUMN "askerNote" TEXT;
ALTER TABLE "Answer" ADD COLUMN "note" TEXT;
ALTER TABLE "QuestionDraft" ADD COLUMN "askerNote" TEXT NOT NULL DEFAULT '';
