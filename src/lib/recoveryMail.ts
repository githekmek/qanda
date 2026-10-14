import "server-only";
import nodemailer from "nodemailer";

export function recoveryConfig() {
  const sender = process.env.GMAIL_USER?.trim();
  const password = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  const base = process.env.APP_URL;
  if (!sender || !/^[^\s<>@]+@gmail\.com$/i.test(sender) || !password || !base) return null;
  try {
    const url = new URL(base);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (url.protocol !== "https:" && !(process.env.VERCEL !== "1" && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) return null;
    return { sender, password, origin: url.origin };
  } catch { return null; }
}

export async function sendAppMail(email: string, subject: string, text: string, messageId?: string) {
  const config = recoveryConfig();
  if (!config) throw new Error("Mail is not configured");
  const transport = nodemailer.createTransport({
    host: "smtp.gmail.com", port: 465, secure: true,
    auth: { user: config.sender, pass: config.password },
    connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 10000,
    disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false,
  });
  try {
    await transport.sendMail({ from: { name: "Q&A", address: config.sender },
      to: [{ address: email, name: "" }], subject, text, ...(messageId ? { messageId } : {}) });
  } catch {
    // Never expose SMTP errors, credentials, recipients or reset tokens.
    throw new Error("Mail delivery failed");
  } finally { transport.close(); }
}

export async function sendRecoveryMail(email: string, purpose: "verify" | "reset", token: string) {
  const config = recoveryConfig();
  if (!config) throw new Error("Mail is not configured");
  const link = config.origin + "/konto/" + (purpose === "verify" ? "bestaetigen" : "passwort") + "#token=" + token;
  await sendAppMail(email,
    purpose === "verify" ? "Q&A: E-Mail-Adresse bestätigen" : "Q&A: Passwort zurücksetzen",
    (purpose === "verify" ? "Bestätige deine E-Mail-Adresse für Q&A:" : "Setze dein Q&A-Passwort zurück:") +
    "\n\n" + link + "\n\nDieser Link gilt einmalig für 30 Minuten. Wenn du dies nicht angefordert hast, ignoriere diese E-Mail.");
}
