import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { migrationPolicy } from "./migration-policy.mjs";

const require = createRequire(import.meta.url);

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const migration = migrationPolicy(process.env);
console.log(migration.message);
if (migration.run) run(["scripts/migrate-deploy.mjs"]);

run([require.resolve("next/dist/bin/next"), "build"]);
