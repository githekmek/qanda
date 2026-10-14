"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import RecoveryForm from "@/components/RecoveryForm";

type Profile = {
  username: string; email: string | null; emailVerifiedAt: string | null;
  theme: string; notifyTurn: boolean; notifyComments: boolean; available: boolean;
};
export default function ProfileSettings({ initial }: { initial: Profile }) {
  const [profile, setProfile] = useState(initial);
  const [editingEmail, setEditingEmail] = useState(!initial.emailVerifiedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const router = useRouter();

  async function save(change: Partial<Pick<Profile, "theme" | "notifyTurn" | "notifyComments">>) {
    setBusy(true); setError(""); setStatus("Wird gespeichert…");
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(change),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Speichern fehlgeschlagen.");
      setProfile(data);
      document.documentElement.setAttribute("data-theme", data.theme);
      setStatus("Gespeichert");
      router.refresh();
    } catch (error) {
      setStatus(""); setError(error instanceof Error ? error.message : "Speichern fehlgeschlagen.");
    } finally { setBusy(false); }
  }
  const canNotify = Boolean(profile.emailVerifiedAt && profile.available);
  return <main className="profile-page mx-auto w-full max-w-lg px-4 py-8">
    <Link href="/" className="profile-link text-sm">← Zur Übersicht</Link>
    <h1 className="mt-5 text-2xl font-bold">Profil &amp; Einstellungen</h1>
    <p className="mt-2 text-lg text-zinc-600 dark:text-zinc-300">{profile.username}</p>

    <section aria-labelledby="email-title" className="profile-card profile-email mt-6 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-700">
      <h2 id="email-title" className="text-lg font-semibold">E-Mail-Adresse</h2>
      {profile.emailVerifiedAt && <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
        <span className="min-w-0 break-all">{profile.email}</span>
        <span className="rounded-lg bg-green-100 px-2 py-1 text-xs text-green-800 dark:bg-green-950 dark:text-green-300">✓ Bestätigt</span>
      </div>}
      {profile.emailVerifiedAt && <button type="button" onClick={() => setEditingEmail(!editingEmail)}
        aria-expanded={editingEmail} className="profile-link mt-3 text-sm underline">
        {editingEmail ? "Änderung schließen" : "Adresse ändern"}
      </button>}
      {editingEmail && <RecoveryForm mode="account" embedded />}
    </section>

    <section aria-labelledby="notifications-title" className="profile-card profile-notifications mt-4 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-700">
      <h2 id="notifications-title" className="text-lg font-semibold">Benachrichtigungen</h2>
      {([["notifyTurn", "Wenn ich am Zug bin"], ["notifyComments", "Bei neuen Kommentaren"]] as const).map(([key, label]) =>
        <div key={key} className="mt-4 flex items-center justify-between gap-4">
          <span id={key + "-label"}>{label}</span>
          <button type="button" role="switch" aria-checked={profile[key]} aria-labelledby={key + "-label"}
            aria-describedby="notification-help" disabled={busy || (!canNotify && !profile[key])}
            onClick={() => save({ [key]: !profile[key] })}
            className={"profile-switch shrink-0 rounded-full p-1 disabled:opacity-50 " + (profile[key] ? "is-on" : "")}>
            <span aria-hidden="true" className={"block h-5 w-5 rounded-full bg-white transition-transform " + (profile[key] ? "translate-x-5" : "")} />
          </button>
        </div>)}
      <p id="notification-help" className="mt-4 text-sm text-zinc-600 dark:text-zinc-300">
        {!profile.emailVerifiedAt ? "Bitte zuerst deine E-Mail-Adresse bestätigen." : !profile.available ?
          "Der E-Mail-Versand ist noch nicht eingerichtet." : "Per E-Mail · freiwillig. Neue Kommentare werden gesammelt versendet."}
      </p>
    </section>

    <section aria-labelledby="theme-title" className="profile-card mt-4 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-700">
      <h2 id="theme-title" className="text-lg font-semibold">Darstellung</h2>
      <div role="group" aria-labelledby="theme-title" className="mt-4 grid grid-cols-3 gap-1 rounded-xl border border-zinc-200 p-1 dark:border-zinc-700">
        {[["standard", "Standard"], ["colorful", "Bunt"], ["dark", "Dark"]].map(([value, label]) =>
          <button type="button" key={value} aria-pressed={profile.theme === value} disabled={busy}
            className={"rounded-lg px-1 py-3 text-sm disabled:opacity-60 " + (profile.theme === value ? "theme-selected" : "")}
            onClick={() => save({ theme: value })}>{profile.theme === value ? "✓ " : ""}{label}</button>)}
      </div>
      <p className="mt-3 text-xs text-zinc-600 dark:text-zinc-300">Standard folgt wie bisher deiner Geräteeinstellung. Deine Auswahl gilt auf allen Geräten.</p>
    </section>
    <p role="status" className="mt-4 text-center text-sm text-zinc-600 dark:text-zinc-300">{status || "Einstellungen werden automatisch gespeichert."}</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{error} Bitte versuche es erneut.</p>}
  </main>;
}
