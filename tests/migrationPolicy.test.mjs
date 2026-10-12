import test from "node:test";
import assert from "node:assert/strict";
import { migrationPolicy } from "../scripts/migration-policy.mjs";

test("local and CI builds continue to migrate", () => {
  assert.equal(migrationPolicy({}).run, true);
  assert.equal(migrationPolicy({ DATABASE_URL: "postgresql://local" }).run, true);
});

test("production builds always migrate", () => {
  assert.equal(migrationPolicy({ VERCEL: "1", VERCEL_ENV: "production" }).run, true);
});

test("preview builds require an exact explicit opt-in", () => {
  for (const value of [undefined, "", "false", "TRUE", "1"]) {
    assert.equal(
      migrationPolicy({
        VERCEL: "1",
        VERCEL_ENV: "preview",
        RUN_PREVIEW_MIGRATIONS: value,
        DATABASE_URL: "postgresql://preview",
      }).run,
      false
    );
  }
});

test("an opted-in preview refuses to continue without a database URL", () => {
  assert.throws(
    () => migrationPolicy({
      VERCEL: "1",
      VERCEL_ENV: "preview",
      RUN_PREVIEW_MIGRATIONS: "true",
    }),
    /DATABASE_URL fehlt/
  );
});

test("an opted-in preview with a database URL migrates", () => {
  assert.equal(
    migrationPolicy({
      VERCEL: "1",
      VERCEL_ENV: "preview",
      RUN_PREVIEW_MIGRATIONS: "true",
      DATABASE_URL: "postgresql://preview",
    }).run,
    true
  );
});

test("unknown Vercel environments never migrate automatically", () => {
  assert.equal(
    migrationPolicy({
      VERCEL: "1",
      VERCEL_ENV: "staging",
      RUN_PREVIEW_MIGRATIONS: "true",
      DATABASE_URL: "postgresql://staging",
    }).run,
    false
  );
});
