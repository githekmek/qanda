"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Preview = { roomName: string | null; invitedBy: string };

export default function JoinClient({ code }: { code: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [inviteRes, meRes] = await Promise.all([
      fetch(`/api/invites/${code}`),
      fetch("/api/auth/me"),
    ]);

    const invite = await inviteRes.json();
    if (!inviteRes.ok) {
      setError(invite.error ?? "Diese Einladung ist ungültig");
    } else {
      setPreview(invite);
    }

    const me = await meRes.json();
    setLoggedIn(Boolean(me.user));
  }, [code]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/invites/${code}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Beitritt fehlgeschlagen");
        return;
      }
      router.push(`/room/${data.roomId}`);
    } catch {
      setError("Verbindung zum Server fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  // The invite link is secret and good for exactly one seat, so it doubles as
  // the permission to create an account.
  async function registerAndJoin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, inviteCode: code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Registrierung fehlgeschlagen");
        return;
      }
      router.push(`/room/${data.roomId}`);
      router.refresh();
    } catch {
      setError("Verbindung zum Server fehlgeschlagen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 py-8 dark:bg-black">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-center text-2xl font-semibold tracking-tight">Q&amp;A</h1>
        <p className="mt-0.5 text-center text-sm font-medium text-zinc-400">
          Das Spiel zu unserem Podcast
        </p>

        {!preview ? (
          <p className="mt-6 text-center text-sm text-zinc-400">
            {error ?? "Lade Einladung…"}
          </p>
        ) : (
          <>
            <p className="mt-6 text-center text-base">
              <span className="font-medium">{preview.invitedBy}</span> lädt dich zum Spielen ein
              {preview.roomName ? ` – „${preview.roomName}“` : ""}.
            </p>

            {loggedIn ? (
              <button
                onClick={join}
                disabled={busy}
                className="mt-6 w-full rounded-lg bg-zinc-900 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {busy ? "Trete bei…" : "Raum beitreten"}
              </button>
            ) : (
              <>
                <p className="mt-4 text-center text-sm text-zinc-500">
                  Wähle einen Namen und ein Passwort, dann geht es los.
                </p>

                <form onSubmit={registerAndJoin} className="mt-5 flex flex-col gap-4">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="username"
                      className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      Benutzername
                    </label>
                    <input
                      id="username"
                      type="text"
                      required
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="password"
                      className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      Passwort
                    </label>
                    <input
                      id="password"
                      type="password"
                      required
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy}
                    className="mt-1 rounded-lg bg-zinc-900 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                  >
                    {busy ? "Bitte warten…" : "Konto erstellen und beitreten"}
                  </button>
                </form>

                <button
                  onClick={() => router.push(`/login?next=/join/${code}`)}
                  className="mt-4 w-full text-center text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                >
                  Ich habe schon ein Konto
                </button>
              </>
            )}

            {error && (
              <p className="mt-4 text-center text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
