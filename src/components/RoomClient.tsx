"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RoomStateResponse } from "@/types/game";
import AskForm from "./AskForm";
import AnswerForm from "./AnswerForm";
import HistoryFeed from "./HistoryFeed";
import InviteLink from "./InviteLink";

const POLL_INTERVAL_MS = 5000;

export default function RoomClient(props: { roomId: string; origin: string }) {
  return <RoomContent key={props.roomId} {...props} />;
}

function RoomContent({ roomId, origin }: { roomId: string; origin: string }) {
  const router = useRouter();
  const [state, setState] = useState<RoomStateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [highlighted, setHighlighted] = useState<Record<string, true>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [jump, setJump] = useState<{ id: string; sequence: number } | null>(null);
  const [readError, setReadError] = useState(false);
  const [followUpTarget, setFollowUpTarget] = useState<{ id: string; text: string } | null>(null);
  const initialized = useRef(false);
  const refreshing = useRef(false);
  const historySince = useRef<string | null>(null);
  const pendingReads = useRef(new Set<string>());
  const savedReads = useRef(new Set<string>());
  const onSeen = useCallback((id: string) => {
    if (!savedReads.current.has(id)) pendingReads.current.add(id);
  }, []);

  useEffect(() => {
    let busy = false;
    const flush = async () => {
      if (busy || !pendingReads.current.size) return;
      busy = true;
      const ids = [...pendingReads.current].slice(0, 100);
      try {
        const res = await fetch(`/api/rooms/${roomId}/reaction-seen`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reactionIds: ids }), keepalive: true,
        });
        if (!res.ok) throw new Error("read receipt");
        for (const id of ids) { savedReads.current.add(id); pendingReads.current.delete(id); }
        setReadError(false);
      } catch { setReadError(true); }
      finally { busy = false; }
    };
    const timer = setInterval(flush, 1000);
    const onLeave = () => { if (document.hidden) void flush(); };
    document.addEventListener("visibilitychange", onLeave);
    window.addEventListener("pagehide", flush);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onLeave);
      window.removeEventListener("pagehide", flush);
      void flush();
    };
  }, [roomId]);

  const refresh = useCallback(async () => {
    if (refreshing.current || document.hidden) return;
    refreshing.current = true;
    try {
      if (!initialized.current) {
        const initial = await fetch(`/api/rooms/${roomId}/reaction-seen`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reactionIds: [] }),
        });
        if (initial.status === 401) { router.replace("/login"); return; }
        if (initial.status === 404) { setNotFound(true); return; }
        if (!initial.ok) throw new Error("initial visit");
        initialized.current = true;
      }
      const query = historySince.current ? `?historySince=${encodeURIComponent(historySince.current)}` : "";
      const res = await fetch(`/api/rooms/${roomId}/state${query}`, { cache: "no-store" });
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) throw new Error("room state");
      const next: RoomStateResponse = await res.json();
      const oldest = next.history.at(-1)?.createdAt;
      if (oldest) historySince.current = oldest;
      setHighlighted((previous) => {
        const merged = { ...previous };
        for (const id of next.unreadReactionIds) merged[id] = true;
        return merged;
      });
      setState(next);
      setFollowUpTarget((current) => {
        if (!current || !next.isMyTurnToAsk) return null;
        const source = next.history.find((question) => question.id === current.id);
        return source && !source.hasFollowUp ? current : null;
      });
      setError(null);
    } catch {
      setError("Verbindung zum Server fehlgeschlagen");
    } finally { refreshing.current = false; }
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

  const newReactions = state?.history.flatMap((q) => q.reactions
    .filter((reaction) => highlighted[reaction.id] && reaction.author.id !== state.me.id)
    .map((reaction) => ({ id: reaction.id, questionId: q.id }))) ?? [];
  function startFollowUp(question: { id: string; text: string }) {
    setFollowUpTarget(question);
    requestAnimationFrame(() => {
      document.getElementById("question-form")?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
  }

  function showNextReaction() {
    const previousIndex = newReactions.findIndex((r) => r.id === jump?.id);
    const next = newReactions[(previousIndex + 1) % newReactions.length];
    if (!next) return;
    setExpanded((previous) => ({ ...previous, [next.questionId]: true }));
    setJump({ id: next.id, sequence: (jump?.sequence ?? 0) + 1 });
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

      {newReactions.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:bg-blue-950/40 dark:text-blue-100">
          <span>{newReactions.length} {newReactions.length === 1 ? "neuer Kommentar" : "neue Kommentare"}</span>
          <button type="button" onClick={showNextReaction} className="min-h-10 rounded px-2 font-semibold underline focus-visible:outline-2">
            {jump ? "Nächsten anzeigen" : "Anzeigen"}
          </button>
        </div>
      )}
      {readError && <p role="status" className="text-sm text-amber-700 dark:text-amber-400">Der Gelesen-Stand konnte noch nicht gespeichert werden. Wir versuchen es erneut.</p>}

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
            <AnswerForm key={state.pendingQuestion.id} roomId={roomId} question={state.pendingQuestion} onSubmitted={refresh} />
          ) : state.isMyTurnToAsk ? (
            <AskForm
              key={followUpTarget?.id ?? "regular-question"}
              roomId={roomId}
              onSubmitted={() => { setFollowUpTarget(null); refresh(); }}
              followUpTo={followUpTarget}
              onCancelFollowUp={() => setFollowUpTarget(null)}
              askedQuestions={[
                ...state.history.map((q) => q.text),
                ...(state.pendingQuestion ? [state.pendingQuestion.text] : []),
              ]}
            />
          ) : state.room.archived ? null : (
            <>
              <div className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center dark:border-zinc-700">
                <p className="font-medium">Warte auf {state.opponent.username}</p>
                <p className="mt-1 text-sm text-zinc-500">
                  {state.pendingQuestion
                    ? "Deine Frage wartet noch auf eine Antwort."
                    : `${state.opponent.username} ist am Zug und stellt gleich eine Frage.`}
                </p>
              </div>
              <details className="group rounded-2xl">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900">
                  <span aria-hidden="true" className="group-open:hidden">▸</span>
                  <span aria-hidden="true" className="hidden group-open:inline">▾</span>
                  Frage für später vorbereiten
                </summary>
                <div className="mt-2">
                  <AskForm
                    roomId={roomId}
                    canSend={false}
                    onSubmitted={refresh}
                    askedQuestions={[
                      ...state.history.map((q) => q.text),
                      ...(state.pendingQuestion ? [state.pendingQuestion.text] : []),
                    ]}
                  />
                </div>
              </details>
            </>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-400">Verlauf</h2>
            <HistoryFeed
              roomId={roomId}
              history={state.history}
              meId={state.me.id}
              readOnly={state.room.archived}
              onReacted={refresh}
              highlighted={highlighted}
              expanded={expanded}
              onToggle={(id, open) => setExpanded((previous) => ({ ...previous, [id]: open }))}
              onSeen={onSeen}
              jump={jump}
              canAskFollowUp={state.isMyTurnToAsk}
              onFollowUp={startFollowUp}
            />
          </section>
        </>
      )}
    </div>
  );
}
