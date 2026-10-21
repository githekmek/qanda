"use client";

import { useEffect } from "react";

export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

declare global {
  interface Window {
    __qandaInstallPrompt?: InstallPromptEvent;
  }
}

export default function PwaBootstrap() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const onPrompt = (event: Event) => {
      const prompt = event as InstallPromptEvent;
      prompt.preventDefault();
      window.__qandaInstallPrompt = prompt;
      window.dispatchEvent(new Event("qanda-install-available"));
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);
  return null;
}
