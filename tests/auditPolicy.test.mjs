import test from "node:test";
import assert from "node:assert/strict";
import { assessAudit } from "../scripts/audit-policy.mjs";

const url = "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm";
function fixture() {
  return {
    report: { auditReportVersion: 2, vulnerabilities: {
      braces: { nodes: ["node_modules/braces"], via: [{ name: "braces", url }] },
      micromatch: { nodes: ["node_modules/micromatch"], via: ["braces"] },
    } },
    lock: { packages: {
      "node_modules/braces": { dev: true, version: "3.0.3" },
      "node_modules/micromatch": { dev: true, version: "4.0.8" },
    } },
  };
}
test("only the approved development advisory and its dependency propagation are allowed", () => {
  const { report, lock } = fixture();
  assert.deepEqual(assessAudit(report, lock), { accepted: ["braces", "micromatch"], blocked: [] });
});
test("the same advisory in runtime dependencies blocks release", () => {
  const { report, lock } = fixture();
  delete lock.packages["node_modules/braces"].dev;
  assert.deepEqual(assessAudit(report, lock).blocked, ["braces", "micromatch"]);
});
test("new advisories, versions, packages and nested runtime copies block release", () => {
  for (const change of [
    ({ report }) => report.vulnerabilities.braces.via.push({ name: "braces", url: "https://github.com/advisories/another" }),
    ({ lock }) => { lock.packages["node_modules/braces"].version = "3.0.4"; },
    ({ report, lock }) => {
      report.vulnerabilities.braces.nodes.push("node_modules/other/node_modules/braces");
      lock.packages["node_modules/other/node_modules/braces"] = { version: "3.0.3" };
    },
  ]) {
    const data = fixture(); change(data);
    assert.deepEqual(assessAudit(data.report, data.lock).blocked, ["braces", "micromatch"]);
  }
  const { report, lock } = fixture();
  report.vulnerabilities.unknown = { nodes: ["node_modules/braces"], via: ["braces"] };
  assert.deepEqual(assessAudit(report, lock).blocked, ["unknown"]);
});
test("malformed reports, API errors and circular chains never silently pass", () => {
  const { report, lock } = fixture();
  for (const bad of [null, {}, { ...report, error: { code: "E503" } }, { ...report, vulnerabilities: [] }]) {
    assert.throws(() => assessAudit(bad, lock));
  }
  report.vulnerabilities.braces.via = ["micromatch"];
  assert.deepEqual(assessAudit(report, lock).blocked, ["braces", "micromatch"]);
});
