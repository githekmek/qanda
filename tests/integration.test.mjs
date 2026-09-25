import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { isolatedDatabase, command, succeeded } from "./database.mjs";

const require = createRequire(import.meta.url);
const password = "new-test-password-123";
const secret = "integration-test-secret-not-a-production-secret";
const setupCode = "integration-setup-code";

async function startServer(url) {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(port)], {
    env: { ...process.env, DATABASE_URL: url, SESSION_SECRET: secret, ADMIN_SETUP_CODE: setupCode, VERCEL: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  child.stdout.on("data", (data) => { logs = (logs + data).slice(-16000); });
  child.stderr.on("data", (data) => { logs = (logs + data).slice(-16000); });
  const origin = "http://127.0.0.1:" + port;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (child.exitCode !== null) throw new Error("Server exited: " + logs);
    try {
      if ((await fetch(origin + "/api/auth/me")).ok) {
        return {
          origin,
          async stop() {
            if (child.exitCode === null) {
              child.kill("SIGTERM");
              await once(child, "exit");
            }
          },
        };
      }
    } catch { /* Wait for the local server to listen. */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  child.kill("SIGTERM");
  throw new Error("Server did not start: " + logs);
}

test("security and compatibility against real PostgreSQL and HTTP routes", { timeout: 240000 }, async (t) => {
  const ctx = await isolatedDatabase();
  const servers = [];
  t.after(async () => {
    for (const server of servers) await server.stop();
    await ctx.close();
  });
  succeeded(command(["scripts/migrate-deploy.mjs"], ctx.url));
  servers.push(await startServer(ctx.url));
  servers.push(await startServer(ctx.url));
  const db = ctx.db;
  const oldHash = await bcrypt.hash("old123", 10);
  let serial = 0;
  async function user() {
    return db.user.create({ data: { username: "test_user_" + (++serial), passwordHash: oldHash } });
  }
  async function cookie(u) {
    const token = await new SignJWT({ userId: u.id, username: u.username })
      .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d")
      .sign(new TextEncoder().encode(secret));
    return "qanda_session=" + token;
  }
  async function request(path, { actor, data, method = "POST", server = 0 } = {}) {
    const headers = {};
    if (actor) headers.Cookie = await cookie(actor);
    if (data !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(servers[server].origin + path, {
      method, headers, body: data === undefined ? undefined : JSON.stringify(data),
    });
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = text; }
    return { status: response.status, body, headers: response.headers };
  }
  async function room(a, b = null, extra = {}) {
    return db.room.create({ data: {
      playerAId: a.id, playerBId: b?.id, currentAskerId: a.id,
      inviteCode: randomBytes(12).toString("hex"), ...extra,
    } });
  }

  await t.test("admin setup creates exactly one admin under concurrent registration", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) =>
      request("/api/auth/register", { data: { username: "setup_user_" + i, password, code: setupCode } })
    ));
    assert.equal(results.filter((r) => r.status === 200).length, 1, JSON.stringify(results));
    assert.equal(await db.user.count({ where: { isAdmin: true } }), 1);
    assert.equal(await db.user.count({ where: { username: { startsWith: "setup_user_" } } }), 1);
  });

  await t.test("existing six-character passwords and old-format session cookies still work", async () => {
    const a = await user();
    const response = await request("/api/auth/login", { data: { username: a.username, password: "old123" } });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("set-cookie"), /qanda_session=.*HttpOnly/i);
    assert.equal((await request("/api/auth/me", { actor: a, method: "GET" })).body.user.id, a.id);
    assert.equal((await db.user.findUnique({ where: { id: a.id } })).passwordHash, oldHash);
  });

  await t.test("failed login limits are shared across two app instances and expire", async () => {
    const a = await user();
    for (let i = 0; i < 10; i++) {
      assert.equal((await request("/api/auth/login", {
        data: { username: a.username, password: "wrong" }, server: i % 2,
      })).status, 401);
    }
    const blocked = await request("/api/auth/login", { data: { username: a.username, password: "wrong" }, server: 1 });
    assert.equal(blocked.status, 429);
    assert.ok(Number(blocked.headers.get("retry-after")) > 0);
    await db.loginRateLimit.updateMany({ data: { expiresAt: new Date(0) } });
    assert.equal((await request("/api/auth/login", { data: { username: a.username, password: "old123" } })).status, 200);
  });

  await t.test("concurrent questions create only one pending question and keep answers private", async () => {
    const a = await user(), b = await user(), stranger = await user();
    const r = await room(a, b);
    const results = await Promise.all(Array.from({ length: 6 }, () => request("/api/rooms/" + r.id + "/ask", {
      actor: a, data: { type: "TEXT", text: "Question", askerAnswer: "secret" },
    })));
    assert.equal(results.filter((res) => res.status === 200).length, 1, JSON.stringify(results));
    assert.equal(await db.question.count({ where: { roomId: r.id, status: "PENDING" } }), 1);
    const state = await request("/api/rooms/" + r.id + "/state", { actor: b, method: "GET" });
    assert.equal(state.body.pendingQuestion.askerAnswer, undefined);
    assert.equal((await request("/api/rooms/" + r.id + "/state", { actor: stranger, method: "GET" })).status, 404);
    const q = state.body.pendingQuestion;
    const answers = await Promise.all(Array.from({ length: 4 }, () =>
      request("/api/rooms/" + r.id + "/answer", { actor: b, data: { questionId: q.id, value: "reply" } })
    ));
    assert.equal(answers.filter((res) => res.status === 200).length, 1);
    assert.equal(await db.answer.count({ where: { questionId: q.id } }), 1);
    const after = await request("/api/rooms/" + r.id + "/state", { actor: b, method: "GET" });
    assert.equal(after.body.history[0].askerAnswer, "secret");
    assert.equal(after.body.isMyTurnToAsk, true);
  });

  await t.test("a failure between answer creation and status update rolls back the entire turn", async () => {
    const a = await user(), b = await user(), r = await room(a, b);
    const q = await db.question.create({ data: { roomId: r.id, askerId: a.id, type: "TEXT", text: "fault-injection", askerAnswer: "keep" } });
    await db.$executeRawUnsafe(`CREATE FUNCTION fail_question_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.text = 'fault-injection' THEN RAISE EXCEPTION 'injected test failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER fail_question_update BEFORE UPDATE ON "Question" FOR EACH ROW EXECUTE FUNCTION fail_question_update()');
    try {
      assert.equal((await request("/api/rooms/" + r.id + "/answer", { actor: b, data: { questionId: q.id, value: "reply" } })).status, 500);
      assert.equal(await db.answer.count({ where: { questionId: q.id } }), 0);
      assert.equal((await db.room.findUnique({ where: { id: r.id } })).currentAskerId, a.id);
      assert.equal((await db.question.findUnique({ where: { id: q.id } })).status, "PENDING");
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER fail_question_update ON "Question"');
      await db.$executeRawUnsafe("DROP FUNCTION fail_question_update()");
    }
    assert.equal((await request("/api/rooms/" + r.id + "/answer", { actor: b, data: { questionId: q.id, value: "reply" } })).status, 200);
  });

  await t.test("an existing partially saved answer can be completed without overwriting it", async () => {
    const a = await user(), b = await user(), r = await room(a, b);
    const q = await db.question.create({ data: { roomId: r.id, askerId: a.id, type: "TEXT", text: "Legacy pending", askerAnswer: "original" } });
    await db.answer.create({ data: { questionId: q.id, responderId: b.id, value: "previously saved" } });
    const res = await request("/api/rooms/" + r.id + "/answer", { actor: b, data: { questionId: q.id, value: "replacement" } });
    assert.equal(res.status, 200);
    assert.equal(res.body.answer.value, "previously saved");
    assert.equal((await db.room.findUnique({ where: { id: r.id } })).currentAskerId, b.id);
  });

  await t.test("a single access code cannot create multiple accounts", async () => {
    const admin = await db.user.findFirst({ where: { isAdmin: true } });
    await db.accessCode.create({ data: { code: "ONETIME", createdById: admin.id } });
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) =>
      request("/api/auth/register", { data: { username: "code_user_" + i, password, code: "ONETIME" } })
    ));
    assert.equal(results.filter((r) => r.status === 200).length, 1, JSON.stringify(results));
    assert.equal(await db.user.count({ where: { username: { startsWith: "code_user_" } } }), 1);
  });

  await t.test("registration is rolled back when claiming its code fails", async () => {
    const admin = await db.user.findFirst({ where: { isAdmin: true } });
    await db.accessCode.create({ data: { code: "FAILCLAIM", createdById: admin.id } });
    await db.$executeRawUnsafe(`CREATE FUNCTION fail_code_claim() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.code = 'FAILCLAIM' THEN RAISE EXCEPTION 'injected claim failure'; END IF; RETURN NEW; END $$`);
    await db.$executeRawUnsafe('CREATE TRIGGER fail_code_claim BEFORE UPDATE ON "AccessCode" FOR EACH ROW EXECUTE FUNCTION fail_code_claim()');
    try {
      assert.equal((await request("/api/auth/register", { data: { username: "rolled_back", password, code: "FAILCLAIM" } })).status, 500);
      assert.equal(await db.user.count({ where: { username: "rolled_back" } }), 0);
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER fail_code_claim ON "AccessCode"');
      await db.$executeRawUnsafe("DROP FUNCTION fail_code_claim()");
    }
  });

  await t.test("concurrent invite registration leaves exactly one account and seat", async () => {
    const a = await user(), r = await room(a);
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) =>
      request("/api/auth/register", { data: { username: "invite_user_" + i, password, inviteCode: r.inviteCode } })
    ));
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal(await db.user.count({ where: { username: { startsWith: "invite_user_" } } }), 1);
    assert.ok((await db.room.findUnique({ where: { id: r.id } })).playerBId);
  });

  await t.test("rotating an invite invalidates the previous link for both join paths", async () => {
    const a = await user(), b = await user(), r = await room(a);
    assert.equal((await request("/api/rooms/" + r.id + "/invite", { actor: a })).status, 200);
    assert.equal((await request("/api/invites/" + r.inviteCode, { actor: b })).status, 404);
    assert.equal((await request("/api/auth/register", { data: { username: "revoked_invite", password, inviteCode: r.inviteCode } })).status, 403);
    assert.equal(await db.user.count({ where: { username: "revoked_invite" } }), 0);
  });

  await t.test("racing invite rotation and joining cannot both succeed", async () => {
    for (let i = 0; i < 4; i++) {
      const a = await user(), b = await user(), r = await room(a);
      const [rotate, join] = await Promise.all([
        request("/api/rooms/" + r.id + "/invite", { actor: a }),
        request("/api/invites/" + r.inviteCode, { actor: b }),
      ]);
      assert.ok(!(rotate.status === 200 && join.status === 200), JSON.stringify({ rotate, join }));
    }
  });

  await t.test("restoring checks both players and leaves a full opponent's room archived", async () => {
    const a = await user(), b = await user();
    for (let i = 0; i < 5; i++) await room(b);
    const r = await room(a, b, { archivedAt: new Date() });
    const before = await db.room.findUnique({ where: { id: r.id } });
    assert.equal((await request("/api/rooms/" + r.id + "/archive", { actor: a, data: { archived: false } })).status, 409);
    assert.deepEqual(await db.room.findUnique({ where: { id: r.id } }), before);
  });

  await t.test("concurrent room creation cannot exceed five active rooms", async () => {
    const a = await user();
    for (let i = 0; i < 4; i++) await room(a);
    const results = await Promise.all(Array.from({ length: 5 }, () =>
      request("/api/rooms", { actor: a, data: { name: "last slot" } })
    ));
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    assert.equal(await db.room.count({ where: { playerAId: a.id, archivedAt: null } }), 5);
  });
});
