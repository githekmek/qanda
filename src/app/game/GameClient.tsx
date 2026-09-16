"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { GameStateResponse } from "@/types/game";
import AskForm from "./AskForm";
import AnswerForm from "./AnswerForm";
import HistoryFeed from "./HistoryFeed";

const POLL_INTERVAL_MS = 3000;

export default function GameClient({ username }: { username: string }) {
  const router = useRouter();
  const [state, setState] = useState<GameStateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/game/state");
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      setState(data);
      setError(null);
    } catch {
      setError("Verbindung zum Server fehlgeschlagen");
    }
  }, [router]);

  useEffect(() => {
    // Intentional fetch-on-mount + polling of an external system (the server's game state).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    pollingRef.current = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [refresh]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Q&amp;A</h1>
          <p className="text-sm text-zinc-500">
            Das Spiel zu unserem Podcast · angemeldet als{" "}
            <span className="font-medium">{username}</span>
          </p>
        </div>
        <button
          onClick={handleLogout}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
        >
          Abmelden
        </button>
      </header>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950 dark:text-red-400">
          {error}
        </p>
      )}

      {!state ? (
        <p className="text-sm text-zinc-400">Lade Spielstand…</p>
      ) : !state.opponent ? (
        <div className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
          <p className="font-medium">Warte auf den zweiten Spieler</p>
          <p className="mt-1 text-sm text-zinc-500">
            Sobald sich eine zweite Person registriert hat, kann das Spiel losgehen.
          </p>
        </div>
      ) : (
        <>
          {state.awaitingMyAnswer && state.pendingQuestion ? (
            <AnswerForm question={state.pendingQuestion} onSubmitted={refresh} />
          ) : state.isMyTurnToAsk ? (
            <AskForm
              onSubmitted={refresh}
              askedQuestions={[
                ...state.history.map((q) => q.text),
                ...(state.pendingQuestion ? [state.pendingQuestion.text] : []),
              ]}
            />
          ) : (
            <div className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
              <p className="font-medium">
                Warte auf {state.opponent.username}
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                {state.pendingQuestion
                  ? "Deine Frage wartet noch auf eine Antwort."
                  : `${state.opponent.username} ist am Zug und stellt gleich eine Frage.`}
              </p>
            </div>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">
              Verlauf
            </h2>
            <HistoryFeed history={state.history} meId={state.me.id} onReacted={refresh} />
          </section>
        </>
      )}
    </div>
  );
}
