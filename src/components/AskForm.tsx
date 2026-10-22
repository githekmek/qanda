"use client";

import { useEffect, useRef, useState } from "react";
import type { QuestionDraft, QuestionType } from "@/types/game";
import {
  CATEGORIES,
  CATEGORY_LABELS,
  drawRandomQuestion,
  type QuestionCategory,
} from "@/lib/questionCatalog";

import { MAX_OPTIONS, MIN_OPTIONS } from "@/lib/questionLimits";
const MAX_TEXT_LENGTH = 255;

// Only the selected state carries colour; unselected stays grey, so the two are
// told apart by the checkbox, the tint and the text colour at once.
// Written out in full because Tailwind cannot see dynamically built class names.
const CATEGORY_STYLES: Record<QuestionCategory, { chip: string; box: string }> = {
  LOCKER: {
    chip: "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-600 dark:bg-emerald-950 dark:text-emerald-100",
    box: "border-emerald-500 bg-emerald-500 text-white",
  },
  SPICY: {
    chip: "border-rose-500 bg-rose-50 text-rose-900 dark:border-rose-600 dark:bg-rose-950 dark:text-rose-100",
    box: "border-rose-500 bg-rose-500 text-white",
  },
  TIEF: {
    chip: "border-indigo-500 bg-indigo-50 text-indigo-900 dark:border-indigo-600 dark:bg-indigo-950 dark:text-indigo-100",
    box: "border-indigo-500 bg-indigo-500 text-white",
  },
};

const INACTIVE_CHIP =
  "border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-400";
const INACTIVE_BOX = "border-zinc-400 bg-white dark:border-zinc-500 dark:bg-transparent";

/** Reads a draft's possibly incomplete own answer back into the form's selection state. */
function draftSelection(draft: QuestionDraft) {
  const count = draft.options?.length ?? 0;
  if (draft.type === "MULTIPLE_SELECT") {
    try {
      const parsed: unknown = JSON.parse(draft.askerAnswer || "[]");
      return Array.isArray(parsed)
        ? parsed.filter((i): i is number => Number.isInteger(i) && i >= 0 && i < count)
        : [];
    } catch { return []; }
  }
  if (draft.type === "MULTIPLE_CHOICE" && draft.askerAnswer !== "") {
    const index = Number(draft.askerAnswer);
    return Number.isInteger(index) && index >= 0 && index < count ? [index] : [];
  }
  return [];
}

export default function AskForm({
  roomId,
  onSubmitted,
  askedQuestions,
  followUpTo,
  onCancelFollowUp,
  canSend = true,
}: {
  roomId: string;
  onSubmitted: () => void;
  askedQuestions: string[];
  followUpTo?: { id: string; text: string } | null;
  onCancelFollowUp?: () => void;
  // False while the opponent is on turn: questions can only be prepared as drafts.
  canSend?: boolean;
}) {
  const [type, setType] = useState<QuestionType>("TEXT");
  const [categories, setCategories] = useState<QuestionCategory[]>([...CATEGORIES]);
  const [text, setText] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState<number[]>([]);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [freeTextAnswer, setFreeTextAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [drafts, setDrafts] = useState<QuestionDraft[]>([]);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftStatus, setDraftStatus] = useState<string | null>(null);
  const questionFieldRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/rooms/${roomId}/drafts`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((list: QuestionDraft[]) => { if (!cancelled) setDrafts(list); })
      .catch(() => { /* Drafts are optional; the form stays usable without them. */ });
    return () => { cancelled = true; };
  }, [roomId]);

  function resetForm() {
    setText("");
    setOptions(["", ""]);
    setSelectedOption(null);
    setSelectedOptions([]);
    setFreeTextAnswer("");
    setDraftId(null);
  }

  function loadDraft(draft: QuestionDraft) {
    const selection = draftSelection(draft);
    setType(draft.type === "TEXT" ? "TEXT" : "MULTIPLE_CHOICE");
    setMultiple(draft.type === "MULTIPLE_SELECT");
    setText(draft.text);
    const loaded = draft.options ?? [];
    setOptions(loaded.length >= MIN_OPTIONS ? loaded : [...loaded, ...Array(MIN_OPTIONS - loaded.length).fill("")]);
    setSelectedOptions(draft.type === "MULTIPLE_SELECT" ? selection : []);
    setSelectedOption(draft.type === "MULTIPLE_CHOICE" ? selection[0] ?? null : null);
    setFreeTextAnswer(draft.type === "TEXT" ? draft.askerAnswer : "");
    setDraftId(draft.id);
    setDraftsOpen(false);
    setError(null);
    setDraftStatus(null);
    questionFieldRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    questionFieldRef.current?.focus();
  }

  async function saveDraft() {
    setError(null);
    setDraftStatus(null);
    if (!text.trim()) {
      setError("Bitte zuerst eine Frage eingeben");
      return;
    }
    const draftType = type === "MULTIPLE_CHOICE" && multiple ? "MULTIPLE_SELECT" : type;
    const payload = {
      type: draftType,
      text: text.trim(),
      options: type === "MULTIPLE_CHOICE" ? options.map((o) => o.trim()) : undefined,
      askerAnswer: draftType === "TEXT" ? freeTextAnswer.trim()
        : draftType === "MULTIPLE_SELECT" ? (selectedOptions.length ? JSON.stringify([...selectedOptions].sort((a, b) => a - b)) : "")
        : selectedOption === null ? "" : String(selectedOption),
    };
    setLoading(true);
    try {
      const res = await fetch(draftId ? `/api/rooms/${roomId}/drafts/${draftId}` : `/api/rooms/${roomId}/drafts`, {
        method: draftId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Entwurf konnte nicht gespeichert werden");
        return;
      }
      const saved = data as QuestionDraft;
      setDrafts((previous) => [saved, ...previous.filter((d) => d.id !== saved.id)]);
      setDraftId(saved.id);
      setDraftStatus("Entwurf gespeichert");
    } catch {
      setError("Verbindung zum Server fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  async function deleteDraft(id: string) {
    const res = await fetch(`/api/rooms/${roomId}/drafts/${id}`, { method: "DELETE" }).catch(() => null);
    if (!res || (!res.ok && res.status !== 404)) {
      setError("Entwurf konnte nicht gelöscht werden");
      return;
    }
    setDrafts((previous) => previous.filter((d) => d.id !== id));
    if (id === draftId) setDraftId(null);
  }

  function toggleCategory(category: QuestionCategory) {
    setCategories((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category]
    );
  }

  function drawQuestion() {
    const drawn = drawRandomQuestion(categories, askedQuestions);
    if (!drawn) return;

    setText(drawn);
    setError(null);
    // The button sits below the fields it fills, so point the eye back up there.
    questionFieldRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    questionFieldRef.current?.focus();
  }

  function updateOption(index: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)));
  }

  function addOption() {
    setOptions((prev) => (prev.length < MAX_OPTIONS ? [...prev, ""] : prev));
  }

  function removeOption(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index));
    setSelectedOptions((prev) => prev.filter((i) => i !== index).map((i) => i > index ? i - 1 : i));
    setSelectedOption((prev) => (prev === index ? null : prev !== null && prev > index ? prev - 1 : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSend) return;

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
      if (multiple ? selectedOptions.length === 0 : selectedOption === null) {
        setError("Bitte deine eigene Antwort auswählen");
        return;
      }
      askerAnswer = multiple ? JSON.stringify([...selectedOptions].sort((a, b) => a - b)) : String(selectedOption);
    } else {
      if (!freeTextAnswer.trim()) {
        setError("Bitte deine eigene Antwort eingeben");
        return;
      }
      askerAnswer = freeTextAnswer.trim();
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/rooms/${roomId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: type === "MULTIPLE_CHOICE" && multiple ? "MULTIPLE_SELECT" : type,
          text: text.trim(),
          options: type === "MULTIPLE_CHOICE" ? trimmedOptions : undefined,
          askerAnswer,
          parentQuestionId: followUpTo?.id,
          draftId: draftId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Etwas ist schiefgelaufen");
        return;
      }
      if (draftId) setDrafts((previous) => previous.filter((d) => d.id !== draftId));
      resetForm();
      onSubmitted();
    } catch {
      setError("Verbindung zum Server fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      id="question-form"
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            {!canSend ? "Frage vorbereiten" : followUpTo ? "Du bist dran: Stelle eine Folgefrage" : "Du bist dran: Stelle eine Frage"}
          </h2>
          {followUpTo && onCancelFollowUp && (
            <button type="button" onClick={onCancelFollowUp}
              className="text-sm text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200">
              Normale Frage stellen
            </button>
          )}
        </div>
        {followUpTo && (
          <p className="rounded-xl bg-indigo-50 px-3 py-2 text-sm text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100">
            Folgefrage zu: <span className="font-medium">{followUpTo.text}</span>
          </p>
        )}
        {!canSend && (
          <p className="text-sm text-zinc-500">Speichere Fragen als Entwurf und stelle sie, sobald du am Zug bist.</p>
        )}
      </div>

      {drafts.length > 0 && (
        <div className="flex flex-col gap-2">
          <button type="button" aria-expanded={draftsOpen} aria-controls="question-drafts"
            onClick={() => setDraftsOpen(!draftsOpen)}
            className="flex min-h-10 items-center gap-2 self-start rounded-lg px-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900">
            <span aria-hidden="true">{draftsOpen ? "▾" : "▸"}</span>
            Meine Entwürfe ({drafts.length})
          </button>
          <ul id="question-drafts" hidden={!draftsOpen} className="flex flex-col gap-1.5">
            {drafts.map((draft) => (
              <li key={draft.id}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${draft.id === draftId
                  ? "border-zinc-500 dark:border-zinc-400"
                  : "border-zinc-200 dark:border-zinc-800"}`}>
                <span className="min-w-0 flex-1 truncate">{draft.text}</span>
                <button type="button" onClick={() => loadDraft(draft)}
                  className="shrink-0 rounded px-2 py-1 font-medium text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800">
                  {draft.id === draftId ? "Geladen" : "Laden"}
                </button>
                <button type="button" onClick={() => deleteDraft(draft.id)}
                  aria-label={`Entwurf „${draft.text}“ löschen`}
                  className="shrink-0 rounded px-2 py-1 text-zinc-400 hover:text-red-600">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

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

      {type === "MULTIPLE_CHOICE" && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">Antwortmodus</legend>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-900">
            {[false, true].map((mode) => (
              <label key={String(mode)} className={`relative cursor-pointer rounded-md px-2 py-2 text-center text-sm font-medium focus-within:ring-2 focus-within:ring-zinc-400 ${multiple === mode ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : "text-zinc-500"}`}>
                <input className="absolute inset-0 h-full w-full cursor-pointer opacity-0" type="radio" name="answer-mode" checked={multiple === mode} onChange={() => { setMultiple(mode); setError(null); }} />
                {mode ? "Mehrere Antworten" : "Eine Antwort"}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="question-text" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Deine Frage
        </label>
        <textarea
          id="question-text"
          ref={questionFieldRef}
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
            Optionen (max. {MAX_OPTIONS}) – {multiple ? "wähle deine eigenen Antworten" : "wähle auch deine eigene Antwort"}
          </span>
          <p className="text-xs text-zinc-500">{multiple ? "Wähle eine oder mehrere Antworten." : "Wähle genau eine Antwort."}</p>
          {options.map((option, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                type={multiple ? "checkbox" : "radio"}
                name="asker-answer"
                className="h-4 w-4 shrink-0 accent-zinc-900 dark:accent-zinc-100"
                checked={multiple ? selectedOptions.includes(index) : selectedOption === index}
                onChange={() => multiple
                  ? setSelectedOptions((prev) => prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index])
                  : setSelectedOption(index)}
                aria-label={`Option ${index + 1} als eigene Antwort auswählen`}
              />
              <input
                type="text"
                value={option}
                maxLength={100}
                onChange={(e) => updateOption(index, e.target.value)}
                placeholder={`Option ${index + 1}`}
                aria-label={`Option ${index + 1}`}
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
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

      <fieldset className="flex flex-col gap-3 rounded-xl bg-zinc-50 p-4 dark:bg-zinc-900">
        <legend className="sr-only">Zufallsfrage</legend>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Keine Idee? Lass dir eine Frage vorschlagen.
        </p>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((category) => {
            const active = categories.includes(category);
            const style = CATEGORY_STYLES[category];
            return (
              <label
                key={category}
                className={`flex cursor-pointer select-none items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-within:ring-2 focus-within:ring-zinc-400 ${
                  active ? style.chip : INACTIVE_CHIP
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={active}
                  onChange={() => toggleCategory(category)}
                />
                <span
                  aria-hidden
                  className={`flex h-4 w-4 items-center justify-center rounded-sm border-2 transition-colors ${
                    active ? style.box : INACTIVE_BOX
                  }`}
                >
                  {active && (
                    <svg viewBox="0 0 12 12" className="h-3 w-3">
                      <path
                        d="M2.5 6.2 L4.7 8.5 L9.5 3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </span>
                {CATEGORY_LABELS[category]}
              </label>
            );
          })}
        </div>

        <button
          type="button"
          onClick={drawQuestion}
          disabled={categories.length === 0}
          className="rounded-lg border border-zinc-300 bg-white py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-transparent dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          {categories.length === 0 ? "Wähle mindestens eine Kategorie" : "Zufallsfrage einsetzen"}
        </button>
      </fieldset>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {draftStatus && <p role="status" className="text-sm text-green-700 dark:text-green-400">{draftStatus}</p>}

      <div className={`grid gap-2 ${canSend ? "grid-cols-2" : "grid-cols-1"}`}>
        <button
          type="button"
          onClick={saveDraft}
          disabled={loading}
          className="rounded-lg border border-zinc-300 py-2 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
        >
          {draftId ? "Entwurf aktualisieren" : "Als Entwurf speichern"}
        </button>
        {canSend && (
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-zinc-900 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {loading ? "Wird gesendet…" : followUpTo ? "Folgefrage stellen" : "Frage stellen"}
          </button>
        )}
      </div>
      {draftId && (
        <button type="button" onClick={() => { resetForm(); setDraftStatus(null); }}
          className="self-center text-xs text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-200">
          Neue Frage beginnen (Entwurf bleibt gespeichert)
        </button>
      )}
    </form>
  );
}
