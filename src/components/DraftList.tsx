"use client";
import { useEffect, useState } from "react";
import type { Draft } from "@/lib/drafts";
export default function DraftList({ onSelect, roomId }: { onSelect: (draft: Draft) => void; roomId?: string }) {
  const [items, setItems] = useState<Draft[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let current = true;
    fetch("/api/drafts", { cache: "no-store" }).then(async (res) => {
      const data = await res.json(); if (!res.ok) throw new Error(data.error ?? "Laden fehlgeschlagen");
      if (current) setItems(data);
    }).catch((error) => { if (current) setError(error.message); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, []);
  async function remove(draft: Draft) {
    if (!window.confirm("Diesen Entwurf löschen?")) return;
    setError("");
    try {
      const res = await fetch("/api/drafts", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: draft.id, version: draft.version }) });
      if (!res.ok) { const data = await res.json(); throw new Error(data.error); }
      setItems((previous) => previous.filter((item) => item.id !== draft.id));
    } catch (error) { setError(error instanceof Error ? error.message : "Löschen fehlgeschlagen"); }
  }
  const visible = items.filter((d) => !roomId || !d.payload.parent || d.payload.parent.roomId === roomId);
  return <div className="flex flex-col gap-2">
    {loading && <p role="status">Lade Entwürfe…</p>}
    {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
    {!loading && !error && !visible.length && <p className="text-sm text-zinc-500">Noch keine passenden Entwürfe.</p>}
    {visible.map((draft) => <div key={draft.id} className="flex items-center gap-2 rounded-xl border border-zinc-300 p-3 dark:border-zinc-700">
      <button type="button" onClick={() => onSelect(draft)} className="min-w-0 flex-1 text-left">
        <span className="block break-words font-medium">{draft.payload.text || "Unbenannter Entwurf"}</span>
        <span className="text-xs text-zinc-500">{draft.payload.parent ? "Folgefrage · " : ""}{new Date(draft.updatedAt).toLocaleString("de-DE")}</span>
      </button>
      <button type="button" onClick={() => remove(draft)} aria-label={`Entwurf löschen: ${draft.payload.text || "Unbenannt"}`} className="min-h-11 px-2 text-sm underline">Löschen</button>
    </div>)}
  </div>;
}
