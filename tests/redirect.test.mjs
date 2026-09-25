import test from "node:test";
import assert from "node:assert/strict";
import { safeRedirect } from "../src/lib/safeRedirect.mjs";

test("preserves internal destinations", () => {
  for (const value of ["/", "/room/abc", "/join/ABC", "/?view=archive", "/room/x#history"]) {
    assert.equal(safeRedirect(value), value);
  }
});
test("rejects script, external, encoded and ambiguous destinations", () => {
  for (const value of [
    null, "", "javascript:alert(1)", "data:text/html,test", "https://example.org",
    "//example.org", "/\\example.org", "/%2fexample.org", "/%5cexample.org",
    "/%252fexample.org", "/\n/example.org", " /room/x", "/login", "/login?next=/login",
  ]) assert.equal(safeRedirect(value), "/", String(value));
});
