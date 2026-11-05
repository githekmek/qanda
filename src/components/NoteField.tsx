"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { MAX_NOTE_LENGTH } from "@/lib/questionLimits";

/** Optional "Gedanke dazu", collapsed by default so it is never mistaken for the answer. */
export default function NoteField({ id, value, onChange, hint }: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  hint: string;
}) {
  const [open, setOpen] = useState(value !== "");
  const field = useRef<HTMLTextAreaElement>(null);

  const fitToText = useCallback(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "";
    if (!value || node.scrollHeight === 0) return;
    const borders = node.offsetHeight - node.clientHeight;
    node.style.height = `${Math.max(node.scrollHeight + borders, node.offsetHeight)}px`;
  }, [value]);
  useLayoutEffect(fitToText, [fitToText, open]);

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-violet-950 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-100">
      <button type="button" aria-expanded={open} aria-controls={id}
        onClick={() => setOpen(!open)}
        className="flex min-h-9 w-full items-center gap-2 text-left text-sm font-medium">
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
        Gedanke dazu
        <span className="text-xs font-normal text-violet-700 dark:text-violet-300">(optional)</span>
      </button>
      <div id={id} hidden={!open} className="mt-1 flex flex-col gap-1 pb-1">
        <textarea
          ref={field}
          rows={2}
          value={value}
          maxLength={MAX_NOTE_LENGTH}
          onChange={(e) => onChange(e.target.value)}
          onFocus={fitToText}
          spellCheck
          autoCorrect="on"
          enterKeyHint="enter"
          aria-label="Gedanke dazu"
          placeholder="Ein Tipp, eine Begründung, eine Erinnerung…"
          className="max-h-60 resize-none overflow-y-auto rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-violet-500 dark:border-violet-800 dark:bg-zinc-950 dark:text-zinc-100"
        />
        <div className="flex justify-between gap-2 text-xs text-violet-700 dark:text-violet-300">
          <span>{hint}</span>
          <span className="shrink-0">{value.length}/{MAX_NOTE_LENGTH}</span>
        </div>
      </div>
    </div>
  );
}
