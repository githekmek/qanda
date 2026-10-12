import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { assessAudit } from "./audit-policy.mjs";

if (!process.env.npm_execpath) throw new Error("Bitte über npm run audit:security ausführen.");
const result = spawnSync(process.execPath, [process.env.npm_execpath, "audit", "--json"], {
  encoding: "utf8", maxBuffer: 8 * 1024 * 1024, env: process.env,
});
if (result.error) throw result.error;
if (result.status !== 0 && result.status !== 1) {
  throw new Error("npm audit konnte nicht erfolgreich ausgeführt werden.");
}
const report = JSON.parse(result.stdout);
const lock = JSON.parse(readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
const { accepted, blocked } = assessAudit(report, lock);
if (result.status === 1 && accepted.length === 0 && blocked.length === 0) {
  throw new Error("npm audit meldet einen Fehler ohne auswertbare Befunde.");
}
if (accepted.length) {
  console.warn("Dokumentierte Ausnahme GHSA-vfj7-8cjw-p6xm (nur Entwicklung): " + accepted.join(", "));
}
if (blocked.length) {
  console.error(JSON.stringify(report, null, 2));
  console.error("Nicht freigegebene Sicherheitsmeldungen: " + blocked.join(", "));
  process.exitCode = 1;
} else {
  console.log("Abhängigkeitsprüfung bestanden. Ausgenommene Meldungen bleiben oben sichtbar.");
}
