"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RoomStateResponse } from "@/types/game";
import AskForm from "./AskForm";
import AnswerForm from "./AnswerForm";
import HistoryFeed from "./HistoryFeed";
import InviteLink from "./InviteLink";

const POLL_INTERVAL_MS = 5000;

export default function RoomClient({ roomId, origin }: { roomId: string; origin: string }) {
  const router = useRouter();
  const [state, setState] = useState<RoomStateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/rooms/${roomId}/state`);
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      setState(await res.json());
      setError(null);
    } catch {
      setError("Verbindung zum Server fehlgeschlagen");
    }
  }, [roomId, router]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (!interval) interval = setInterval(refresh, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    // Polling only costs requests while somebody is actually looking at the room.
    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        refresh();
        start();
      }
    };

    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  async function toggleArchive(archived: boolean) {
    const res = await fetch(`/api/rooms/${roomId}/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "Etwas ist schiefgelaufen");
      return;
    }
    if (archived) {
      router.push("/");
    } else {
      refresh();
    }
  }

  if (notFound) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-8">
        <p className="font-medium">Dieser Raum existiert nicht oder gehört nicht zu dir.</p>
        <Link href="/" className="text-sm font-medium underline">
          Zurück zur Übersicht
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-zinc-500 hover:underline">
            ← Übersicht
          </Link>
          <h1 className="mt-1 text-xl font-semibold">
            {state?.room.name || (state?.opponent ? `Mit ${state.opponent.username}` : "Neuer Raum")}
          </h1>
          {state?.room.archived && (
            <span className="text-sm text-amber-600 dark:text-amber-500">Archiviert – nur lesbar</span>
          )}
        </div>
        {state && (
          <button
            onClick={() => toggleArchive(!state.room.archived)}
            className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            {state.room.archived ? "Zurückholen" : "Archivieren"}
          </button>
        )}
      </header>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      {!state ? (
        <p className="text-sm text-zinc-400">Lade Raum…</p>
      ) : !state.opponent ? (
        <InviteLink
          roomId={roomId}
          inviteCode={state.room.inviteCode}
          origin={origin}
          onRegenerated={refresh}
        />
      ) : (
        <>
          {state.awaitingMyAnswer && state.pendingQuestion ? (
            <AnswerForm roomId={roomId} question={state.pendingQuestion} onSubmitted={refresh} />
          ) : state.isMyTurnToAsk ? (
            <AskForm
              roomId={roomId}
              onSubmitted={refresh}
              askedQuestions={[
                ...state.history.map((q) => q.text),
                ...(state.pendingQuestion ? [state.pendingQuestion.text] : []),
              ]}
            />
          ) : state.room.archived ? null : (
            <div className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
              <p className="font-medium">Warte auf {state.opponent.username}</p>
              <p className="mt-1 text-sm text-zinc-500">
                {state.pendingQuestion
                  ? "Deine Frage wartet noch auf eine Antwort."
                  : `${state.opponent.username} ist am Zug und stellt gleich eine Frage.`}
              </p>
            </div>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Verlauf</h2>
            <HistoryFeed
              roomId={roomId}
              history={state.history}
              meId={state.me.id}
              readOnly={state.room.archived}
              onReacted={refresh}
            />
          </section>
        </>
      )}
    </div>
  );
}
