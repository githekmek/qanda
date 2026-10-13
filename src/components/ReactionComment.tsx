"use client";

import { useEffect, useRef } from "react";
import type { PublicQuestion } from "@/types/game";

export default function ReactionComment({ reaction, isNew, expanded, meId, onSeen }: {
  reaction: PublicQuestion["reactions"][number];
  isNew: boolean;
  expanded: boolean;
  meId: string;
  onSeen: (id: string) => void;
}) {
  const element = useRef<HTMLParagraphElement>(null);
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
    <p ref={element} id={`reaction-${reaction.id}`} tabIndex={-1}
      data-new={isNew ? "true" : undefined}
      className={`scroll-mt-6 break-words rounded-lg border-l-2 px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-blue-500 ${isNew
        ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40"
        : "border-zinc-100 dark:border-zinc-800"}`}>
      <span className={`font-medium ${reaction.author.id === meId ? "text-zinc-500" : "text-zinc-800 dark:text-zinc-200"}`}>
        {reaction.author.username}:
      </span>{" "}
      <span className="text-zinc-600 dark:text-zinc-300">{reaction.text}</span>
      {isNew && <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-semibold text-blue-800 dark:bg-blue-900 dark:text-blue-100">Neu</span>}
    </p>
  );
}
