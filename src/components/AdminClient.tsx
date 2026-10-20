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

type FoundUser = {
  username: string;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => null);
  return typeof body?.error === "string" ? body.error : fallback;
}

export default function AdminClient({ origin }: { origin: string }) {
  const [codes, setCodes] = useState<AccessCode[] | null>(null);
  const [note, setNote] = useState("");
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [username, setUsername] = useState("");
  const [foundUser, setFoundUser] = useState<FoundUser | null | undefined>(undefined);
  const [searching, setSearching] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetPath, setResetPath] = useState<string | null>(null);
  const [resetError, setResetError] = useState("");
  const [resetCopied, setResetCopied] = useState(false);

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

  function changeUsername(value: string) {
    setUsername(value);
    setFoundUser(undefined);
    setResetPath(null);
    setResetError("");
    setResetCopied(false);
  }

  async function searchUser(e: React.FormEvent) {
    e.preventDefault();
    const searchedUsername = username.trim();
    setSearching(true);
    setFoundUser(undefined);
    setResetPath(null);
    setResetError("");
    setResetCopied(false);

    try {
      const response = await fetch(
        `/api/admin/password-reset?username=${encodeURIComponent(searchedUsername)}`,
      );
      if (!response.ok) {
        throw new Error(await responseError(response, "Spieler konnte nicht gesucht werden."));
      }

      const body = (await response.json()) as { user: FoundUser | null };
      setFoundUser(body.user);
    } catch (error) {
      setResetError(error instanceof Error ? error.message : "Spieler konnte nicht gesucht werden.");
    } finally {
      setSearching(false);
    }
  }

  async function generateResetLink() {
    if (!foundUser) return;

    setResetting(true);
    setResetPath(null);
    setResetError("");
    setResetCopied(false);

    try {
      const response = await fetch("/api/admin/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: foundUser.username }),
      });
      if (!response.ok) {
        throw new Error(await responseError(response, "Reset-Link konnte nicht erzeugt werden."));
      }

      const body = (await response.json()) as { path: string };
      setResetPath(body.path);
    } catch (error) {
      setResetError(error instanceof Error ? error.message : "Reset-Link konnte nicht erzeugt werden.");
    } finally {
      setResetting(false);
    }
  }

  async function copyResetLink() {
    if (!resetPath) return;
    try {
      await navigator.clipboard.writeText(`${origin}${resetPath}`);
      setResetCopied(true);
      setTimeout(() => setResetCopied(false), 2000);
    } catch {
      setResetCopied(false);
    }
  }

  const open = (codes ?? []).filter((code) => !code.redeemedBy && !code.revoked);
  const resetLink = resetPath ? `${origin}${resetPath}` : "";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-8">
      <header>
        <Link href="/" className="text-sm text-zinc-500 hover:underline">
          ← Übersicht
        </Link>
        <h1 className="mt-1 text-xl font-semibold">Administration</h1>
        <p className="text-sm text-zinc-500">
          Zugangscodes verwalten und Spielern beim Passwortreset helfen.
        </p>
      </header>

      <section aria-labelledby="codes-title" className="flex flex-col gap-4">
        <div>
          <h2 id="codes-title" className="text-lg font-semibold">Zugangscodes</h2>
          <p className="text-sm text-zinc-500">
            Jeder Code gilt für genau eine Registrierung.
          </p>
        </div>

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
            aria-label="Notiz zum Zugangscode"
            className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {creating ? "Erzeuge…" : "Code erzeugen"}
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
                      type="button"
                      onClick={() => copyLink(code)}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    >
                      {copiedId === code.id ? "Kopiert" : "Link kopieren"}
                    </button>
                    <button
                      type="button"
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
      </section>

      <section
        aria-labelledby="reset-title"
        className="flex flex-col gap-4 border-t border-zinc-200 pt-8 dark:border-zinc-800"
      >
        <div>
          <h2 id="reset-title" className="text-lg font-semibold">Passwort zurücksetzen</h2>
          <p className="text-sm text-zinc-500">
            Suche einen Spielernamen exakt und erzeuge einen einmal verwendbaren Link.
          </p>
        </div>

        <form
          onSubmit={searchUser}
          className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-end"
        >
          <label className="flex flex-1 flex-col gap-1 text-sm font-medium">
            Spielername
            <input
              type="text"
              value={username}
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9_-]+"
              required
              autoComplete="off"
              onChange={(event) => changeUsername(event.target.value)}
              className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm font-normal outline-none focus:border-zinc-500 dark:border-zinc-700"
            />
          </label>
          <button
            type="submit"
            disabled={searching}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            {searching ? "Suche…" : "Spieler suchen"}
          </button>
        </form>

        {foundUser === null && (
          <p role="status" className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Spieler nicht gefunden.
          </p>
        )}

        {foundUser && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
            <p className="text-sm">
              Gefunden: <strong>{foundUser.username}</strong>
            </p>
            <button
              type="button"
              onClick={generateResetLink}
              disabled={resetting}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
            >
              {resetting ? "Erzeuge…" : "Reset-Link erzeugen"}
            </button>
          </div>
        )}

        {resetError && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">
            {resetError}
          </p>
        )}

        {resetPath && (
          <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
            <p role="status" className="text-sm text-emerald-900 dark:text-emerald-200">
              Der Link ist 30 Minuten gültig und kann nur einmal verwendet werden.
            </p>
            <label className="flex flex-col gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">
              Passwortreset-Link
              <input
                type="text"
                readOnly
                value={resetLink}
                onFocus={(event) => event.currentTarget.select()}
                className="rounded-lg border border-emerald-300 bg-white px-3 py-2 font-mono text-xs text-zinc-900 outline-none dark:border-emerald-800 dark:bg-zinc-950 dark:text-zinc-100"
              />
            </label>
            <button
              type="button"
              onClick={copyResetLink}
              className="self-start rounded-lg border border-emerald-400 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-950"
            >
              {resetCopied ? "Kopiert" : "Link kopieren"}
            </button>
          </div>
        )}

        <p className="text-xs text-zinc-500">
          Wer den Link kennt, kann das Passwort ändern. Teile ihn deshalb nur privat mit der betroffenen Person.
          Ein neu erzeugter Admin-Link macht einen vorherigen Admin-Link für diesen Spieler ungültig.
        </p>
      </section>
    </div>
  );
}
