import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import {
  getOrInitGameState,
  loadQuestionWithRelations,
  serializeQuestionForViewer,
  MAX_OPTIONS,
  MIN_OPTIONS,
  MAX_TEXT_LENGTH,
} from "@/lib/game";

const askSchema = z
  .object({
    type: z.enum(["MULTIPLE_CHOICE", "TEXT"]),
    text: z.string().trim().min(1, "Frage darf nicht leer sein").max(MAX_TEXT_LENGTH),
    options: z
      .array(z.string().trim().min(1).max(100))
      .min(MIN_OPTIONS)
      .max(MAX_OPTIONS)
      .optional(),
    askerAnswer: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
  })
  .superRefine((data, ctx) => {
    if (data.type === "MULTIPLE_CHOICE") {
      if (!data.options) {
        ctx.addIssue({ code: "custom", message: "Multiple-Choice-Fragen benötigen Optionen" });
        return;
      }
      const index = Number(data.askerAnswer);
      if (!Number.isInteger(index) || index < 0 || index >= data.options.length) {
        ctx.addIssue({ code: "custom", message: "Ungültige Antwortoption" });
      }
    }
  });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const parsed = askSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Ungültige Eingabe" },
      { status: 400 }
    );
  }

  const playerCount = await prisma.user.count();
  if (playerCount < 2) {
    return NextResponse.json(
      { error: "Warte, bis sich der zweite Spieler registriert hat" },
      { status: 400 }
    );
  }

  const existingPending = await prisma.question.findFirst({ where: { status: "PENDING" } });
  if (existingPending) {
    return NextResponse.json(
      { error: "Es gibt bereits eine offene Frage, die zuerst beantwortet werden muss" },
      { status: 409 }
    );
  }

  const gameState = await getOrInitGameState();
  if (gameState.currentAskerId !== session.userId) {
    return NextResponse.json({ error: "Du bist nicht am Zug" }, { status: 403 });
  }

  const { type, text, options, askerAnswer } = parsed.data;

  const question = await prisma.question.create({
    data: {
      type,
      text,
      options: type === "MULTIPLE_CHOICE" ? JSON.stringify(options) : null,
      askerAnswer,
      askerId: session.userId,
    },
  });

  const withRelations = await loadQuestionWithRelations(question.id);
  return NextResponse.json(serializeQuestionForViewer(withRelations!, session.userId));
}
