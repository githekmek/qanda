"use client";

import { useEffect, useRef, useState } from "react";
import { CURRENT_RELEASE, RELEASE_NOTES } from "@/lib/releases";

const STORAGE_KEY = "qanda.release.seen";

export default function ReleaseNotes() {
  const dialog = useRef<HTMLDialogElement>(null);
  const [isNew, setIsNew] = useState(false);

  useEffect(() => {
    // Browser-only state is initialized after hydration to keep the server render stable.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsNew(window.localStorage.getItem(STORAGE_KEY) !== CURRENT_RELEASE);
  }, []);

  function open() {
    window.localStorage.setItem(STORAGE_KEY, CURRENT_RELEASE);
    setIsNew(false);
    dialog.current?.showModal();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="relative rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium dark:border-zinc-700"
      >
        Neuigkeiten
        {isNew && (
          <span className="absolute -right-2 -top-2 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
            Neu
          </span>
        )}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="release-notes-title"
        className="m-auto max-h-[85vh] w-[calc(100%-2rem)] max-w-lg rounded-2xl border border-zinc-200 bg-white p-0 text-zinc-900 shadow-2xl backdrop:bg-black/50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 id="release-notes-title" className="text-lg font-semibold">Neuigkeiten</h2>
          <button type="button" onClick={() => dialog.current?.close()}
            aria-label="Neuigkeiten schließen"
            className="rounded-lg px-3 py-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900">
            ✕
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {RELEASE_NOTES.map((release, index) => (
            <article key={release.version} className={index ? "border-t border-zinc-200 py-5 dark:border-zinc-800" : "pb-5"}>
              <p className="text-xs font-medium uppercase tracking-wide text-zinc-400">{release.date}</p>
              <h3 className="mt-1 font-semibold">{release.title}</h3>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-zinc-600 dark:text-zinc-300">
                {release.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </dialog>
    </>
  );
}
