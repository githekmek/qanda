import { z } from "zod";
import type { QuestionDraft as DraftRow } from "@prisma/client";
import { MAX_NOTE_LENGTH, MAX_OPTION_LENGTH, MAX_OPTIONS } from "@/lib/questionLimits";
import { MAX_TEXT_LENGTH } from "@/lib/game";
import type { QuestionDraft } from "@/types/game";

export const MAX_DRAFTS_PER_ROOM = 50;

// Drafts may be incomplete: options and the own answer can still be empty.
export const draftSchema = z.object({
  type: z.enum(["MULTIPLE_CHOICE", "MULTIPLE_SELECT", "TEXT"]),
  text: z.string().trim().min(1, "Bitte zuerst eine Frage eingeben").max(MAX_TEXT_LENGTH),
  options: z.array(z.string().max(MAX_OPTION_LENGTH)).max(MAX_OPTIONS).optional(),
  askerAnswer: z.string().max(MAX_TEXT_LENGTH).default(""),
  askerNote: z.string().max(MAX_NOTE_LENGTH).default(""),
}).strict();

export function draftData(data: z.infer<typeof draftSchema>) {
  return {
    type: data.type,
    text: data.text,
    options: data.type === "TEXT" ? null : JSON.stringify(data.options ?? []),
    askerAnswer: data.askerAnswer,
    askerNote: data.askerNote,
  };
}

export function serializeDraft(draft: DraftRow): QuestionDraft {
  return {
    id: draft.id,
    type: draft.type,
    text: draft.text,
    options: draft.options ? (JSON.parse(draft.options) as string[]) : null,
    askerAnswer: draft.askerAnswer,
    askerNote: draft.askerNote,
    updatedAt: draft.updatedAt.toISOString(),
  };
}
