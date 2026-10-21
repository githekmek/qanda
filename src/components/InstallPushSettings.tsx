"use client";

import { useEffect, useState } from "react";
import type { InstallPromptEvent } from "@/components/PwaBootstrap";

type DeviceSettings = {
  endpoint: string;
  notifyTurn: boolean;
  notifyComments: boolean;
};

function installed() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function applicationServerKey(value: string) {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function currentSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

export async function unsubscribeThisDevice() {
  const subscription = await currentSubscription().catch(() => null);
  if (!subscription) return;
  await fetch("/api/push", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
    keepalive: true,
  }).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
}

export default function InstallPushSettings() {
  const [isInstalled, setIsInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushAvailable, setPushAvailable] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [device, setDevice] = useState<DeviceSettings | null>(null);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setIsInstalled(installed());
    setIos(isIos());
    setInstallPrompt(window.__qandaInstallPrompt ?? null);
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setPushSupported(supported);
    if (supported) setPermission(Notification.permission);

    const onInstallAvailable = () => setInstallPrompt(window.__qandaInstallPrompt ?? null);
    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener("qanda-install-available", onInstallAvailable);
    window.addEventListener("appinstalled", onInstalled);

    (async () => {
      try {
        const subscription = supported ? await currentSubscription() : null;
        const response = await fetch("/api/push", { cache: "no-store" });
        if (!response.ok) return;
        const body = await response.json();
        setPushAvailable(Boolean(body.available));
        setPublicKey(typeof body.publicKey === "string" ? body.publicKey : null);
        if (subscription) {
          const statusResponse = await fetch("/api/push/status", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          });
          if (statusResponse.ok) {
            const statusBody = await statusResponse.json();
            setDevice(statusBody.subscription ?? null);
          }
        }
      } catch {
        setError("Der Gerätestatus konnte nicht geladen werden.");
      }
    })();

    return () => {
      window.removeEventListener("qanda-install-available", onInstallAvailable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function installApp() {
    if (!installPrompt) return;
    setError("");
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    window.__qandaInstallPrompt = undefined;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") setStatus("Installation gestartet.");
  }

  async function enablePush() {
    if (!publicKey || !pushSupported) return;
    if (ios && !installed()) {
      setError("Installiere Q&A zuerst auf deinem Home-Bildschirm und öffne die installierte App.");
      return;
    }
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const granted = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      setPermission(granted);
      if (granted !== "granted") {
        throw new Error("Benachrichtigungen wurden auf diesem Gerät nicht erlaubt.");
      }
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(publicKey) as BufferSource,
        });
      }
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        throw new Error("Das Push-Abonnement des Browsers ist unvollständig.");
      }
      const response = await fetch("/api/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Push konnte nicht aktiviert werden.");
      setDevice(body.subscription);
      setStatus("Push ist auf diesem Gerät aktiviert. Wähle jetzt die gewünschten Hinweise.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Push konnte nicht aktiviert werden.");
    } finally {
      setBusy(false);
    }
  }

  async function savePush(change: Partial<Pick<DeviceSettings, "notifyTurn" | "notifyComments">>) {
    if (!device) return;
    setBusy(true);
    setError("");
    setStatus("Wird gespeichert…");
    try {
      const response = await fetch("/api/push", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: device.endpoint, ...change }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Push-Einstellung konnte nicht gespeichert werden.");
      setDevice(body.subscription);
      setStatus("Gespeichert");
    } catch (error) {
      setStatus("");
      setError(error instanceof Error ? error.message : "Push-Einstellung konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    setBusy(true);
    setError("");
    try {
      await unsubscribeThisDevice();
      setDevice(null);
      setStatus("Push wurde auf diesem Gerät deaktiviert.");
    } finally {
      setBusy(false);
    }
  }

  const canOfferPush = pushSupported && pushAvailable && (!ios || isInstalled);

  return (
    <>
      <section id="app-installieren" aria-labelledby="install-title" className="profile-card mt-4 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-700">
        <h2 id="install-title" className="text-lg font-semibold">App installieren</h2>
        {isInstalled ? (
          <p className="mt-3 text-sm text-emerald-700 dark:text-emerald-300">✓ Q&amp;A ist auf diesem Gerät installiert.</p>
        ) : ios ? (
          <div className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
            <p>Installiere Q&amp;A, damit es wie eine App startet und Push empfangen kann:</p>
            <ol className="mt-3 list-decimal space-y-2 pl-5">
              <li>Tippe im Browser auf <strong>Teilen</strong>.</li>
              <li>Wähle <strong>Zum Home-Bildschirm</strong>.</li>
              <li>Bestätige mit <strong>Hinzufügen</strong> und öffne danach Q&amp;A über das neue Symbol.</li>
            </ol>
          </div>
        ) : installPrompt ? (
          <button type="button" onClick={installApp}
            className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900">
            Q&amp;A installieren
          </button>
        ) : (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">
            Öffne das Browsermenü und wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.
          </p>
        )}
      </section>

      <section aria-labelledby="push-title" className="profile-card profile-notifications mt-4 rounded-2xl border border-zinc-200 p-5 dark:border-zinc-700">
        <h2 id="push-title" className="text-lg font-semibold">Push auf diesem Gerät</h2>
        {!pushSupported ? (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">Dieser Browser unterstützt keine Push-Benachrichtigungen.</p>
        ) : !pushAvailable ? (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">Der Push-Versand ist noch nicht eingerichtet.</p>
        ) : ios && !isInstalled ? (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">Installiere und öffne Q&amp;A zuerst über den Home-Bildschirm.</p>
        ) : !device ? (
          <button type="button" onClick={enablePush} disabled={busy || !canOfferPush}
            className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900">
            Push auf diesem Gerät aktivieren
          </button>
        ) : (
          <>
            {([["notifyTurn", "Wenn ich am Zug bin"], ["notifyComments", "Bei neuen Kommentaren"]] as const).map(([key, label]) => (
              <div key={key} className="mt-4 flex items-center justify-between gap-4">
                <span id={"push-" + key + "-label"}>{label}</span>
                <button type="button" role="switch" aria-checked={device[key]}
                  aria-labelledby={"push-" + key + "-label"} disabled={busy}
                  onClick={() => savePush({ [key]: !device[key] })}
                  className={"profile-switch shrink-0 rounded-full p-1 disabled:opacity-50 " + (device[key] ? "is-on" : "")}>
                  <span aria-hidden="true" className={"block h-5 w-5 rounded-full bg-white transition-transform " + (device[key] ? "translate-x-5" : "")} />
                </button>
              </div>
            ))}
            <button type="button" onClick={disablePush} disabled={busy}
              className="mt-5 text-sm text-zinc-500 underline disabled:opacity-50">
              Push auf diesem Gerät deaktivieren
            </button>
          </>
        )}
        {permission === "denied" && <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">Push wurde im Browser blockiert. Erlaube Mitteilungen in den Geräte- oder Browser-Einstellungen.</p>}
        {status && <p role="status" className="mt-3 text-sm text-zinc-600 dark:text-zinc-300">{status}</p>}
        {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-300">{error}</p>}
        <p className="mt-3 text-xs text-zinc-500">Die Auswahl gilt nur für dieses Gerät. Neue Kommentare werden gesammelt versendet.</p>
      </section>
    </>
  );
}
