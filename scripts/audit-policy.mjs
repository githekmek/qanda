// Approved exception: GHSA-vfj7-8cjw-p6xm, development-only Next.js lint chain.
// No untrusted user patterns reach this tooling. See README for scope and removal.
const advisoryUrl = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
const versions = {
  "@next/eslint-plugin-next": "16.3.8",
  "eslint-config-next": "16.3.8",
  "fast-glob": "3.3.1",
  micromatch: "4.0.8",
  braces: "3.0.3",
};

export function assessAudit(report, lock) {
  if (!report || report.error || report.auditReportVersion !== 2 ||
      !report.vulnerabilities || typeof report.vulnerabilities !== "object" ||
      Array.isArray(report.vulnerabilities) || !lock?.packages) {
    throw new Error("Ungültiger oder fehlgeschlagener npm-Audit-Bericht.");
  }
  const findings = report.vulnerabilities;
  function excepted(name, seen = new Set()) {
    const entry = findings[name];
    if (!Object.hasOwn(versions, name) || seen.has(name) || !entry ||
        !Array.isArray(entry.nodes) || entry.nodes.length === 0 ||
        !Array.isArray(entry.via) || entry.via.length === 0) return false;
    // Check every installation, including nested copies. Never allow runtime nodes.
    if (!entry.nodes.every((path) => lock.packages[path]?.dev === true &&
        lock.packages[path]?.version === versions[name] &&
        path.endsWith("node_modules/" + name))) return false;
    const nextSeen = new Set(seen).add(name);
    return entry.via.every((via) => typeof via === "string"
      ? excepted(via, nextSeen)
      : name === "braces" && via?.name === "braces" && via.url === advisoryUrl);
  }
  const accepted = [], blocked = [];
  for (const name of Object.keys(findings)) {
    (excepted(name) ? accepted : blocked).push(name);
  }
  return { accepted, blocked };
}
