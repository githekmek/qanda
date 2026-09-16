"use client";

import { useState } from "react";
import type { PublicQuestion } from "@/types/game";

const MAX_TEXT_LENGTH = 255;

export default function AnswerForm({
  roomId,
  question,
  onSubmitted,
}: {
  roomId: string;
  question: PublicQuestion;
  onSubmitted: () => void;
}) {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let value: string;
    if (question.type === "MULTIPLE_CHOICE") {
      if (selectedOption === null) {
        setError("Bitte eine Option auswählen");
        return;
      }
      value = String(selectedOption);
    } else {
      if (!textAnswer.trim()) {
        setError("Bitte eine Antwort eingeben");
        return;
      }
      value = textAnswer.trim();
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Etwas ist schiefgelaufen");
        return;
      }
      setSelectedOption(null);
      setTextAnswer("");
      onSubmitted();
    } catch {
      setError("Verbindung zum Server fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <h2 className="text-lg font-semibold">
        Frage von {question.asker.username}
      </h2>
      <p className="text-base">{question.text}</p>

      {question.type === "MULTIPLE_CHOICE" && question.options ? (
        <div className="flex flex-col gap-2">
          {question.options.map((option, index) => (
            <label
              key={index}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              <input
                type="radio"
                name="answer"
                checked={selectedOption === index}
                onChange={() => setSelectedOption(index)}
              />
              {option}
            </label>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <input
            type="text"
            required
            maxLength={MAX_TEXT_LENGTH}
            value={textAnswer}
            onChange={(e) => setTextAnswer(e.target.value)}
            placeholder="Deine Antwort"
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
          />
          <span className="text-right text-xs text-zinc-400">
            {textAnswer.length}/{MAX_TEXT_LENGTH}
          </span>
        </div>
      )}

      <p className="text-xs text-zinc-400">
        Die Antwort von {question.asker.username} siehst du, sobald du selbst geantwortet hast.
      </p>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-zinc-900 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {loading ? "Wird gesendet…" : "Antwort abschicken"}
      </button>
    </form>
  );
}
