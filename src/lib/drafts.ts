import { z } from "zod";
export const draftPayloadSchema = z.object({
  type: z.enum(["TEXT", "MULTIPLE_CHOICE"]),
  text: z.string().max(255),
  options: z.array(z.string().max(100)).min(2).max(8),
  multiple: z.boolean(),
  selectedOptions: z.array(z.number().int().min(0).max(7)).max(8),
  selectedOption: z.number().int().min(0).max(7).nullable(),
  freeTextAnswer: z.string().max(255),
  parent: z.object({ id: z.string().max(64), text: z.string().max(255), roomId: z.string().max(64) }).nullable(),
}).strict();
export type DraftPayload = z.infer<typeof draftPayloadSchema>;
export type Draft = { id: string; version: number; payload: DraftPayload; updatedAt: string };
