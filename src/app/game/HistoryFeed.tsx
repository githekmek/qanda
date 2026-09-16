"use client";

import { useState } from "react";
import type { PublicQuestion } from "@/types/game";

const MAX_REACTION_LENGTH = 500;

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function AnswerRow({
  label,
  text,
  matched,
}: {
  label: string;
  text: string;
  matched?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900">
      <span>
        <span className="font-medium text-zinc-500">{label}:</span> {text}
      </span>
      {matched !== undefined && (
        <span className={matched ? "text-green-600 dark:text-green-400" : "text-zinc-400"}>
          {matched ? "✓ gleich" : ""}
        </span>
      )}
    </div>
  );
}

function ReactionComposer({
  questionId,
  onSubmitted,
}: {
  questionId: string;
  onSubmitted: () => void;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/game/reaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, text: text.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Etwas ist schiefgelaufen");
        return;
      }
      setText("");
      onSubmitted();
    } catch {
      setError("Verbindung zum Server fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          maxLength={MAX_REACTION_LENGTH}
          onChange={(e) => setText(e.target.value)}
          placeholder="Etwas dazu sagen…"
          className="flex-1 rounded-lg border border-zinc-200 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-800"
        />
        <button
          type="submit"
          disabled={loading || !text.trim()}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Senden
        </button>
      </div>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}

export default function HistoryFeed({
  history,
  meId,
  onReacted,
}: {
  history: PublicQuestion[];
  meId: string;
  onReacted: () => void;
}) {
  if (history.length === 0) {
    return (
      <p className="text-sm text-zinc-400">
        Noch keine beantworteten Fragen. Die erste Runde startet, sobald jemand fragt.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {history.map((q) => {
        const askerAnswerText =
          q.type === "MULTIPLE_CHOICE" && q.options && q.askerAnswer !== undefined
            ? q.options[Number(q.askerAnswer)]
            : q.askerAnswer;
        const responderAnswerText =
          q.type === "MULTIPLE_CHOICE" && q.options && q.answer
            ? q.options[Number(q.answer.value)]
            : q.answer?.value;

        return (
          <div
            key={q.id}
            className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-zinc-400">
                {q.type === "MULTIPLE_CHOICE" ? "Multiple Choice" : "Freitext"} · {formatTime(q.createdAt)}
              </span>
            </div>
            <p className="font-medium">
              {q.asker.username} fragt: {q.text}
            </p>
            <div className="flex flex-col gap-1.5">
              <AnswerRow
                label={q.asker.username}
                text={askerAnswerText ?? ""}
                matched={q.isMatch}
              />
              {q.answer && (
                <AnswerRow
                  label={q.answer.responder.username}
                  text={responderAnswerText ?? ""}
                  matched={q.isMatch}
                />
              )}
            </div>

            {q.reactions.length > 0 && (
              <div className="flex flex-col gap-1.5 border-l-2 border-zinc-100 pl-3 dark:border-zinc-800">
                {q.reactions.map((reaction) => (
                  <p key={reaction.id} className="text-sm">
                    <span
                      className={`font-medium ${
                        reaction.author.id === meId ? "text-zinc-500" : "text-zinc-800 dark:text-zinc-200"
                      }`}
                    >
                      {reaction.author.username}:
                    </span>{" "}
                    <span className="text-zinc-600 dark:text-zinc-300">{reaction.text}</span>
                  </p>
                ))}
              </div>
            )}

            <ReactionComposer questionId={q.id} onSubmitted={onReacted} />
          </div>
        );
      })}
    </div>
  );
}
