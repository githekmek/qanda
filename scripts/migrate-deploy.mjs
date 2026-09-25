import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const require = createRequire(import.meta.url);
const db = new PrismaClient();
const legacyReset = "20250103000000_rooms_and_access_codes";

try {
  const [tables] = await db.$queryRaw`
    SELECT to_regclass('"_prisma_migrations"')::text AS migrations,
           to_regclass('"User"')::text AS users,
           to_regclass('"Room"')::text AS rooms,
           to_regclass('"Question"')::text AS questions
  `;
  const applied = tables.migrations
    ? await db.$queryRaw`
        SELECT 1 FROM "_prisma_migrations"
        WHERE migration_name = ${legacyReset}
          AND finished_at IS NOT NULL AND rolled_back_at IS NULL
      ` : [];
  if (!applied.length) {
    const users = tables.users ? await db.$queryRaw`SELECT 1 FROM "User" LIMIT 1` : [];
    const rooms = tables.rooms ? await db.$queryRaw`SELECT 1 FROM "Room" LIMIT 1` : [];
    const questions = tables.questions ? await db.$queryRaw`SELECT 1 FROM "Question" LIMIT 1` : [];
    if (users.length || rooms.length || questions.length || tables.rooms) {
      throw new Error(
        "Datenschutz-Stopp: Die alte Löschmigration ist noch offen, aber die Datenbank enthält Bestandsdaten " +
        "oder ein vorhandenes Raumschema. Es wurde nichts verändert. Vor einem Upgrade ist eine " +
        "datenerhaltende Übernahme/Baseline erforderlich; niemals migrate reset ausführen."
      );
    }
  }
} finally {
  await db.$disconnect();
}
const result = spawnSync(process.execPath, [require.resolve("prisma/build/index.js"), "migrate", "deploy"], {
  stdio: "inherit", env: process.env,
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
