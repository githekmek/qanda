"use client";

import { useEffect, useRef, useState } from "react";
import { COMMENT_EMOJIS } from "@/lib/commentEmojis";
import type { PublicQuestion } from "@/types/game";

type Comment = PublicQuestion["reactions"][number];

export default function ReactionComment({ roomId, reaction, isNew, expanded, meId, readOnly, onSeen, onReply, onChanged }: {
  roomId: string;
  reaction: Comment;
  isNew: boolean;
  expanded: boolean;
  meId: string;
  readOnly: boolean;
  onSeen: (id: string) => void;
  onReply: (reaction: Comment) => void;
  onChanged: () => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const actions = useRef<HTMLDivElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const node = element.current;
    if (!node || !isNew || !expanded) return;
    let visible = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancel = () => { clearTimeout(timer); timer = undefined; };
    const update = () => {
      cancel();
      if (visible && !document.hidden) {
        timer = setTimeout(() => onSeen(reaction.id), 600);
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting && entry.intersectionRatio >= 0.5;
      update();
    }, { threshold: [0, 0.5] });
    observer.observe(node);
    document.addEventListener("visibilitychange", update);
    return () => {
      cancel();
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, [expanded, isNew, onSeen, reaction.id]);

  useEffect(() => {
    if (!pickerOpen) return;
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !actions.current?.contains(event.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [pickerOpen]);

  async function toggleEmoji(emoji: string, active: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${roomId}/reaction-emoji`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reactionId: reaction.id, emoji, active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Etwas ist schiefgelaufen");
        return;
      }
      setPickerOpen(false);
      onChanged();
    } catch {
      setError("Verbindung zum Server fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={element} id={`reaction-${reaction.id}`} tabIndex={-1}
      data-new={isNew ? "true" : undefined}
      className={`scroll-mt-6 break-words rounded-lg border-l-2 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-blue-500 ${isNew
        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40"
        : "border-zinc-100 dark:border-zinc-800"}`}>
      {reaction.replyTo && (
        <a href={`#reaction-${reaction.replyTo.id}`}
          className="mb-1 block rounded-md bg-zinc-50 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800">
          <span aria-hidden="true">↪ </span>
          <span className="sr-only">Antwort auf </span>
          <span className="font-medium">{reaction.replyTo.author.username}:</span> {reaction.replyTo.text}
        </a>
      )}
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 whitespace-pre-line">
          <span className={`font-medium ${reaction.author.id === meId ? "text-zinc-500" : "text-zinc-800 dark:text-zinc-200"}`}>
            {reaction.author.username}:
          </span>{" "}
          <span className="text-zinc-600 dark:text-zinc-300">{reaction.text}</span>
          {isNew && <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-100">Neu</span>}
        </p>
        {!readOnly && (
          <div ref={actions} className="relative -my-1 flex shrink-0 items-center">
            <button type="button" onClick={() => setPickerOpen(!pickerOpen)}
              aria-expanded={pickerOpen} aria-controls={`emoji-picker-${reaction.id}`}
              aria-label="Emoji-Reaktion hinzufügen" title="Emoji-Reaktion"
              className="flex h-8 w-8 items-center justify-center rounded-md text-base text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
              ☺
            </button>
            <button type="button" onClick={() => onReply(reaction)}
              aria-label={`${reaction.author.username} antworten`} title="Antworten"
              className="flex h-8 w-8 items-center justify-center rounded-md text-base text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200">
              ↩
            </button>
            {pickerOpen && (
              // Floats over the following comments instead of pushing them down.
              <div id={`emoji-picker-${reaction.id}`} role="group" aria-label="Emoji auswählen"
                className="absolute right-0 top-full z-20 mt-1 grid w-max grid-cols-8 gap-0.5 rounded-xl border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                {COMMENT_EMOJIS.map((emoji) => {
                  const mine = reaction.emojis.some((e) => e.emoji === emoji && e.mine);
                  return (
                    <button key={emoji} type="button" disabled={busy} aria-pressed={mine}
                      onClick={() => toggleEmoji(emoji, !mine)}
                      className={`flex h-8 w-8 items-center justify-center rounded-md text-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 ${mine ? "bg-blue-50 dark:bg-blue-950/50" : ""}`}>
                      {emoji}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {reaction.emojis.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {reaction.emojis.map(({ emoji, count, mine }) => (
            <button key={emoji} type="button" disabled={readOnly || busy}
              aria-pressed={mine}
              aria-label={`${emoji} ${count}${mine ? ", von dir – entfernen" : " – hinzufügen"}`}
              onClick={() => toggleEmoji(emoji, !mine)}
              className={`h-6 rounded-full border px-1.5 text-xs leading-none disabled:cursor-default ${mine
                ? "border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-700 dark:bg-blue-950/50 dark:text-blue-100"
                : "border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"}`}>
              {emoji} {count}
            </button>
          ))}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
