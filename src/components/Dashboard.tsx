"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RoomSummary } from "@/types/game";

type RoomsResponse = {
  rooms: RoomSummary[];
  activeCount: number;
  maxRooms: number;
};

function statusOf(room: RoomSummary) {
  if (!room.opponent) return { label: "Warte auf Mitspieler", urgent: false };
  if (room.awaitingMyAnswer) return { label: "Du bist dran: antworten", urgent: true };
  if (room.isMyTurnToAsk) return { label: "Du bist dran: fragen", urgent: true };
  if (room.waitingForOpponentAnswer)
    return { label: `Wartet auf ${room.opponent.username}`, urgent: false };
  return { label: `${room.opponent.username} ist am Zug`, urgent: false };
}

function priorityOf(room: RoomSummary) {
  if (room.awaitingMyAnswer) return 0;
  if (room.isMyTurnToAsk) return 1;
  if (!room.opponent) return 2;
  return 3;
}

export default function Dashboard({
  username,
  isAdmin,
}: {
  username: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<RoomsResponse | null>(null);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/rooms");
    if (res.status === 401) {
      router.replace("/login");
      return;
    }
    setData(await res.json());
  }, [router]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  async function createRoom(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Etwas ist schiefgelaufen");
        return;
      }
      router.push(`/room/${body.id}`);
    } catch {
      setError("Verbindung zum Server fehlgeschlagen");
    } finally {
      setCreating(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const active = (data?.rooms ?? [])
    .filter((r) => !r.archived)
    .sort(
      (a, b) =>
        priorityOf(a) - priorityOf(b) ||
        new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime()
    );
  const archived = (data?.rooms ?? []).filter((r) => r.archived);
  const full = data ? data.activeCount >= data.maxRooms : false;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Q&amp;A</h1>
          <p className="text-sm text-zinc-500">
            Das Spiel zu unserem Podcast · angemeldet als{" "}
            <span className="font-medium">{username}</span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          {isAdmin && (
            <Link
              href="/admin"
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              Admin
            </Link>
          )}
          <button
            onClick={handleLogout}
            className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            Abmelden
          </button>
        </div>
      </header>

      <form
        onSubmit={createRoom}
        className="flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row"
      >
        <input
          type="text"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name des Raums (optional)"
          className="flex-1 rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
        />
        <button
          type="submit"
          disabled={creating || full}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
        >
          Raum erstellen
        </button>
      </form>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {data && (
        <p className="text-xs text-zinc-400">
          {data.activeCount} von {data.maxRooms} aktiven Räumen
          {full && " – archiviere einen Raum, um einen neuen zu starten"}
        </p>
      )}

      {!data ? (
        <p className="text-sm text-zinc-400">Lade Räume…</p>
      ) : active.length === 0 ? (
        <p className="text-sm text-zinc-400">
          Noch keine Räume. Erstelle einen und schick den Einladungslink an deinen Mitspieler.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {active.map((room) => {
            const status = statusOf(room);
            return (
              <li key={room.id}>
                <Link
                  href={`/room/${room.id}`}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-600"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {room.name || (room.opponent ? `Mit ${room.opponent.username}` : "Neuer Raum")}
                    </p>
                    <p
                      className={`mt-0.5 text-sm ${
                        status.urgent
                          ? "font-medium text-emerald-600 dark:text-emerald-400"
                          : "text-zinc-500"
                      }`}
                    >
                      {status.label}
                    </p>
                  </div>
                  <span className="shrink-0 text-zinc-300">›</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {archived.length > 0 && (
        <section className="flex flex-col gap-3">
          <button
            onClick={() => setShowArchived((prev) => !prev)}
            className="self-start text-sm font-semibold uppercase tracking-wide text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
          >
            Archiv ({archived.length}) {showArchived ? "▾" : "▸"}
          </button>
          {showArchived && (
            <ul className="flex flex-col gap-2">
              {archived.map((room) => (
                <li key={room.id}>
                  <Link
                    href={`/room/${room.id}`}
                    className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 px-4 py-3 text-sm transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:hover:border-zinc-600"
                  >
                    <span className="truncate text-zinc-500">
                      {room.name || (room.opponent ? `Mit ${room.opponent.username}` : "Neuer Raum")}
                    </span>
                    <span className="shrink-0 text-zinc-300">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
