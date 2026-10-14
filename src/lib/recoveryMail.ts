import "server-only";

export function recoveryConfig() {
  const apiKey = process.env.RESEND_API_KEY;
  const sender = process.env.RESEND_FROM_EMAIL;
  const base = process.env.APP_URL;
  if (!apiKey || !sender || !base) return null;
  try {
    const url = new URL(base);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (url.protocol !== "https:" && !(process.env.VERCEL !== "1" && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) return null;
    return { apiKey, sender, origin: url.origin };
  } catch { return null; }
}

export async function sendRecoveryMail(email: string, purpose: "verify" | "reset", token: string) {
  const config = recoveryConfig();
  if (!config) throw new Error("Recovery mail is not configured");
  // A fragment does not enter HTTP access logs or Referer headers.
  const link = config.origin + "/konto/" + (purpose === "verify" ? "bestaetigen" : "passwort") + "#token=" + token;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + config.apiKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      from: "Q&A <" + config.sender + ">",
      to: [email],
      subject: purpose === "verify" ? "Q&A: E-Mail-Adresse bestätigen" : "Q&A: Passwort zurücksetzen",
      text: (purpose === "verify" ? "Bestätige deine E-Mail-Adresse für Q&A:" : "Setze dein Q&A-Passwort zurück:") +
        "\n\n" + link + "\n\nDieser Link gilt einmalig für 30 Minuten. Wenn du dies nicht angefordert hast, ignoriere diese E-Mail.",
    }),
    signal: AbortSignal.timeout(8000),
  });
  // Never print provider bodies, addresses, API keys or reset tokens.
  if (!response.ok) throw new Error("Recovery mail delivery failed");
}
