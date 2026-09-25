import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// Preview branches must never migrate a potentially shared production database.
if (process.env.VERCEL_ENV !== "preview") run(["scripts/migrate-deploy.mjs"]);
run([require.resolve("next/dist/bin/next"), "build"]);
