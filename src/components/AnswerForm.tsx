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
  const multiple = question.type === "MULTIPLE_SELECT";
  const choice = question.type !== "TEXT";
  const [selectedOptions, setSelectedOptions] = useState<number[]>([]);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    let value: string;
    if (choice) {
      if (multiple ? selectedOptions.length === 0 : selectedOption === null) {
        setError("Bitte eine Option auswählen");
        return;
      }
      value = multiple ? JSON.stringify([...selectedOptions].sort((a, b) => a - b)) : String(selectedOption);
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
      setSelectedOptions([]);
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
      {choice && <span className="self-start rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">{multiple ? "Mehrere Antworten" : "Eine Antwort"}</span>}
      <p className="text-base">{question.text}</p>

      {choice && question.options ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-zinc-500">{multiple ? "Wähle eine oder mehrere Antworten." : "Wähle genau eine Antwort."}</p>
          {question.options.map((option, index) => (
            <label
              key={index}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-sm focus-within:ring-2 focus-within:ring-zinc-400 ${(multiple ? selectedOptions.includes(index) : selectedOption === index) ? "border-zinc-700 bg-zinc-50 dark:border-zinc-300 dark:bg-zinc-900" : "border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"}`}
            >
              <input
                type={multiple ? "checkbox" : "radio"}
                name="answer"
                className="h-4 w-4 shrink-0 accent-zinc-900 dark:accent-zinc-100"
                checked={multiple ? selectedOptions.includes(index) : selectedOption === index}
                onChange={() => multiple
                  ? setSelectedOptions((prev) => prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index])
                  : setSelectedOption(index)}
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

      {multiple && <p className="text-xs text-zinc-500" aria-live="polite">{selectedOptions.length} {selectedOptions.length === 1 ? "Antwort ausgewählt" : "Antworten ausgewählt"}</p>}
      <p className="text-xs text-zinc-400">
        {multiple ? "Die Antworten" : "Die Antwort"} von {question.asker.username} siehst du, sobald du selbst geantwortet hast.
      </p>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-zinc-900 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {loading ? "Wird gesendet…" : multiple ? "Antworten abschicken" : "Antwort abschicken"}
      </button>
    </form>
  );
}
