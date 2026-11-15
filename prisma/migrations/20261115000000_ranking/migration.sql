-- Additive release migration: a new question type for ranking the options.
-- Existing questions keep their type.
ALTER TYPE "QuestionType" ADD VALUE 'RANKING';
