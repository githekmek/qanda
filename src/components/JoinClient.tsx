"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Preview = { roomName: string | null; invitedBy: string };

export default function JoinClient({ code }: { code: string }) {
  const router = useRouter();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

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
    setJoining(true);
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
      setJoining(false);
    }
  }

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 px-4 dark:bg-black">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="text-2xl font-semibold tracking-tight">Q&amp;A</h1>
        <p className="mt-0.5 text-sm font-medium text-zinc-400">Das Spiel zu unserem Podcast</p>

        {error ? (
          <p className="mt-6 text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : !preview ? (
          <p className="mt-6 text-sm text-zinc-400">Lade Einladung…</p>
        ) : (
          <>
            <p className="mt-6 text-base">
              <span className="font-medium">{preview.invitedBy}</span> lädt dich zum Spielen ein
              {preview.roomName ? ` – „${preview.roomName}“` : ""}.
            </p>

            {loggedIn ? (
              <button
                onClick={join}
                disabled={joining}
                className="mt-6 w-full rounded-lg bg-zinc-900 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              >
                {joining ? "Trete bei…" : "Raum beitreten"}
              </button>
            ) : (
              <>
                <p className="mt-4 text-sm text-zinc-500">
                  Melde dich an oder erstelle ein Konto, um beizutreten.
                </p>
                <button
                  onClick={() => router.push(`/login?next=/join/${code}`)}
                  className="mt-4 w-full rounded-lg bg-zinc-900 py-2 text-sm font-semibold text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                >
                  Zur Anmeldung
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
