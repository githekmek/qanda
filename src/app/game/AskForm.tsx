"use client";

import { useState } from "react";
import type { QuestionType } from "@/types/game";

const MAX_OPTIONS = 5;
const MIN_OPTIONS = 2;
const MAX_TEXT_LENGTH = 255;

export default function AskForm({ onSubmitted }: { onSubmitted: () => void }) {
  const [type, setType] = useState<QuestionType>("MULTIPLE_CHOICE");
  const [text, setText] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [freeTextAnswer, setFreeTextAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function updateOption(index: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  }

  function addOption() {
    setOptions((prev) => (prev.length < MAX_OPTIONS ? [...prev, ""] : prev));
  }

  function removeOption(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index));
    setSelectedOption((prev) => (prev === index ? null : prev !== null && prev > index ? prev - 1 : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!text.trim()) {
      setError("Bitte eine Frage eingeben");
      return;
    }

    let askerAnswer: string;
    const trimmedOptions = options.map((o) => o.trim());

    if (type === "MULTIPLE_CHOICE") {
      if (trimmedOptions.some((o) => !o)) {
        setError("Bitte alle Optionen ausfüllen");
        return;
      }
      if (selectedOption === null) {
        setError("Bitte deine eigene Antwort auswählen");
        return;
      }
      askerAnswer = String(selectedOption);
    } else {
      if (!freeTextAnswer.trim()) {
        setError("Bitte deine eigene Antwort eingeben");
        return;
      }
      askerAnswer = freeTextAnswer.trim();
    }

    setLoading(true);
    try {
      const res = await fetch("/api/game/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          text: text.trim(),
          options: type === "MULTIPLE_CHOICE" ? trimmedOptions : undefined,
          askerAnswer,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Etwas ist schiefgelaufen");
        return;
      }
      setText("");
      setOptions(["", ""]);
      setSelectedOption(null);
      setFreeTextAnswer("");
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
      <h2 className="text-lg font-semibold">Du bist dran: Stelle eine Frage</h2>

      <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setType("MULTIPLE_CHOICE")}
          className={`rounded-md py-1.5 text-sm font-medium transition-colors ${
            type === "MULTIPLE_CHOICE"
              ? "bg-white shadow-sm dark:bg-zinc-800"
              : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          Multiple Choice
        </button>
        <button
          type="button"
          onClick={() => setType("TEXT")}
          className={`rounded-md py-1.5 text-sm font-medium transition-colors ${
            type === "TEXT"
              ? "bg-white shadow-sm dark:bg-zinc-800"
              : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          }`}
        >
          Freitext
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="question-text" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Deine Frage
        </label>
        <textarea
          id="question-text"
          required
          maxLength={MAX_TEXT_LENGTH}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          className="resize-none rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
        />
        <span className="text-right text-xs text-zinc-400">
          {text.length}/{MAX_TEXT_LENGTH}
        </span>
      </div>

      {type === "MULTIPLE_CHOICE" ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Optionen (max. {MAX_OPTIONS}) – wähle auch deine eigene Antwort
          </span>
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type="radio"
                name="asker-answer"
                checked={selectedOption === index}
                onChange={() => setSelectedOption(index)}
                aria-label={`Option ${index + 1} als eigene Antwort auswählen`}
              />
              <input
                type="text"
                value={option}
                maxLength={100}
                onChange={(e) => updateOption(index, e.target.value)}
                placeholder={`Option ${index + 1}`}
                className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
              />
              {options.length > MIN_OPTIONS && (
                <button
                  type="button"
                  onClick={() => removeOption(index)}
                  className="text-xs text-zinc-400 hover:text-red-500"
                  aria-label={`Option ${index + 1} entfernen`}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {options.length < MAX_OPTIONS && (
            <button
              type="button"
              onClick={addOption}
              className="self-start text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
            >
              + Option hinzufügen
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <label htmlFor="own-answer" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Deine eigene Antwort
          </label>
          <input
            id="own-answer"
            type="text"
            required
            maxLength={MAX_TEXT_LENGTH}
            value={freeTextAnswer}
            onChange={(e) => setFreeTextAnswer(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
          />
          <span className="text-right text-xs text-zinc-400">
            {freeTextAnswer.length}/{MAX_TEXT_LENGTH}
          </span>
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-zinc-900 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {loading ? "Wird gesendet…" : "Frage stellen"}
      </button>
    </form>
  );
}
