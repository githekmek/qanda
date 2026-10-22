"use client";

import { useEffect, useState } from "react";
import { answerLabels, matchingAnswerPositions } from "@/lib/choiceAnswers.mjs";
import GrowingTextarea from "./GrowingTextarea";
import ReactionComment from "./ReactionComment";
import type { PublicQuestion } from "@/types/game";

const MAX_REACTION_LENGTH = 800;

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
  answers,
  matched,
  itemMatches,
}: {
  label: string;
  answers: string[];
  matched?: boolean;
  itemMatches?: boolean[];
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-900">
      <div className="min-w-0 break-words">
        <span className="font-medium text-zinc-500">{label}:</span>{" "}
        {answers.length > 1 ? <ul className="mt-1 list-disc pl-5">{answers.map((answer, index) => <li key={index}>{answer}{itemMatches?.[index] && <span className="ml-2 text-green-600 dark:text-green-400" aria-label="Von beiden gewählt">✓</span>}</li>)}</ul> : <>{answers[0]}{itemMatches?.[0] && <span className="ml-2 text-green-600 dark:text-green-400" aria-label="Von beiden gewählt">✓</span>}</>}
      </div>
      {matched !== undefined && (
        <span className={matched ? "text-green-600 dark:text-green-400" : "text-zinc-400"}>
          {matched ? "✓ gleich" : ""}
        </span>
      )}
    </div>
  );
}

function ReactionComposer({
  roomId,
  questionId,
  onSubmitted,
  replyTo,
  onCancelReply,
}: {
  roomId: string;
  questionId: string;
  onSubmitted: () => void;
  replyTo: PublicQuestion["reactions"][number] | null;
  onCancelReply: () => void;
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
      const res = await fetch(`/api/rooms/${roomId}/reaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, text: text.trim(), replyToId: replyTo?.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Etwas ist schiefgelaufen");
        return;
      }
      setText("");
      onCancelReply();
      onSubmitted();
    } catch {
      setError("Verbindung zum Server fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-1">
      {replyTo && <blockquote className="rounded-lg border-l-2 border-indigo-400 bg-indigo-50 p-3 text-sm dark:bg-indigo-950/40">
        <strong>Antwort an {replyTo.author.username}</strong>
        <p className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words">{replyTo.text}</p>
        <button type="button" onClick={onCancelReply} className="mt-2 underline">Zitat entfernen</button>
      </blockquote>}
      <div className="flex items-end gap-2">
        <GrowingTextarea
          id={`comment-input-${questionId}`}
          value={text}
          maxLength={MAX_REACTION_LENGTH}
          onChange={(e) => setText(e.target.value)}
          placeholder="Etwas dazu sagen…"
          aria-label="Kommentar schreiben"
          className="min-w-0 flex-1 rounded-lg border border-zinc-200 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-800"
        />
        <button
          type="submit"
          disabled={loading || !text.trim()}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Senden
        </button>
      </div>
      <span className="text-right text-xs text-zinc-500">{text.length}/{MAX_REACTION_LENGTH}</span>
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  );
}

export default function HistoryFeed({
  roomId,
  history,
  meId,
  readOnly,
  onReacted,
  highlighted,
  expanded,
  onToggle,
  onSeen,
  jump,
  canAskFollowUp,
  onFollowUp,
}: {
  roomId: string;
  history: PublicQuestion[];
  meId: string;
  readOnly: boolean;
  onReacted: () => void;
  highlighted: Record<string, true>;
  expanded: Record<string, boolean>;
  onToggle: (id: string, open: boolean) => void;
  onSeen: (id: string) => void;
  jump: { id: string; sequence: number } | null;
  canAskFollowUp: boolean;
  onFollowUp: (question: { id: string; text: string }) => void;
}) {
  const [replyTarget, setReplyTarget] = useState<{ questionId: string; reaction: PublicQuestion["reactions"][number] } | null>(null);
  useEffect(() => {
    if (!jump) return;
    const element = document.getElementById(`reaction-${jump.id}`);
    element?.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
    element?.focus({ preventScroll: true });
  }, [jump]);
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
        const newCount = q.reactions.filter((r) => highlighted[r.id] && r.author.id !== meId).length;
        const open = expanded[q.id] ?? newCount > 0;
        const askerAnswers = answerLabels(q.type, q.options, q.askerAnswer);
        const responderAnswers = answerLabels(q.type, q.options, q.answer?.value);

        return (
          <div
            key={q.id}
            className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wide text-zinc-400">
                {q.type === "MULTIPLE_SELECT" ? "Multiple Choice · Mehrere Antworten" : q.type === "MULTIPLE_CHOICE" ? "Multiple Choice · Eine Antwort" : "Freitext"} · {formatTime(q.createdAt)}
              </span>
            </div>
            {q.parentQuestion && (
              <p className="rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100">
                Folgefrage zu: <span className="font-medium">{q.parentQuestion.text}</span>
              </p>
            )}
            <p className="font-medium">
              {q.asker.username} fragt: {q.text}
            </p>
            <div className="flex flex-col gap-1.5">
              <AnswerRow
                label={q.asker.username}
                answers={askerAnswers}
                itemMatches={q.type === "MULTIPLE_SELECT" ? matchingAnswerPositions(q.askerAnswer, q.answer?.value, q.options?.length ?? 0) : undefined}
                matched={q.isMatch}
              />
              {q.answer && (
                <AnswerRow
                  label={q.answer.responder.username}
                  answers={responderAnswers}
                  itemMatches={q.type === "MULTIPLE_SELECT" ? matchingAnswerPositions(q.answer.value, q.askerAnswer, q.options?.length ?? 0) : undefined}
                  matched={q.isMatch}
                />
              )}
            </div>

            {canAskFollowUp && !q.hasFollowUp && (
              <button
                type="button"
                onClick={() => onFollowUp({ id: q.id, text: q.text })}
                className="self-start rounded-lg border border-indigo-200 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
              >
                Folgefrage stellen
              </button>
            )}

            <button
              type="button"
              aria-expanded={open}
              aria-controls={`comments-${q.id}`}
              onClick={() => onToggle(q.id, !open)}
              className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-left text-sm font-medium text-zinc-600 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              <span aria-hidden="true">{open ? "▾" : "▸"}</span>
              {q.reactions.length ? `Kommentare (${q.reactions.length})` : readOnly ? "Kommentare (0)" : "Kommentar schreiben"}
              {newCount > 0 && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-800 dark:bg-blue-900 dark:text-blue-100">{newCount} neu</span>}
            </button>
            <div id={`comments-${q.id}`} hidden={!open}>
              <div className="flex flex-col gap-2">
                {q.reactions.map((reaction) => (
                  <ReactionComment key={reaction.id} reaction={reaction}
                    isNew={Boolean(highlighted[reaction.id]) && reaction.author.id !== meId}
                    expanded={open} meId={meId} onSeen={onSeen} roomId={roomId} readOnly={readOnly} onChanged={onReacted}
                    onReply={() => { setReplyTarget({ questionId: q.id, reaction }); requestAnimationFrame(() => document.getElementById(`comment-input-${q.id}`)?.focus()); }} />
                ))}
                {!readOnly && <ReactionComposer roomId={roomId} questionId={q.id} onSubmitted={onReacted} replyTo={replyTarget?.questionId === q.id ? replyTarget.reaction : null} onCancelReply={() => setReplyTarget(null)} />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
