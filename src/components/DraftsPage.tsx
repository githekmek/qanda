"use client";
import { useState } from "react";
import Link from "next/link";
import type { Draft } from "@/lib/drafts";
import DraftList from "./DraftList";
import AskForm from "./AskForm";
export default function DraftsPage() {
  const [selected, setSelected] = useState<Draft | undefined>();
  const [editing, setEditing] = useState(false);
  const [listGeneration, setListGeneration] = useState(0);
  const [generation, setGeneration] = useState(0);
  function open(draft?: Draft) {
    if (editing && !window.confirm("Editor wechseln? Bitte ungespeicherte Änderungen vorher speichern.")) return;
    setSelected(draft); setEditing(true); setGeneration((n) => n + 1);
  }
  return <main className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-8">
    <Link href="/" className="underline">← Übersicht</Link>
    <h1 className="text-2xl font-semibold">Meine Entwürfe</h1>
    <p className="text-sm text-zinc-500">Nur für dich sichtbar, auf allen Geräten verfügbar. Du kannst Fragen jederzeit vorbereiten und später im eigenen Zug in einem Raum laden.</p>
    <button type="button" onClick={() => open()} className="min-h-11 self-start rounded-lg border px-4">Neuer Entwurf</button>
    <DraftList key={listGeneration} onSelect={open} />
    {editing && <AskForm key={(selected?.id ?? "new") + generation} draftOnly initialDraft={selected} onSaved={() => setListGeneration((n) => n + 1)} askedQuestions={[]} onSubmitted={() => {}} />}
  </main>;
}
