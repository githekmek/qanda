"use client";

import { useState } from "react";

export default function InviteLink({
  roomId,
  inviteCode,
  origin,
  onRegenerated,
}: {
  roomId: string;
  inviteCode: string | null;
  origin: string;
  onRegenerated: () => void;
}) {
  const [copied, setCopied] = useState(false);

  if (!inviteCode) return null;

  const url = `${origin}/join/${inviteCode}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  async function regenerate() {
    await fetch(`/api/rooms/${roomId}/invite`, { method: "POST" });
    onRegenerated();
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-zinc-300 p-6 dark:border-zinc-700">
      <div>
        <p className="font-medium">Warte auf deinen Mitspieler</p>
        <p className="mt-1 text-sm text-zinc-500">
          Schick diesen Link an die Person, mit der du spielen willst. Wer ihn öffnet, nimmt den
          zweiten Platz ein – danach funktioniert er nicht mehr.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 font-mono text-xs outline-none dark:border-zinc-700 dark:bg-zinc-900"
        />
        <button
          onClick={copy}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          {copied ? "Kopiert" : "Kopieren"}
        </button>
      </div>

      <button
        onClick={regenerate}
        className="self-start text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
      >
        Neuen Link erzeugen (macht den alten ungültig)
      </button>
    </div>
  );
}
