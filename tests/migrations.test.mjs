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
  "20260925000000_login_rate_limit",
  "20261001000000_multiple_select",
  "20261013000000_reaction_reads",
];

async function installOld(url, count = 6) {
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
    // Seed the old schema without the new Prisma client's default sessionVersion.
    await db.$executeRaw`INSERT INTO "User" ("id", "username", "passwordHash", "isAdmin") VALUES
      ('existing-a', 'existing_a', 'unchanged_hash_a', true),
      ('existing-b', 'existing_b', 'unchanged_hash_b', false)`;
    const a = { id: "existing-a" }, b = { id: "existing-b" };
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
    const singleRoom = await db.room.create({ data: {
      name: "Offenes Multiple Choice", inviteCode: "PENDINGMC", playerAId: a.id,
      playerBId: b.id, currentAskerId: a.id,
    } });
    await db.question.create({ data: {
      roomId: singleRoom.id, askerId: a.id, type: "MULTIPLE_CHOICE",
      text: "Offene Einfachauswahl", options: '["Alt A","Alt B"]', askerAnswer: "1",
    } });
    const completed = await db.question.create({ data: {
      roomId: singleRoom.id, askerId: b.id, type: "MULTIPLE_CHOICE",
      text: "Alte Einfachauswahl", options: '["A","B"]', askerAnswer: "0", status: "ANSWERED",
    } });
    await db.answer.create({ data: { questionId: completed.id, responderId: a.id, value: "1" } });

    await db.roomReactionVisit.create({ data: { userId: b.id, roomId: room.id } });
    const reaction = await db.reaction.findFirst({ where: { questionId: question.id } });
    await db.reactionRead.create({ data: { userId: b.id, reactionId: reaction.id } });

    async function snapshot() {
      const result = {};
      for (const model of ["user", "room", "question", "answer", "reaction", "accessCode"]) {
        result[model] = await db[model].findMany({ orderBy: { id: "asc" }, ...(model === "user" ? { select: { id: true, username: true, passwordHash: true, isAdmin: true, createdAt: true } } : {}) });
      }
      result.visits = await db.roomReactionVisit.findMany({ orderBy: { userId: "asc" } });
      result.reads = await db.reactionRead.findMany({ orderBy: { userId: "asc" } });
      return result;
    }
    const before = await snapshot();
    succeeded(command(["scripts/migrate-deploy.mjs"], ctx.url));
    assert.deepEqual(await snapshot(), before);
    assert.equal(await db.loginRateLimit.count(), 0);
    succeeded(command(["scripts/migrate-deploy.mjs"], ctx.url));
    assert.deepEqual(await snapshot(), before, "re-running deployment must also preserve data");
    const newQuestion = await db.question.create({ data: {
      roomId: room.id, askerId: a.id, type: "MULTIPLE_SELECT", text: "Neu",
      options: '["A","B"]', askerAnswer: "[0,1]",
    } });
    assert.equal(newQuestion.type, "MULTIPLE_SELECT");
    assert.equal(await db.recoveryToken.count(), 0);
    const preservedUser = await db.user.findUnique({ where: { id: a.id } });
    assert.equal(preservedUser.email, null);
    assert.equal(preservedUser.emailVerifiedAt, null);
    assert.equal(preservedUser.sessionVersion, 0);
    assert.equal(preservedUser.theme, "standard");
    assert.equal(preservedUser.notifyTurn, false);
    assert.equal(preservedUser.notifyComments, false);
    assert.equal(await db.notification.count(), 0);
    assert.equal(await db.roomReactionVisit.count(), 1);
    assert.equal(await db.reactionRead.count(), 1);

    succeeded(command(["scripts/migrate-deploy.mjs"], ctx.url));
    assert.equal(await db.reactionRead.count(), 1);
    assert.deepEqual((await snapshot()).reaction, before.reaction);
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
