"use client";

import { useEffect, useRef, useState } from "react";
import { COMMENT_EMOJIS } from "@/lib/commentEmojis";
import type { PublicQuestion } from "@/types/game";

export default function ReactionComment({ reaction, isNew, expanded, meId, onSeen, roomId, readOnly, onChanged, onReply }: {
  roomId: string;
  readOnly: boolean;
  onChanged: () => void;
  onReply: () => void;
  reaction: PublicQuestion["reactions"][number];
  isNew: boolean;
  expanded: boolean;
  meId: string;
  onSeen: (id: string) => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [picker, setPicker] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function react(emoji: string) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const res = await fetch(`/api/rooms/${roomId}/reaction-emoji`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reactionId: reaction.id, emoji, active: !reaction.emojis.some((item) => item.emoji === emoji && item.mine) }) });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error ?? "Reaktion konnte nicht gespeichert werden."); }
      setPicker(false); await onChanged();
    } catch (error) { setError(error instanceof Error ? error.message : "Verbindung fehlgeschlagen."); }
    finally { setBusy(false); }
  }
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

  return (
    <div ref={element} id={`reaction-${reaction.id}`} tabIndex={-1}
      data-new={isNew ? "true" : undefined}
      className={`scroll-mt-6 break-words rounded-lg border-l-2 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-blue-500 ${isNew
        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40"
        : "border-zinc-100 dark:border-zinc-800"}`}>
      {reaction.replyTo && <blockquote className="mb-2 max-h-40 overflow-y-auto rounded border-l-2 border-indigo-300 bg-zinc-100 p-2 dark:bg-zinc-900">
        <a href={`#reaction-${reaction.replyTo.id}`} className="font-medium underline">Antwort an {reaction.replyTo.author.username}</a>
        <p className="whitespace-pre-wrap break-words">{reaction.replyTo.text}</p>
      </blockquote>}
      <span className={`font-medium ${reaction.author.id === meId ? "text-zinc-500" : "text-zinc-800 dark:text-zinc-200"}`}>
        {reaction.author.username}:
      </span>{" "}
      <span className="whitespace-pre-wrap text-zinc-600 dark:text-zinc-300">{reaction.text}</span>
      {isNew && <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-100">Neu</span>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {reaction.emojis.map((item) => <button type="button" key={item.emoji} disabled={readOnly || busy}
          aria-pressed={item.mine} aria-label={`${item.emoji}: ${item.count} Reaktionen`}
          onClick={() => react(item.emoji)} className={`min-h-10 rounded-full border px-3 ${item.mine ? "border-indigo-500 bg-indigo-100 dark:bg-indigo-950" : "border-zinc-300 dark:border-zinc-700"}`}>
          {item.emoji} {item.count}
        </button>)}
        {!readOnly && <>
          <button type="button" aria-expanded={picker} aria-controls={`emoji-${reaction.id}`} aria-label="Emoji auswählen" onClick={() => setPicker(!picker)} className="min-h-10 rounded border px-3">😊 +</button>
          <button type="button" onClick={onReply} className="min-h-10 px-2 underline">Antworten</button>
        </>}
      </div>
      {picker && !readOnly && <div id={`emoji-${reaction.id}`} role="group" aria-label="Emoji-Auswahl" className="mt-2 flex flex-wrap gap-1 rounded-xl border p-2">
        {COMMENT_EMOJIS.map((emoji) => <button type="button" key={emoji} aria-label={`Mit ${emoji} reagieren`} disabled={busy}
          aria-pressed={reaction.emojis.some((item) => item.emoji === emoji && item.mine)}
          onClick={() => react(emoji)} className="min-h-11 min-w-11 rounded-lg text-xl hover:bg-zinc-200 dark:hover:bg-zinc-800">{emoji}</button>)}
      </div>}
      {error && <p role="alert" className="mt-2 text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
