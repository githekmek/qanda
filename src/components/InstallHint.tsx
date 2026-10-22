"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const KEY = "qanda.install.hint.dismissed";

export default function InstallHint() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    // Browser-only state is read after hydration so server and client render the same markup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(!standalone && window.localStorage.getItem(KEY) !== "1");
  }, []);
  if (!visible) return null;
  return (
    <aside className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100">
      <div>
        <p className="font-semibold">Q&amp;A wie eine App nutzen</p>
        <p className="mt-1 text-indigo-800 dark:text-indigo-200">Zum Home-Bildschirm hinzufügen und Push-Benachrichtigungen erhalten.</p>
      </div>
      <div className="flex items-center gap-3">
        <Link href="/konto#app-installieren" className="font-semibold underline">Anleitung</Link>
        <button type="button" aria-label="Installationshinweis schließen"
          onClick={() => { window.localStorage.setItem(KEY, "1"); setVisible(false); }}
          className="rounded px-2 py-1 text-indigo-700 dark:text-indigo-300">✕</button>
      </div>
    </aside>
  );
}
