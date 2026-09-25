import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url);
export const prismaCli = require.resolve("prisma/build/index.js");

export function command(args, url) {
  return spawnSync(process.execPath, args, {
    env: { ...process.env, DATABASE_URL: url },
    encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
  });
}
export function succeeded(result) {
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
}
export async function isolatedDatabase() {
  const url = new URL(process.env.DATABASE_URL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Database tests require a local PostgreSQL instance, never production.");
  }
  const schema = "regression_" + randomBytes(8).toString("hex");
  const admin = new PrismaClient({ datasources: { db: { url: url.href } } });
  await admin.$executeRawUnsafe('CREATE SCHEMA "' + schema + '"');
  url.searchParams.set("schema", schema);
  const db = new PrismaClient({ datasources: { db: { url: url.href } } });
  return {
    db, url: url.href,
    async close() {
      await db.$disconnect();
      // schema is generated here, never supplied by a caller or environment.
      await admin.$executeRawUnsafe('DROP SCHEMA "' + schema + '" CASCADE');
      await admin.$disconnect();
    },
  };
}
