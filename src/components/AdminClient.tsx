"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type AccessCode = {
  id: string;
  code: string;
  rawCode: string;
  note: string | null;
  createdAt: string;
  revoked: boolean;
  redeemedBy: string | null;
  redeemedAt: string | null;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export default function AdminClient({ origin }: { origin: string }) {
  const [codes, setCodes] = useState<AccessCode[] | null>(null);
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/admin/codes");
    const data = await res.json();
    setCodes(data.codes ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  async function createCode(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      await fetch("/api/admin/codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined }),
      });
      setNote("");
      await refresh();
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    await fetch(`/api/admin/codes/${id}`, { method: "DELETE" });
    await refresh();
  }

  async function copyLink(code: AccessCode) {
    try {
      await navigator.clipboard.writeText(`${origin}/login?code=${code.rawCode}`);
      setCopiedId(code.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(null);
    }
  }

  const open = (codes ?? []).filter((c) => !c.redeemedBy && !c.revoked);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <header>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← Übersicht
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Zugangscodes</h1>
        <p className="text-sm text-zinc-500">
          Jeder Code gilt für genau eine Registrierung.
        </p>
      </header>

      <form
        onSubmit={createCode}
        className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row"
      >
        <input
          type="text"
          value={note}
          maxLength={60}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Notiz, z. B. „für Lisa“ (optional)"
          className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
        />
        <button
          type="submit"
          disabled={creating}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Code erzeugen
        </button>
      </form>

      <p className="text-xs text-zinc-400">
        {open.length} offene{open.length === 1 ? "r" : ""} Code{open.length === 1 ? "" : "s"}
      </p>

      {!codes ? (
        <p className="text-sm text-zinc-400">Lade Codes…</p>
      ) : codes.length === 0 ? (
        <p className="text-sm text-zinc-400">Noch keine Codes erzeugt.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {codes.map((code) => (
            <li
              key={code.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div className="min-w-0">
                <p
                  className={`font-mono text-sm font-semibold ${
                    code.redeemedBy || code.revoked ? "text-zinc-400 line-through" : ""
                  }`}
                >
                  {code.code}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {code.note && <span>{code.note} · </span>}
                  {code.revoked
                    ? "zurückgezogen"
                    : code.redeemedBy
                      ? `eingelöst von ${code.redeemedBy}${code.redeemedAt ? ` am ${formatDate(code.redeemedAt)}` : ""}`
                      : `offen seit ${formatDate(code.createdAt)}`}
                </p>
              </div>

              {!code.redeemedBy && !code.revoked && (
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => copyLink(code)}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    {copiedId === code.id ? "Kopiert" : "Link kopieren"}
                  </button>
                  <button
                    onClick={() => revoke(code.id)}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:border-red-300 hover:text-red-600 dark:border-zinc-700"
                  >
                    Zurückziehen
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
