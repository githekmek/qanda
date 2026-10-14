"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Mode = "account" | "request" | "verify" | "reset";
const inputStyle = "w-full rounded-lg border border-zinc-300 bg-transparent px-3 py-2 text-sm dark:border-zinc-700";

export default function RecoveryForm({ mode, embedded = false }: { mode: Mode; embedded?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [token, setToken] = useState("");
  const tokenLoaded = useRef(false);
  const [account, setAccount] = useState<{ email: string | null; verified: boolean; available: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if ((mode === "verify" || mode === "reset") && !tokenLoaded.current) {
      tokenLoaded.current = true;
      const value = new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "";
      // The token is kept in component memory only, never in storage or a query string.
      setToken(value);
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (mode === "account") {
      fetch("/api/auth/recovery", { cache: "no-store" }).then(async (res) => {
        if (!res.ok) throw new Error();
        setAccount(await res.json());
      }).catch(() => setError("Kontodaten konnten nicht geladen werden. Bitte lade die Seite neu."));
    }
  }, [mode]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(""); setMessage("");
    if (mode === "reset" && password !== repeat) { setError("Die Passwörter stimmen nicht überein."); return; }
    setBusy(true);
    try {
      const body = mode === "account" ? { action: "email", email, password }
        : mode === "request" ? { action: "request", email }
        : mode === "verify" ? { action: "verify", token }
        : { action: "reset", token, password };
      const res = await fetch("/api/auth/recovery", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Die Anfrage konnte nicht abgeschlossen werden."); return; }
      setMessage(data.message); setPassword(""); setRepeat("");
      if (mode === "verify" || mode === "reset") { setSuccess(true); setToken(""); }
    } catch { setError("Verbindung zum Server fehlgeschlagen. Bitte versuche es erneut."); }
    finally { setBusy(false); }
  }

  const title = mode === "account" ? "E-Mail für Passwortreset" : mode === "request" ? "Passwort vergessen?"
    : mode === "verify" ? "E-Mail bestätigen" : "Neues Passwort setzen";
  const Container = embedded ? "div" : "main";
  return (
    <Container className={embedded ? "mt-3" : "mx-auto w-full max-w-md px-4 py-8"}>
      {!embedded && <Link href={mode === "account" ? "/" : "/login"} className="text-sm text-zinc-500 underline">
        {mode === "account" ? "← Übersicht" : "Zur Anmeldung"}
      </Link>}
      {!embedded && <h1 className="mt-5 text-xl font-semibold">{title}</h1>}
      {mode === "account" && <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
        {account?.verified ? `Bestätigte Adresse: ${account.email}` : "Hinterlege eine E-Mail-Adresse und bestätige sie, damit du dein Passwort bei Bedarf zurücksetzen kannst."}
        {" "}Eine neue Adresse ersetzt die bisherige erst nach der Bestätigung.
      </p>}
      {mode === "request" && <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
        Gib deine im Konto bestätigte E-Mail-Adresse ein. Ohne hinterlegte Adresse ist ein E-Mail-Reset noch nicht möglich.
      </p>}
      {mode === "account" && account && !account.available && <p role="status" className="mt-3 text-sm text-amber-700 dark:text-amber-400">Der E-Mail-Versand ist noch nicht eingerichtet. Dein Konto und deine Spiele bleiben normal nutzbar.</p>}
      {!success && <form onSubmit={submit} className="mt-5 flex flex-col gap-4">
        {(mode === "account" || mode === "request") && <label className="flex flex-col gap-1 text-sm">
          E-Mail-Adresse
          <input className={inputStyle} type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>}
        {(mode === "account" || mode === "reset") && <label className="flex flex-col gap-1 text-sm">
          {mode === "account" ? "Aktuelles Passwort" : "Neues Passwort"}
          <input className={inputStyle} type="password" autoComplete={mode === "account" ? "current-password" : "new-password"} required minLength={mode === "reset" ? 12 : 1} maxLength={200} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>}
        {mode === "reset" && <><p className="text-xs text-zinc-500">Mindestens 12 Zeichen; höchstens 72 UTF-8-Bytes.</p><label className="flex flex-col gap-1 text-sm">
          Neues Passwort wiederholen
          <input className={inputStyle} type="password" autoComplete="new-password" required minLength={12} maxLength={200} value={repeat} onChange={(e) => setRepeat(e.target.value)} />
        </label></>}
        {(mode === "verify" || mode === "reset") && !token && <p role="status" className="text-sm text-amber-700 dark:text-amber-400">Bitte öffne den vollständigen Link aus deiner E-Mail.</p>}
        <button type="submit" disabled={busy || ((mode === "verify" || mode === "reset") && !token) || (mode === "account" && !account?.available)}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
          {busy ? "Bitte warten…" : mode === "verify" ? "E-Mail bestätigen" : mode === "reset" ? "Passwort speichern" : mode === "account" ? "Bestätigungsmail senden" : "Reset-Link anfordern"}
        </button>
      </form>}
      {error && <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {message && <p role="status" className="mt-4 text-sm text-green-700 dark:text-green-400">{message}</p>}
      {success && <Link href={mode === "verify" ? "/konto" : "/login"} className="mt-4 inline-block underline">{mode === "verify" ? "Zum Konto" : "Jetzt anmelden"}</Link>}
    </Container>
  );
}
