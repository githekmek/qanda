import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, cp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isolatedDatabase, command, succeeded, prismaCli } from "./database.mjs";

const oldMigrations = [
  "20250101000000_init",
  "20250102000000_add_reactions",
  "20250103000000_rooms_and_access_codes",
];

async function installOld(url, count = 3) {
  const dir = await mkdtemp(join(tmpdir(), "qanda-migrations-"));
  try {
    await mkdir(join(dir, "migrations"));
    await cp("prisma/schema.prisma", join(dir, "schema.prisma"));
    await cp("prisma/migrations/migration_lock.toml", join(dir, "migrations/migration_lock.toml"));
    for (const name of oldMigrations.slice(0, count)) {
      await cp("prisma/migrations/" + name, join(dir, "migrations", name), { recursive: true });
    }
    succeeded(command([prismaCli, "migrate", "deploy", "--schema", join(dir, "schema.prisma")], url));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("fresh installation succeeds through the guarded entry point", async () => {
  const ctx = await isolatedDatabase();
  try {
    succeeded(command(["scripts/migrate-deploy.mjs"], ctx.url));
    assert.equal(await ctx.db.loginRateLimit.count(), 0);
    assert.equal(await ctx.db.user.count(), 0);
  } finally { await ctx.close(); }
});

test("upgrade preserves every existing user, room, invitation, answer and reaction", async () => {
  const ctx = await isolatedDatabase();
  try {
    await installOld(ctx.url);
    const db = ctx.db;
    const a = await db.user.create({ data: { username: "existing_a", passwordHash: "unchanged_hash_a", isAdmin: true } });
    const b = await db.user.create({ data: { username: "existing_b", passwordHash: "unchanged_hash_b" } });
    const room = await db.room.create({ data: {
      name: "Bestehender Raum", inviteCode: "ORIGINALINVITE", playerAId: a.id,
      playerBId: b.id, currentAskerId: b.id,
    } });
    await db.room.create({ data: {
      name: "Archiv", inviteCode: "ARCHIVEDINVITE", playerAId: a.id,
      archivedAt: new Date("2026-01-01"), currentAskerId: a.id,
    } });
    const question = await db.question.create({ data: {
      roomId: room.id, askerId: a.id, type: "TEXT", text: "Private Frage",
      askerAnswer: "Private Antwort A", status: "ANSWERED",
    } });
    await db.answer.create({ data: { questionId: question.id, responderId: b.id, value: "Private Antwort B" } });
    await db.reaction.create({ data: { questionId: question.id, authorId: a.id, text: "Reaktion" } });
    await db.question.create({ data: {
      roomId: room.id, askerId: b.id, type: "TEXT", text: "Offene Frage", askerAnswer: "Noch geheim",
    } });
    await db.accessCode.create({ data: { code: "EXISTING", createdById: a.id } });
    async function snapshot() {
      const result = {};
      for (const model of ["user", "room", "question", "answer", "reaction", "accessCode"]) {
        result[model] = await db[model].findMany({ orderBy: { id: "asc" } });
      }
      return result;
    }
    const before = await snapshot();
    succeeded(command(["scripts/migrate-deploy.mjs"], ctx.url));
    assert.deepEqual(await snapshot(), before);
    assert.equal(await db.loginRateLimit.count(), 0);
    succeeded(command(["scripts/migrate-deploy.mjs"], ctx.url));
    assert.deepEqual(await snapshot(), before, "re-running deployment must also preserve data");
  } finally { await ctx.close(); }
});

test("legacy database with users refuses destructive migration without changing data", async () => {
  const ctx = await isolatedDatabase();
  try {
    await installOld(ctx.url, 2);
    await ctx.db.$executeRaw`INSERT INTO "User" ("id","username","passwordHash") VALUES ('legacy','legacy','keep-hash')`;
    const result = command(["scripts/migrate-deploy.mjs"], ctx.url);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Datenschutz-Stopp/);
    const rows = await ctx.db.$queryRaw`SELECT "username", "passwordHash" FROM "User"`;
    assert.deepEqual(rows, [{ username: "legacy", passwordHash: "keep-hash" }]);
    const applied = await ctx.db.$queryRaw`SELECT * FROM "_prisma_migrations" WHERE migration_name = '20250103000000_rooms_and_access_codes'`;
    assert.equal(applied.length, 0);
  } finally { await ctx.close(); }
});
