import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import webpush from "web-push";
import { SignJWT } from "jose";
import { isolatedDatabase, command, succeeded } from "./database.mjs";

const require = createRequire(import.meta.url);
const password = "new-test-password-123";
const secret = "integration-test-secret-not-a-production-secret";
const setupCode = "integration-setup-code";
const vapid = webpush.generateVAPIDKeys();

let mailUrl = "";
const mails = [];
let rejectMail = false;
async function startServer(url) {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  const child = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "start", "-p", String(port)], {
    env: { ...process.env, DATABASE_URL: url, SESSION_SECRET: secret, ADMIN_SETUP_CODE: setupCode, VERCEL: "0", GMAIL_USER: "sender@gmail.com", GMAIL_APP_PASSWORD: "isolated-test-password", VAPID_PUBLIC_KEY: vapid.publicKey, VAPID_PRIVATE_KEY: vapid.privateKey, VAPID_SUBJECT: "mailto:push@example.test", CRON_SECRET: "isolated-cron-secret-at-least-32-characters", APP_URL: "https://qanda.example.test", TEST_MAIL_URL: mailUrl, NODE_OPTIONS: "--import=" + pathToFileURL(require.resolve("./mockGmail.mjs")).href },
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
  const mailServer = createHttpServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    if (rejectMail) { res.writeHead(503); res.end("{}"); return; }
    const message = JSON.parse(body);
    // Reject malformed requests so an incorrect provider contract fails recovery tests.
    if (req.method !== "POST" || req.headers.authorization !== "Bearer isolated-test-key" ||
        req.headers["content-type"] !== "application/json" ||
        message.from?.address !== "sender@gmail.com" || message.from?.name !== "Q&A" ||
        !Array.isArray(message.to) || message.to.length !== 1 || typeof message.to[0]?.address !== "string" ||
        typeof message.subject !== "string" || typeof message.text !== "string" ||
        "sender" in message || "textContent" in message) {
      res.writeHead(400); res.end('{"error":"Invalid Gmail message"}'); return;
    }
    mails.push(message);
    res.writeHead(201, { "Content-Type": "application/json" }); res.end('{"id":"test"}');
  });
  mailServer.listen(0, "127.0.0.1");
  await once(mailServer, "listening");
  mailUrl = "http://127.0.0.1:" + mailServer.address().port;
  t.after(async () => {
    for (const server of servers) await server.stop();
    await new Promise((resolve) => mailServer.close(resolve));
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
  await t.test("multiple choice sets stay private, match regardless of order and advance the turn", async () => {
    const a = await user(), b = await user(), r = await room(a, b);
    const asked = await request("/api/rooms/" + r.id + "/ask", {
      actor: a, data: { type: "MULTIPLE_SELECT", text: "Weekend?", options: ["A","B","C"], askerAnswer: "[2,0]" },
    });
    assert.equal(asked.status, 200, JSON.stringify(asked));
    assert.equal(asked.body.askerAnswer, "[0,2]");
    const pending = await request("/api/rooms/" + r.id + "/state", { actor: b, method: "GET" });
    assert.equal(pending.body.pendingQuestion.type, "MULTIPLE_SELECT");
    assert.equal(pending.body.pendingQuestion.askerAnswer, undefined);
    assert.equal(pending.body.pendingQuestion.isMatch, undefined);
    for (const value of ["[]", "[0,0]", "[3]", '["0"]', "[1.5]", "[true]", "0", "{}"]) {
      assert.equal((await request("/api/rooms/" + r.id + "/answer", { actor: b, data: { questionId: asked.body.id, value } })).status, 400, value);
      assert.equal(await db.answer.count({ where: { questionId: asked.body.id } }), 0);
      assert.equal((await db.question.findUnique({ where: { id: asked.body.id } })).status, "PENDING");
    }
    const answered = await request("/api/rooms/" + r.id + "/answer", { actor: b, data: { questionId: asked.body.id, value: "[2,0]" } });
    assert.equal(answered.status, 200);
    assert.equal(answered.body.isMatch, true);
    assert.equal(answered.body.answer.value, "[0,2]");
    assert.equal((await db.room.findUnique({ where: { id: r.id } })).currentAskerId, b.id);
    const next = await request("/api/rooms/" + r.id + "/ask", {
      actor: b, data: { type: "MULTIPLE_SELECT", text: "Next", options: ["A","B"], askerAnswer: "[0,1]" },
    });
    assert.equal(next.status, 200);
    const different = await request("/api/rooms/" + r.id + "/answer", { actor: a, data: { questionId: next.body.id, value: "[0]" } });
    assert.equal(different.status, 200);
    assert.equal(different.body.isMatch, false);
  });

  await t.test("invalid multi-select questions do not write data", async () => {
    const a = await user(), b = await user(), r = await room(a, b);
    for (const askerAnswer of ["[]", "[0,0]", "[2]", "1", "null", "[false]", "[0.5]", '["0"]']) {
      assert.equal((await request("/api/rooms/" + r.id + "/ask", {
        actor: a, data: { type: "MULTIPLE_SELECT", text: "Invalid", options: ["A","B"], askerAnswer },
      })).status, 400, askerAnswer);
    }
    for (const options of [undefined, ["A"], ["A","B","C","D","E","F","G","H","I"], ["A",""]]) {
      assert.equal((await request("/api/rooms/" + r.id + "/ask", {
        actor: a, data: { type: "MULTIPLE_SELECT", text: "Invalid", options, askerAnswer: "[0]" },
      })).status, 400);
    }
    assert.equal(await db.question.count({ where: { roomId: r.id } }), 0);
  });

  await t.test("existing pending single-choice and text rounds remain playable without rewriting history", async () => {
    const a = await user(), b = await user();
    for (const type of ["MULTIPLE_CHOICE", "TEXT"]) {
      const r = await room(a, b);
      const q = await db.question.create({ data: {
        roomId: r.id, askerId: a.id, type, text: "Existing open game",
        options: type === "MULTIPLE_CHOICE" ? '["A","B"]' : null,
        askerAnswer: type === "MULTIPLE_CHOICE" ? "1" : "Original",
      } });
      const before = await db.question.findUnique({ where: { id: q.id } });
      const pending = await request("/api/rooms/" + r.id + "/state", { actor: b, method: "GET" });
      assert.equal(pending.body.pendingQuestion.type, type);
      assert.equal(pending.body.pendingQuestion.askerAnswer, undefined);
      const answered = await request("/api/rooms/" + r.id + "/answer", {
        actor: b, data: { questionId: q.id, value: q.askerAnswer },
      });
      assert.equal(answered.status, 200);
      assert.equal(answered.body.isMatch, true);
      const after = await db.question.findUnique({ where: { id: q.id } });
      assert.deepEqual(after, { ...before, status: "ANSWERED" });
      assert.equal((await db.room.findUnique({ where: { id: r.id } })).inviteCode, r.inviteCode);
    }
  });

  await t.test("follow-up questions use the normal turn, keep comments and form a single chain", async () => {
    const a = await user(), b = await user(), r = await room(a, b, { currentAskerId: a.id });
    const parent = await db.question.create({ data: {
      roomId: r.id, askerId: b.id, type: "TEXT", text: "Ursprüngliche Frage",
      askerAnswer: "Antwort B", status: "ANSWERED",
      answer: { create: { responderId: a.id, value: "Antwort A" } },
    } });
    const comment = await db.reaction.create({ data: {
      questionId: parent.id, authorId: b.id, text: "Bestehender Kommentar",
    } });
    const path = "/api/rooms/" + r.id + "/ask";
    const payload = {
      type: "TEXT", text: "Erste Folgefrage", askerAnswer: "Eigene Folgeantwort",
      parentQuestionId: parent.id,
    };

    assert.equal((await request(path, { actor: b, data: payload })).status, 403);
    const created = await request(path, { actor: a, data: payload });
    assert.equal(created.status, 200);
    assert.deepEqual(created.body.parentQuestion, { id: parent.id, text: parent.text });
    assert.equal(created.body.hasFollowUp, false);
    assert.equal((await request(path, { actor: a, data: payload })).status, 409,
      "an open follow-up remains the only pending question");
    const stored = await db.question.findUnique({ where: { id: created.body.id } });
    assert.equal(stored.parentQuestionId, parent.id);
    assert.deepEqual(await db.reaction.findUnique({ where: { id: comment.id } }), comment);

    const answered = await request("/api/rooms/" + r.id + "/answer", {
      actor: b, data: { questionId: created.body.id, value: "Antwort auf die Folgefrage" },
    });
    assert.equal(answered.status, 200);
    assert.deepEqual(answered.body.parentQuestion, { id: parent.id, text: parent.text });
    const state = await request("/api/rooms/" + r.id + "/state", { actor: b, method: "GET" });
    const original = state.body.history.find((question) => question.id === parent.id);
    assert.equal(original.hasFollowUp, true);
    assert.equal(original.reactions.length, 1);

    assert.equal((await request(path, { actor: b, data: payload })).status, 409,
      "a question can have only one direct follow-up");
    const chained = await request(path, { actor: b, data: {
      ...payload, text: "Nächste Folgefrage", parentQuestionId: created.body.id,
    } });
    assert.equal(chained.status, 200);
    assert.equal(chained.body.parentQuestion.id, created.body.id);
  });

  await t.test("question drafts are private per room, survive turns and disappear when sent", async () => {
    const a = await user(), b = await user(), outsider = await user();
    const r = await room(a, b, { currentAskerId: b.id }), other = await room(a, outsider);
    const path = "/api/rooms/" + r.id + "/drafts";
    const draft = { type: "MULTIPLE_CHOICE", text: "Berge oder Meer?", options: ["Berge", ""], askerAnswer: "" };

    assert.equal((await request(path, { data: draft })).status, 401);
    assert.equal((await request(path, { actor: outsider, data: draft })).status, 404);
    assert.equal((await request(path, { actor: a, data: { ...draft, text: "  " } })).status, 400);
    assert.equal((await request(path, { actor: a, data: { ...draft, roomId: other.id } })).status, 400,
      "unknown fields are rejected instead of silently ignored");
    // Saving works while the opponent is on turn and options may still be incomplete.
    const created = await request(path, { actor: a, data: draft });
    assert.equal(created.status, 200);
    assert.deepEqual(created.body.options, ["Berge", ""]);
    assert.equal((await request("/api/rooms/" + other.id + "/drafts", { actor: a, method: "GET" })).body.length, 0);
    assert.equal((await request(path, { actor: b, method: "GET" })).body.length, 0, "the opponent never sees drafts");

    const draftPath = path + "/" + created.body.id;
    assert.equal((await request(draftPath, { actor: b, method: "PATCH", data: draft })).status, 404);
    assert.equal((await request(draftPath, { actor: b, method: "DELETE" })).status, 404);
    const updated = await request(draftPath, { actor: a, method: "PATCH", data: {
      ...draft, options: ["Berge", "Meer"], askerAnswer: "1",
    } });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.askerAnswer, "1");
    assert.equal((await request(path, { actor: a, method: "GET" })).body.length, 1);

    const ask = { type: "MULTIPLE_CHOICE", text: "Berge oder Meer?", options: ["Berge", "Meer"], askerAnswer: "1", draftId: created.body.id };
    assert.equal((await request("/api/rooms/" + r.id + "/ask", { actor: a, data: ask })).status, 403);
    assert.equal(await db.questionDraft.count({ where: { id: created.body.id } }), 1, "a refused question keeps its draft");
    await db.room.update({ where: { id: r.id }, data: { currentAskerId: a.id } });
    const sent = await request("/api/rooms/" + r.id + "/ask", { actor: a, data: ask });
    assert.equal(sent.status, 200);
    assert.equal(await db.questionDraft.count({ where: { id: created.body.id } }), 0);

    const kept = await request(path, { actor: a, data: { type: "TEXT", text: "Später", askerAnswer: "" } });
    assert.equal((await request(path + "/" + kept.body.id, { actor: a, method: "DELETE" })).status, 200);
    assert.equal((await request(path + "/" + kept.body.id, { actor: a, method: "DELETE" })).status, 404);
  });

  await t.test("comments allow 800 characters, quoted replies and one toggle per emoji and person", async () => {
    const a = await user(), b = await user(), outsider = await user(), r = await room(a, b);
    const q = await db.question.create({ data: {
      roomId: r.id, askerId: a.id, type: "TEXT", text: "Wie war der Urlaub?", askerAnswer: "Schön",
      status: "ANSWERED", answer: { create: { responderId: b.id, value: "Toll" } },
    } });
    const otherQ = await db.question.create({ data: {
      roomId: r.id, askerId: b.id, type: "TEXT", text: "Andere Frage", askerAnswer: "A", status: "ANSWERED",
    } });
    const legacy = await db.reaction.create({ data: { questionId: q.id, authorId: b.id, text: "Bestehender Kommentar" } });
    const comment = "Zeile eins\nZeile zwei " + "x".repeat(778); // exactly 800 characters
    const path = "/api/rooms/" + r.id;

    assert.equal((await request(path + "/reaction", { actor: a, data: { questionId: q.id, text: "y".repeat(801) } })).status, 400);
    const long = await request(path + "/reaction", { actor: a, data: { questionId: q.id, text: comment } });
    assert.equal(long.status, 200);
    const stored = long.body.reactions.find((c) => c.text === comment);
    assert.ok(stored, "line breaks and 800 characters are kept");
    assert.equal(stored.replyTo, null);
    assert.equal(long.body.reactions.find((c) => c.id === legacy.id).replyTo, null);

    const otherComment = await db.reaction.create({ data: { questionId: otherQ.id, authorId: a.id, text: "Woanders" } });
    assert.equal((await request(path + "/reaction", { actor: b, data: { questionId: q.id, text: "Hm", replyToId: otherComment.id } })).status, 400,
      "a reply can only quote a comment on the same question");
    const reply = await request(path + "/reaction", { actor: b, data: { questionId: q.id, text: "Erzähl mehr", replyToId: stored.id } });
    assert.equal(reply.status, 200);
    const quoted = reply.body.reactions.at(-1);
    assert.equal(quoted.replyTo.id, stored.id);
    assert.equal(quoted.replyTo.author.id, a.id);
    assert.ok(quoted.replyTo.text.length <= 161, "quotes repeat only the start of long comments");

    const emoji = (actor, data) => request(path + "/reaction-emoji", { actor, data });
    assert.equal((await emoji(undefined, { reactionId: legacy.id, emoji: "👍", active: true })).status, 401);
    assert.equal((await emoji(outsider, { reactionId: legacy.id, emoji: "👍", active: true })).status, 404);
    assert.equal((await emoji(a, { reactionId: legacy.id, emoji: "🦄", active: true })).status, 400);
    assert.equal((await emoji(a, { reactionId: otherComment.id + "x", emoji: "👍", active: true })).status, 404);
    await emoji(a, { reactionId: legacy.id, emoji: "👍", active: true });
    await emoji(a, { reactionId: legacy.id, emoji: "👍", active: true });
    await emoji(a, { reactionId: legacy.id, emoji: "😂", active: true });
    const both = await emoji(b, { reactionId: legacy.id, emoji: "👍", active: true });
    assert.equal(both.status, 200);
    assert.deepEqual(both.body.reactions.find((c) => c.id === legacy.id).emojis, [
      { emoji: "👍", count: 2, mine: true }, { emoji: "😂", count: 1, mine: false },
    ]);
    const removed = await emoji(a, { reactionId: legacy.id, emoji: "😂", active: false });
    assert.deepEqual(removed.body.reactions.find((c) => c.id === legacy.id).emojis, [{ emoji: "👍", count: 2, mine: true }]);
    assert.equal((await db.reaction.findUnique({ where: { id: legacy.id } })).text, "Bestehender Kommentar");

    await db.room.update({ where: { id: r.id }, data: { archivedAt: new Date() } });
    assert.equal((await emoji(a, { reactionId: legacy.id, emoji: "🔥", active: true })).status, 409);
    const state = await request(path + "/state", { actor: b, method: "GET" });
    const archived = state.body.history.find((item) => item.id === q.id);
    assert.deepEqual(archived.reactions.find((c) => c.id === legacy.id).emojis, [{ emoji: "👍", count: 2, mine: true }]);
  });

  await t.test("push subscriptions are private, device-specific and opt in", async () => {
    const a = await user(), b = await user();
    const endpoint = "https://push.example.test/subscription/" + randomBytes(12).toString("hex");
    const subscription = {
      endpoint,
      keys: { p256dh: "p".repeat(88), auth: "a".repeat(24) },
      userAgent: "integration-test",
    };
    assert.equal((await request("/api/push", { method: "GET" })).status, 401);
    const initial = await request("/api/push", { actor: a, method: "GET" });
    assert.equal(initial.body.available, true);
    assert.equal(initial.body.subscription, null);
    const crossOrigin = await fetch(servers[0].origin + "/api/push", {
      method: "POST",
      headers: { Cookie: await cookie(a), Origin: "https://attacker.example", "Content-Type": "application/json" },
      body: JSON.stringify(subscription),
    });
    assert.equal(crossOrigin.status, 403);
    const created = await request("/api/push", { actor: a, data: subscription });
    assert.equal(created.status, 200);
    assert.equal(created.body.subscription.notifyTurn, false);
    assert.equal(created.body.subscription.notifyComments, false);
    assert.equal((await request("/api/push", { actor: b, method: "PATCH",
      data: { endpoint, notifyTurn: true } })).status, 404);
    const updated = await request("/api/push", { actor: a, method: "PATCH",
      data: { endpoint, notifyComments: true } });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.subscription.notifyTurn, false);
    assert.equal(updated.body.subscription.notifyComments, true);
    assert.equal((await db.pushSubscription.findUnique({ where: { endpoint } })).userId, a.id);
    assert.equal((await request("/api/push", { actor: a, method: "DELETE", data: { endpoint } })).status, 200);
    assert.equal(await db.pushSubscription.count({ where: { endpoint } }), 0);
  });

  await t.test("browser: mobile creation, mode switching, removal, multiple answers and legacy radios", { skip: !process.env.QANDA_BROWSER_TESTS }, async () => {
    const { chromium } = await import("playwright");
    const { mkdir } = await import("node:fs/promises");
    const browser = await chromium.launch();
    try {
      const a = await user(), b = await user(), r = await room(a, b);
      const ca = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const cb = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await ca.addCookies([{ name: "qanda_session", value: (await cookie(a)).slice("qanda_session=".length), url: servers[0].origin }]);
      await cb.addCookies([{ name: "qanda_session", value: (await cookie(b)).slice("qanda_session=".length), url: servers[0].origin }]);
      const pa = await ca.newPage(), pb = await cb.newPage();
      const errors = [];
      pa.on("pageerror", (e) => errors.push(e.message));
      pb.on("pageerror", (e) => errors.push(e.message));
      await pa.goto(servers[0].origin + "/room/" + r.id);
      await pa.getByRole("button", { name: "Multiple Choice", exact: true }).click();
      assert.equal(await pa.getByRole("radio", { name: "Eine Antwort", exact: true }).isChecked(), true);
      await pa.getByLabel("Deine Frage", { exact: true }).fill("Was gehört zu deinem perfekten Wochenende?");
      await pa.getByRole("textbox", { name: "Option 1", exact: true }).fill("Ausschlafen");
      await pa.getByRole("textbox", { name: "Option 2", exact: true }).fill("Freunde treffen");
      await pa.getByRole("button", { name: "+ Option hinzufügen", exact: true }).click();
      await pa.getByRole("textbox", { name: "Option 3", exact: true }).fill("Zeit draußen");
      await pa.getByRole("button", { name: "+ Option hinzufügen", exact: true }).click();
      await pa.getByRole("textbox", { name: "Option 4", exact: true }).fill("Ein guter Film");
      await pa.getByRole("radio", { name: "Mehrere Antworten", exact: true }).check();
      await pa.getByRole("checkbox", { name: "Option 1 als eigene Antwort auswählen" }).check();
      await pa.getByRole("checkbox", { name: "Option 3 als eigene Antwort auswählen" }).check();
      await pa.getByRole("radio", { name: "Eine Antwort", exact: true }).check();
      await pa.getByRole("radio", { name: "Option 2 als eigene Antwort auswählen" }).check();
      await pa.getByRole("radio", { name: "Mehrere Antworten", exact: true }).check();
      assert.equal(await pa.getByRole("checkbox", { name: "Option 3 als eigene Antwort auswählen" }).isChecked(), true);
      await pa.getByRole("button", { name: "Option 2 entfernen" }).click();
      assert.equal(await pa.getByRole("textbox", { name: "Option 2", exact: true }).inputValue(), "Zeit draußen");
      assert.equal(await pa.getByRole("checkbox", { name: "Option 2 als eigene Antwort auswählen" }).isChecked(), true);
      assert.equal(await pa.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await mkdir("test-results", { recursive: true });
      await pa.screenshot({ path: "test-results/create-mobile.png", fullPage: true });
      const posted = pa.waitForResponse((res) => res.url().endsWith("/ask") && res.request().method() === "POST");
      await pa.getByRole("button", { name: "Frage stellen", exact: true }).click();
      assert.equal((await posted).status(), 200);
      const q = await db.question.findFirst({ where: { roomId: r.id, status: "PENDING" } });
      assert.equal(q.type, "MULTIPLE_SELECT");
      assert.equal(q.askerAnswer, "[0,1]");
      await pb.goto(servers[0].origin + "/room/" + r.id);
      await pb.getByRole("checkbox", { name: "Ausschlafen", exact: true }).waitFor();
      assert.equal(await pb.getByRole("radio").count(), 0);
      await pb.getByRole("button", { name: "Antworten abschicken", exact: true }).click();
      await pb.getByText("Bitte eine Option auswählen", { exact: true }).waitFor();
      assert.equal(await db.answer.count({ where: { questionId: q.id } }), 0);
      await pb.getByRole("checkbox", { name: "Zeit draußen", exact: true }).check();
      await pb.getByRole("checkbox", { name: "Ausschlafen", exact: true }).check();
      assert.equal(await pb.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await pb.screenshot({ path: "test-results/answer-mobile.png", fullPage: true });
      await pb.emulateMedia({ colorScheme: "dark" });
      await pb.screenshot({ path: "test-results/answer-dark.png", fullPage: true });
      const replied = pb.waitForResponse((res) => res.url().endsWith("/answer") && res.request().method() === "POST");
      await pb.getByRole("button", { name: "Antworten abschicken", exact: true }).click();
      const response = await replied;
      assert.equal(response.status(), 200);
      assert.equal((await response.json()).isMatch, true);
      await pb.getByText("✓ gleich", { exact: true }).first().waitFor();
      assert.equal(await pb.getByRole("listitem").filter({ hasText: "Ausschlafen" }).count(), 2);
      assert.equal(await pb.getByRole("listitem").filter({ hasText: "Zeit draußen" }).count(), 2);
      await pb.screenshot({ path: "test-results/history-mobile.png", fullPage: true });
      const legacy = await request("/api/rooms/" + r.id + "/ask", {
        actor: b, data: { type: "MULTIPLE_CHOICE", text: "Eine Antwort wie bisher", options: ["Alt A","Alt B"], askerAnswer: "1" },
      });
      assert.equal(legacy.status, 200);
      await pa.reload();
      await pa.getByRole("radio", { name: "Alt B", exact: true }).check();
      assert.equal(await pa.getByRole("checkbox").count(), 0);
      const legacyReply = pa.waitForResponse((res) => res.url().endsWith("/answer") && res.request().method() === "POST");
      await pa.getByRole("button", { name: "Antwort abschicken", exact: true }).click();
      assert.equal((await legacyReply).status(), 200);
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
    }
  });

  await t.test("reaction receipts: baseline, all foreign comments, independent users, authorization and older history", async () => {
    const a = await user(), b = await user(), outsider = await user(), r = await room(a, b);
    const q = await db.question.create({ data: { roomId: r.id, askerId: a.id, type: "TEXT", text: "Old conversation", askerAnswer: "A", status: "ANSWERED", createdAt: new Date("2020-01-01") } });
    const add = (author, text) => db.reaction.create({ data: { questionId: q.id, authorId: author.id, text } });
    const old = await add(b, "baseline");
    const path = "/api/rooms/" + r.id;
    const initialize = () => request(path + "/reaction-seen", { actor: a, data: { reactionIds: [] } });
    assert.equal((await initialize()).status, 200);
    assert.equal((await request(path + "/state", { actor: a, method: "GET" })).body.unreadReactionIds.length, 0);
    const first = await add(b, "one"), second = await add(b, "two"), own = await add(a, "own");
    // The old question is deliberately outside the existing 100-question window.
    await db.question.createMany({ data: Array.from({ length: 101 }, (_, i) => ({
      roomId: r.id, askerId: a.id, type: "TEXT", text: "Recent " + i, askerAnswer: "A", status: "ANSWERED",
    })) });
    const state = () => request(path + "/state", { actor: a, method: "GET" });
    assert.deepEqual(new Set((await state()).body.unreadReactionIds), new Set([first.id, second.id]));
    assert.ok((await state()).body.history.some((item) => item.id === q.id));
    await initialize(); // Reopening/another tab never acknowledges unseen comments.
    assert.equal((await state()).body.unreadReactionIds.length, 2);
    const otherRoom = await room(b, outsider);
    const otherQ = await db.question.create({ data: { roomId: otherRoom.id, askerId: b.id, type: "TEXT", text: "private", askerAnswer: "A", status: "ANSWERED" } });
    const privateReaction = await db.reaction.create({ data: { questionId: otherQ.id, authorId: b.id, text: "private" } });
    assert.equal((await request(path + "/reaction-seen", { data: { reactionIds: [first.id] } })).status, 401);
    assert.equal((await request(path + "/reaction-seen", { actor: outsider, data: { reactionIds: [first.id] } })).status, 404);
    assert.equal((await request(path + "/reaction-seen", { actor: a, data: { reactionIds: Array(101).fill(first.id) } })).status, 400);
    assert.equal((await request(path + "/reaction-seen", { actor: a, data: { reactionIds: [second.id, second.id, own.id, privateReaction.id, "missing"] } })).status, 200);
    assert.deepEqual((await state()).body.unreadReactionIds, [first.id], "reading out of order must preserve earlier unread comments");
    assert.equal(await db.reactionRead.count({ where: { userId: a.id, reactionId: { in: [own.id, privateReaction.id] } } }), 0);
    await db.room.update({ where: { id: r.id }, data: { archivedAt: new Date() } });
    assert.equal((await request(path + "/reaction-seen", { actor: a, data: { reactionIds: [first.id] } })).status, 200);
    assert.equal((await state()).body.unreadReactionIds.length, 0);
    const retained = await request(path + "/state?historySince=" + encodeURIComponent(q.createdAt.toISOString()), { actor: a, method: "GET" });
    assert.ok(retained.body.history.some((item) => item.id === q.id), "seen older questions remain accessible during the visit");
    assert.equal(await db.reaction.count({ where: { questionId: q.id } }), 4);
    assert.equal(await db.reactionRead.count({ where: { userId: b.id } }), 0);
    assert.ok(await db.reactionRead.findUnique({ where: { userId_reactionId: { userId: a.id, reactionId: old.id } } }));
  });

  await t.test("browser: collapse, visibility receipts, persistent visit highlights and new comments while collapsed", { skip: !process.env.QANDA_BROWSER_TESTS }, async () => {
    const { chromium } = await import("playwright");
    const { mkdir } = await import("node:fs/promises");
    const browser = await chromium.launch();
    try {
      const a = await user(), b = await user(), r = await room(a, b, { currentAskerId: b.id });
      const q = await db.question.create({ data: { roomId: r.id, askerId: a.id, type: "TEXT", text: "Kommentare testen", askerAnswer: "A", status: "ANSWERED" } });
      await request("/api/rooms/" + r.id + "/reaction-seen", { actor: a, data: { reactionIds: [] } });
      const add = (author, text) => db.reaction.create({ data: { questionId: q.id, authorId: author.id, text } });
      const first = await add(b, "Neue Nachricht eins"), second = await add(b, "Neue Nachricht zwei");
      await add(a, "Meine Nachricht");
      await db.question.createMany({ data: Array.from({ length: 8 }, (_, i) => ({
        roomId: r.id, askerId: a.id, type: "TEXT", text: "Neuere Frage " + i,
        askerAnswer: "A", status: "ANSWERED", createdAt: new Date(Date.now() + i + 1),
      })) });
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addCookies([{ name: "qanda_session", value: (await cookie(a)).slice("qanda_session=".length), url: servers[0].origin }]);
      const page = await context.newPage();
      let failedReceipt = false;
      await page.route("**/reaction-seen", async (route) => {
        if (!failedReceipt && route.request().postDataJSON()?.reactionIds?.length) {
          failedReceipt = true;
          await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"temporary test failure"}' });
        } else await route.continue();
      });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(servers[0].origin + "/room/" + r.id);
      const toggle = page.getByRole("button", { name: /Kommentare \(3\)/ });
      await toggle.waitFor();
      assert.equal(await toggle.getAttribute("aria-expanded"), "true");
      assert.equal(await page.locator("[data-new=true]").count(), 2);
      await new Promise((resolve) => setTimeout(resolve, 1800));
      assert.equal(await db.reactionRead.count({ where: { userId: a.id } }), 0, "off-screen expanded comments remain unread");
      await page.getByRole("button", { name: "Anzeigen", exact: true }).click();
      await page.locator("#reaction-" + second.id).scrollIntoViewIfNeeded();
      const waitRead = async (id) => {
        for (let i = 0; i < 50; i++) {
          if (await db.reactionRead.findUnique({ where: { userId_reactionId: { userId: a.id, reactionId: id } } })) return;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        assert.fail("visible reaction was not acknowledged");
      };
      await waitRead(first.id);
      await waitRead(second.id);
      assert.equal(failedReceipt, true, "a failed receipt is retried successfully");
      assert.equal(await page.locator("[data-new=true]").count(), 2, "receipts do not remove current-visit highlighting");
      await page.getByRole("textbox", { name: "Kommentar schreiben", exact: true }).fill("Mein Entwurf");
      await toggle.click();
      const third = await add(b, "Neu während eingeklappt");
      const changedToggle = page.getByRole("button", { name: /Kommentare \(4\)/ });
      await changedToggle.waitFor({ timeout: 12000 });
      assert.equal(await changedToggle.getAttribute("aria-expanded"), "false");
      assert.equal(await db.reactionRead.count({ where: { userId: a.id, reactionId: third.id } }), 0);
      await page.reload();
      await page.getByRole("button", { name: /Kommentare \(4\)/ }).waitFor();
      assert.equal(await page.locator("[data-new=true]").count(), 1, "only the unseen comment is new on the next visit");
      await page.getByRole("button", { name: "Anzeigen", exact: true }).click();
      await waitRead(third.id);
      await page.getByRole("textbox", { name: "Kommentar schreiben", exact: true }).fill("Entwurf bleibt");
      const finalToggle = page.getByRole("button", { name: /Kommentare \(4\)/ });
      await finalToggle.click();
      await finalToggle.click();
      assert.equal(await page.getByRole("textbox", { name: "Kommentar schreiben", exact: true }).inputValue(), "Entwurf bleibt");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await mkdir("test-results", { recursive: true });
      await page.screenshot({ path: "test-results/reactions-mobile.png", fullPage: true });
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await page.screenshot({ path: "test-results/reactions-dark.png", fullPage: true });
      await page.reload();
      await page.getByRole("button", { name: /Kommentare \(4\)/ }).waitFor();
      assert.equal(await page.locator("[data-new=true]").count(), 0);
      assert.equal(await page.getByRole("button", { name: /Kommentare \(4\)/ }).getAttribute("aria-expanded"), "false");
      const keyboardToggle = page.getByRole("button", { name: /Kommentare \(4\)/ });
      await keyboardToggle.focus();
      await page.keyboard.press("Enter");
      assert.equal(await keyboardToggle.getAttribute("aria-expanded"), "true");
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  await t.test("eight-option questions accept the last answer in both modes and reject nine options", async () => {
    for (const type of ["MULTIPLE_CHOICE", "MULTIPLE_SELECT"]) {
      const a = await user(), b = await user(), r = await room(a, b);
      const options = ["A","B","C","D","E","F","G","H"];
      const path = "/api/rooms/" + r.id;
      const askerAnswer = type === "MULTIPLE_SELECT" ? "[0,1,2,3,4,5,6,7]" : "7";
      for (const invalid of [[...options, "I"], ["A"]]) {
        const rejected = await request(path + "/ask", { actor: a, data: { type, text: "Limit", options: invalid, askerAnswer } });
        assert.equal(rejected.status, 400);
        assert.equal(await db.question.count({ where: { roomId: r.id } }), 0);
      }
      const asked = await request(path + "/ask", { actor: a, data: { type, text: "Acht Optionen", options, askerAnswer } });
      assert.equal(asked.status, 200, JSON.stringify(asked));
      const pending = await request(path + "/state", { actor: b, method: "GET" });
      assert.equal(pending.body.pendingQuestion.options.length, 8);
      assert.equal(pending.body.pendingQuestion.askerAnswer, undefined);
      const invalidAnswer = await request(path + "/answer", { actor: b, data: { questionId: asked.body.id, value: type === "MULTIPLE_SELECT" ? "[8]" : "8" } });
      assert.equal(invalidAnswer.status, 400);
      assert.equal(await db.answer.count({ where: { questionId: asked.body.id } }), 0);
      const answered = await request(path + "/answer", { actor: b, data: { questionId: asked.body.id, value: type === "MULTIPLE_SELECT" ? "[7,6,5,4,3,2,1,0]" : "7" } });
      assert.equal(answered.status, 200);
      assert.equal(answered.body.isMatch, true);
      assert.deepEqual(answered.body.options, options);
      assert.equal(answered.body.answer.value, askerAnswer);
    }
  });

  await t.test("browser: eight options, removal and last-option selection on mobile in both modes", { skip: !process.env.QANDA_BROWSER_TESTS }, async () => {
    const { chromium } = await import("playwright");
    const { mkdir } = await import("node:fs/promises");
    const browser = await chromium.launch();
    try {
      const a = await user(), b = await user();
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addCookies([{ name: "qanda_session", value: (await cookie(a)).slice("qanda_session=".length), url: servers[0].origin }]);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      for (const multiple of [false, true]) {
        const r = await room(a, b);
        await page.goto(servers[0].origin + "/room/" + r.id);
        await page.getByRole("button", { name: "Multiple Choice", exact: true }).click();
        if (multiple) await page.getByRole("radio", { name: "Mehrere Antworten", exact: true }).check();
        await page.getByLabel("Deine Frage", { exact: true }).fill("Acht Optionen im Browser");
        for (let i = 1; i <= 8; i++) {
          if (i > 2) await page.getByRole("button", { name: "+ Option hinzufügen", exact: true }).click();
          await page.getByRole("textbox", { name: "Option " + i, exact: true }).fill("Antwort " + i);
        }
        assert.equal(await page.getByRole("button", { name: "+ Option hinzufügen", exact: true }).count(), 0);
        const inputRole = multiple ? "checkbox" : "radio";
        await page.getByRole(inputRole, { name: "Option 8 als eigene Antwort auswählen", exact: true }).check();
        await page.getByRole("button", { name: "Option 2 entfernen", exact: true }).click();
        assert.equal(await page.getByRole(inputRole, { name: "Option 7 als eigene Antwort auswählen", exact: true }).isChecked(), true);
        assert.equal(await page.getByRole("textbox", { name: "Option 7", exact: true }).inputValue(), "Antwort 8");
        await page.getByRole("button", { name: "+ Option hinzufügen", exact: true }).click();
        await page.getByRole("textbox", { name: "Option 8", exact: true }).fill("Neue achte Antwort");
        await page.getByRole(inputRole, { name: "Option 8 als eigene Antwort auswählen", exact: true }).check();
        if (multiple) {
          for (let i = 1; i <= 8; i++) await page.getByRole("checkbox", { name: "Option " + i + " als eigene Antwort auswählen", exact: true }).check();
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        await mkdir("test-results", { recursive: true });
        await page.screenshot({ path: "test-results/eight-options-" + (multiple ? "multiple" : "single") + ".png", fullPage: true });
        const posted = page.waitForResponse((res) => res.url().endsWith("/ask") && res.request().method() === "POST");
        await page.getByRole("button", { name: "Frage stellen", exact: true }).click();
        const response = await posted;
        assert.equal(response.status(), 200);
        const q = await response.json();
        assert.equal(q.options.length, 8);
        assert.equal(q.askerAnswer, multiple ? "[0,1,2,3,4,5,6,7]" : "7");
        // Switch only this isolated test browser's cookie to the second fixture user.
        await context.addCookies([{ name: "qanda_session", value: (await cookie(b)).slice("qanda_session=".length), url: servers[0].origin }]);
        await page.reload();
        await page.getByRole(inputRole, { name: "Neue achte Antwort", exact: true }).check();
        if (multiple) {
          for (const label of q.options) await page.getByRole("checkbox", { name: label, exact: true }).check();
        }
        const replied = page.waitForResponse((res) => res.url().endsWith("/answer") && res.request().method() === "POST");
        await page.getByRole("button", { name: multiple ? "Antworten abschicken" : "Antwort abschicken", exact: true }).click();
        assert.equal((await replied).status(), 200);
        await page.getByText("✓ gleich", { exact: true }).first().waitFor();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
        await context.addCookies([{ name: "qanda_session", value: (await cookie(a)).slice("qanda_session=".length), url: servers[0].origin }]);
      }
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  async function waitMail(email, subject) {
    for (let i = 0; i < 100; i++) {
      const match = mails.findLast((mail) => mail.to[0].address === email && mail.subject.includes(subject));
      if (match) return match;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.fail("No mail received for " + email);
  }
  const mailToken = (mail) => mail.text.match(/#token=([a-f0-9]{64})/)[1];
  const tokenHash = (token) => createHash("sha256").update(token).digest("hex");

  await t.test("email verification and one-use password reset preserve game data and revoke old sessions", async () => {
    const a = await user(), b = await user(), r = await room(a, b);
    const beforeRoom = await db.room.findUnique({ where: { id: r.id } });
    const email = a.username + "@example.test";
    const path = "/api/auth/recovery";
    const crossOrigin = await fetch(servers[0].origin + path, {
      method: "POST", headers: { Origin: "https://attacker.example", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "request", email }),
    });
    assert.equal(crossOrigin.status, 403);
    assert.equal((await request(path, { data: { action: "email", email, password: "old123" } })).status, 401);
    assert.equal((await request(path, { actor: a, data: { action: "email", email, password: "wrong" } })).status, 403);
    assert.equal((await request(path, { actor: a, data: { action: "email", email: email.toUpperCase(), password: "old123" } })).status, 200);
    assert.equal((await db.user.findUnique({ where: { id: a.id } })).email, null, "not saved before verification");
    const verification = mailToken(await waitMail(email, "bestätigen"));
    const rows = await db.recoveryToken.findMany({ where: { userId: a.id } });
    assert.equal(rows[0].tokenHash, tokenHash(verification));
    assert.ok(!JSON.stringify(rows).includes(verification));
    assert.equal((await request(path, { data: { action: "reset", token: verification, password } })).status, 400);
    assert.equal((await request(path, { data: { action: "verify", token: verification } })).status, 200);
    assert.equal((await request(path, { data: { action: "verify", token: verification } })).status, 400);
    const account = await request(path, { actor: a, method: "GET" });
    assert.equal(account.body.email, email);
    assert.equal(account.body.verified, true);
    const other = await request(path, { actor: b, method: "GET" });
    assert.equal(other.body.email, null);
    const unknown = await request(path, { data: { action: "request", email: "unknown@example.test" } });
    const known = await request(path, { data: { action: "request", email } });
    assert.deepEqual(known.body, unknown.body);
    const reset = mailToken(await waitMail(email, "zurücksetzen"));
    assert.equal((await request(path, { data: { action: "reset", token: reset, password: "short" } })).status, 400);
    const outcomes = await Promise.all([0,1].map((server) => request(path, { server, data: { action: "reset", token: reset, password } })));
    assert.equal(outcomes.filter((r) => r.status === 200).length, 1, JSON.stringify(outcomes));
    assert.equal((await request(path, { actor: a, method: "GET" })).status, 401, "old-format sessions revoked");
    assert.equal((await request("/api/auth/login", { data: { username: a.username, password: "old123" } })).status, 401);
    const login = await request("/api/auth/login", { data: { username: a.username, password } });
    assert.equal(login.status, 200);
    const authenticated = await fetch(servers[0].origin + path, { headers: { Cookie: login.headers.get("set-cookie").split(";")[0] } });
    assert.equal(authenticated.status, 200, "fresh session uses current version");
    assert.deepEqual(await db.room.findUnique({ where: { id: r.id } }), beforeRoom);
    assert.equal((await db.user.findUnique({ where: { id: b.id } })).sessionVersion, 0);
    assert.equal(await db.recoveryToken.count({ where: { userId: a.id } }), 0);
  });

  await t.test("admin reset links work without email, preserve game data and revoke sessions only after use", async () => {
    const admin = await db.user.findFirstOrThrow({ where: { isAdmin: true } });
    const target = await user(), friend = await user(), r = await room(target, friend);
    const question = await db.question.create({ data: {
      roomId: r.id, askerId: target.id, type: "TEXT", text: "Bestehende Frage",
      askerAnswer: "Bestehende Antwort", status: "ANSWERED",
      answer: { create: { responderId: friend.id, value: "Bestehende Mitspielerantwort" } },
    } });
    await db.reaction.create({ data: {
      questionId: question.id, authorId: friend.id, text: "Bestehender Kommentar",
    } });
    const preserved = {
      room: await db.room.findUnique({ where: { id: r.id } }),
      question: await db.question.findUnique({ where: { id: question.id } }),
      reactions: await db.reaction.findMany({ where: { questionId: question.id }, orderBy: { id: "asc" } }),
    };
    const endpoint = "/api/admin/password-reset";

    assert.equal((await request(endpoint + "?username=" + target.username, { method: "GET" })).status, 403);
    assert.equal((await request(endpoint + "?username=" + target.username, { actor: friend, method: "GET" })).status, 403);
    const found = await request(endpoint + "?username=" + target.username, { actor: admin, method: "GET" });
    assert.equal(found.status, 200);
    assert.deepEqual(found.body, { user: { username: target.username } });
    assert.deepEqual((await request(endpoint + "?username=unknown_player", { actor: admin, method: "GET" })).body, { user: null });
    const crossOrigin = await fetch(servers[0].origin + endpoint, {
      method: "POST",
      headers: {
        Cookie: await cookie(admin),
        Origin: "https://attacker.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username: target.username }),
    });
    assert.equal(crossOrigin.status, 403);

    const first = await request(endpoint, { actor: admin, data: { username: target.username } });
    assert.equal(first.status, 200);
    assert.match(first.body.path, /^\/konto\/passwort#token=[a-f0-9]{64}$/);
    const firstToken = first.body.path.split("#token=")[1];
    let stored = await db.recoveryToken.findMany({ where: { userId: target.id, purpose: "admin-reset" } });
    assert.equal(stored.length, 1);
    assert.equal(stored[0].tokenHash, tokenHash(firstToken));
    assert.equal(stored[0].email, "");
    assert.ok(!JSON.stringify(stored).includes(firstToken));
    // /api/auth/me always answers 200; a valid session is visible in its body.
    assert.equal((await request("/api/auth/me", { actor: target, method: "GET" })).body.user?.id, target.id,
      "creating a link must not end an existing session");

    const second = await request(endpoint, { actor: admin, data: { username: target.username }, server: 1 });
    assert.equal(second.status, 200);
    const secondToken = second.body.path.split("#token=")[1];
    stored = await db.recoveryToken.findMany({ where: { userId: target.id, purpose: "admin-reset" } });
    assert.equal(stored.length, 1, "a new admin link invalidates the older admin link");
    assert.equal(stored[0].tokenHash, tokenHash(secondToken));
    assert.equal((await request("/api/auth/recovery", {
      data: { action: "reset", token: firstToken, password },
    })).status, 400);
    assert.equal((await request("/api/auth/recovery", {
      data: { action: "reset", token: secondToken, password },
    })).status, 200);
    assert.equal((await request("/api/auth/recovery", {
      data: { action: "reset", token: secondToken, password },
    })).status, 400, "the link is single-use");
    assert.equal((await request("/api/auth/me", { actor: target, method: "GET" })).body.user, null,
      "using the link ends the old session");
    assert.equal((await request("/api/auth/login", {
      data: { username: target.username, password: "old123" },
    })).status, 401);
    assert.equal((await request("/api/auth/login", {
      data: { username: target.username, password },
    })).status, 200);
    assert.deepEqual(await db.room.findUnique({ where: { id: r.id } }), preserved.room);
    assert.deepEqual(await db.question.findUnique({ where: { id: question.id } }), preserved.question);
    assert.deepEqual(
      await db.reaction.findMany({ where: { questionId: question.id }, orderBy: { id: "asc" } }),
      preserved.reactions,
    );
    assert.equal(await db.recoveryToken.count({ where: { userId: target.id } }), 0);
  });

  await t.test("expired links, duplicate emails and failed mail delivery never overwrite accounts", async () => {
    const a = await user(), b = await user();
    const path = "/api/auth/recovery", email = a.username + "@example.test";
    await db.user.update({ where: { id: b.id }, data: { email, emailVerifiedAt: new Date() } });
    const before = await db.user.findUnique({ where: { id: a.id } });
    await request(path, { actor: a, data: { action: "email", email, password: "old123" } });
    assert.equal(await db.recoveryToken.count({ where: { userId: a.id } }), 0);
    rejectMail = true;
    try {
      assert.equal((await request(path, { actor: a, data: { action: "email", email: "delivery-failure@example.test", password: "old123" } })).status, 503);
    } finally { rejectMail = false; }
    assert.equal(await db.recoveryToken.count({ where: { userId: a.id } }), 0);
    const expired = randomBytes(32).toString("hex");
    await db.recoveryToken.create({ data: { tokenHash: tokenHash(expired), userId: a.id, email: "expired@example.test", purpose: "verify", sessionVersion: 0, expiresAt: new Date(0) } });
    assert.equal((await request(path, { data: { action: "verify", token: expired } })).status, 400);
    assert.deepEqual(await db.user.findUnique({ where: { id: a.id } }), before);
    for (let i = 0; i < 3; i++) assert.equal((await request(path, { data: { action: "request", email: "rate-limited@example.test" } })).status, 200);
    assert.equal((await request(path, { data: { action: "request", email: "rate-limited@example.test" } })).status, 429);
    assert.equal((await request("/api/auth/login", { data: { username: a.username, password: "old123" } })).status, 200);
  });

  await t.test("browser: shared checkbox answers are marked individually, including one selected option", { skip: !process.env.QANDA_BROWSER_TESTS }, async () => {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const a = await user(), b = await user(), r = await room(a, b, { currentAskerId: b.id });
      const q = await db.question.create({ data: { roomId: r.id, askerId: a.id, type: "MULTIPLE_SELECT", text: "Teilweise gleich", options: '["Kino","Kino","Sport"]', askerAnswer: "[0,2]", status: "ANSWERED", answer: { create: { responderId: b.id, value: "[0,1]" } } } });
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addCookies([{ name: "qanda_session", value: (await cookie(a)).slice("qanda_session=".length), url: servers[0].origin }]);
      const page = await context.newPage();
      await page.goto(servers[0].origin + "/room/" + r.id);
      await page.getByText("Teilweise gleich", { exact: false }).waitFor();
      assert.equal(await page.getByLabel("Von beiden gewählt", { exact: true }).count(), 2);
      assert.equal(await page.getByText("✓ gleich", { exact: true }).count(), 0);
      await db.question.update({ where: { id: q.id }, data: { askerAnswer: "[0]" } });
      await page.reload();
      await page.getByText("Teilweise gleich", { exact: false }).waitFor();
      assert.equal(await page.getByLabel("Von beiden gewählt", { exact: true }).count(), 2);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    } finally { await browser.close(); }
  });

  await t.test("browser: account email confirmation and password-reset forms", { skip: !process.env.QANDA_BROWSER_TESTS }, async () => {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const a = await user(), email = a.username + "@example.test";
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addCookies([{ name: "qanda_session", value: (await cookie(a)).slice("qanda_session=".length), url: servers[0].origin }]);
      const page = await context.newPage(), errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(servers[0].origin + "/konto");
      await page.getByRole("textbox", { name: "E-Mail-Adresse", exact: true }).fill(email);
      await page.getByLabel("Aktuelles Passwort", { exact: true }).fill("old123");
      const emailResponse = page.waitForResponse((res) => res.url().endsWith("/api/auth/recovery") && res.request().method() === "POST");
      await page.getByRole("button", { name: "Bestätigungsmail senden" }).click();
      const sent = await emailResponse;
      assert.equal(sent.status(), 200, await sent.text());
      await page.getByRole("status").filter({ hasText: "Wenn die Adresse" }).waitFor();
      const verify = mailToken(await waitMail(email, "bestätigen"));
      await page.goto(servers[0].origin + "/konto/bestaetigen#token=" + verify);
      await page.getByRole("button", { name: "E-Mail bestätigen", exact: true }).click();
      await page.getByText("Deine E-Mail-Adresse ist bestätigt.", { exact: true }).waitFor();
      assert.ok(!page.url().includes(verify));
      await page.goto(servers[0].origin + "/passwort-vergessen");
      await page.getByRole("textbox", { name: "E-Mail-Adresse", exact: true }).fill(email);
      await page.getByRole("button", { name: "Reset-Link anfordern" }).click();
      const reset = mailToken(await waitMail(email, "zurücksetzen"));
      await page.goto(servers[0].origin + "/konto/passwort#token=" + reset);
      await page.getByLabel("Neues Passwort", { exact: true }).fill(password);
      await page.getByLabel("Neues Passwort wiederholen", { exact: true }).fill("different-password");
      await page.getByRole("button", { name: "Passwort speichern" }).click();
      await page.getByRole("alert").filter({ hasText: "stimmen nicht überein" }).waitFor();
      await page.getByLabel("Neues Passwort wiederholen", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Passwort speichern" }).click();
      await page.getByRole("link", { name: "Jetzt anmelden" }).waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await page.goto(servers[0].origin + "/konto");
      await page.waitForURL("**/login");
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  await t.test("browser: admin can generate a password-reset link for a player without email", { skip: !process.env.QANDA_BROWSER_TESTS }, async () => {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch();
    try {
      const admin = await db.user.findFirstOrThrow({ where: { isAdmin: true } });
      const target = await user();
      assert.equal(target.email, null);
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addCookies([{
        name: "qanda_session",
        value: (await cookie(admin)).slice("qanda_session=".length),
        url: servers[0].origin,
      }]);
      const page = await context.newPage(), errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(servers[0].origin + "/admin");
      await page.getByRole("heading", { name: "Administration", exact: true }).waitFor();
      await page.getByLabel("Spielername", { exact: true }).fill(target.username);
      await page.getByRole("button", { name: "Spieler suchen", exact: true }).click();
      await page.getByText("Gefunden:").filter({ hasText: target.username }).waitFor();
      await page.getByRole("button", { name: "Reset-Link erzeugen", exact: true }).click();
      const resetLink = await page.getByLabel("Passwortreset-Link", { exact: true }).inputValue();
      assert.equal(resetLink.startsWith(servers[0].origin + "/konto/passwort#token="), true);
      assert.match(resetLink.split("#token=")[1], /^[a-f0-9]{64}$/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await page.goto(resetLink);
      await page.getByLabel("Neues Passwort", { exact: true }).fill(password);
      await page.getByLabel("Neues Passwort wiederholen", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Passwort speichern", exact: true }).click();
      await page.getByRole("link", { name: "Jetzt anmelden", exact: true }).waitFor();
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

  async function dispatch(server = 0) {
    const response = await fetch(servers[server].origin + "/api/notifications/dispatch", {
      headers: { Authorization: "Bearer isolated-cron-secret-at-least-32-characters" },
    });
    return { status: response.status, body: await response.json() };
  }
  async function verifiedUser() {
    const a = await user();
    return db.user.update({ where: { id: a.id }, data: { email: a.username + "@example.test", emailVerifiedAt: new Date() } });
  }

  await t.test("profile settings are private, opt-in and reject unverified email or injected fields", async () => {
    const a = await user(), b = await verifiedUser();
    assert.equal((await request("/api/profile", { method: "GET" })).status, 401);
    let p = await request("/api/profile", { actor: a, method: "GET" });
    assert.equal(p.body.theme, "standard");
    assert.equal(p.body.notifyTurn, false);
    assert.equal(p.body.notifyComments, false);
    assert.equal(p.body.passwordHash, undefined);
    assert.equal((await request("/api/profile", { actor: a, method: "PATCH", data: { notifyTurn: true } })).status, 400);
    assert.equal((await request("/api/profile", { actor: a, method: "PATCH", data: { theme: "colorful" } })).status, 200);
    assert.equal((await request("/api/profile", { actor: a, method: "PATCH", data: { userId: b.id, theme: "dark" } })).status, 400);
    assert.equal((await request("/api/profile", { actor: a, method: "PATCH", data: { theme: "invalid" } })).status, 400);
    p = await request("/api/profile", { actor: b, method: "PATCH", data: { notifyTurn: true } });
    assert.equal(p.body.notifyTurn, true);
    assert.equal(p.body.notifyComments, false);
    assert.equal((await request("/api/profile", { actor: a, method: "GET", server: 1 })).body.theme, "colorful");
    const badOrigin = await fetch(servers[0].origin + "/api/profile", {
      method: "PATCH", headers: { Cookie: await cookie(a), Origin: "https://evil.example", "Content-Type": "application/json" },
      body: JSON.stringify({ theme: "dark" }),
    });
    assert.equal(badOrigin.status, 403);
  });

  await t.test("turn mail targets the next player without revealing private game content", async () => {
    const a = await verifiedUser(), b = await verifiedUser(), r = await room(a, b);
    await request("/api/profile", { actor: b, method: "PATCH", data: { notifyTurn: true } });
    const asked = await request("/api/rooms/" + r.id + "/ask", { actor: a,
      data: { type: "TEXT", text: "PRIVATE QUESTION", askerAnswer: "PRIVATE ANSWER" } });
    assert.equal(asked.status, 200);
    const mail = await waitMail(b.email, "am Zug");
    assert.ok(mail.text.includes("/room/" + r.id));
    assert.ok(!mail.text.includes("PRIVATE"));
    assert.equal(mails.filter(m => m.to[0].address === a.email).length, 0);
    assert.equal((await dispatch()).status, 200);
    assert.equal(mails.filter(m => m.to[0].address === b.email).length, 1);
    const answered = await request("/api/rooms/" + r.id + "/answer", { actor: b, data: { questionId: asked.body.id, value: "PRIVATE RESPONSE" } });
    assert.equal(answered.status, 200);
    for (let i = 0; i < 100 && mails.filter(m => m.to[0].address === b.email).length < 2; i++) await new Promise(r => setTimeout(r, 50));
    assert.equal(mails.filter(m => m.to[0].address === b.email).length, 2, "the responder can now ask");
  });

  await t.test("comment notifications batch foreign comments, survive SMTP failure and have single concurrent claim", async () => {
    const a = await verifiedUser(), b = await verifiedUser(), r = await room(a, b);
    await request("/api/profile", { actor: b, method: "PATCH", data: { notifyComments: true } });
    const q = await db.question.create({ data: { roomId: r.id, askerId: a.id, type: "TEXT",
      text: "Private question", askerAnswer: "Private answer", status: "ANSWERED" } });
    for (const actor of [a, a, b]) {
      const res = await request("/api/rooms/" + r.id + "/reaction", { actor, data: { questionId: q.id, text: "PRIVATE COMMENT" } });
      assert.equal(res.status, 200);
    }
    assert.equal(await db.notification.count({ where: { userId: b.id } }), 2);
    assert.equal(await db.notification.count({ where: { userId: a.id } }), 0);
    assert.equal(mails.filter(m => m.to[0].address === b.email).length, 0);
    await db.notification.updateMany({ where: { userId: b.id }, data: { dueAt: new Date(0) } });
    rejectMail = true;
    try { assert.equal((await dispatch()).status, 200); } finally { rejectMail = false; }
    assert.equal(await db.notification.count({ where: { userId: b.id } }), 2, "failed sends stay queued");
    assert.equal(await db.reaction.count({ where: { questionId: q.id } }), 3);
    await db.notification.updateMany({ where: { userId: b.id }, data: { dueAt: new Date(0) } });
    await Promise.all([dispatch(0), dispatch(1)]);
    const delivered = mails.filter(m => m.to[0].address === b.email);
    assert.equal(delivered.length, 1);
    assert.ok(delivered[0].subject.includes("Kommentare"));
    assert.ok(!delivered[0].text.includes("PRIVATE"));
    assert.equal(await db.notification.count({ where: { userId: b.id } }), 0);
  });

  await t.test("opting out cancels pending mails; archive and stale turns are suppressed; dispatch requires secret", async () => {
    const a = await verifiedUser(), b = await verifiedUser(), r = await room(a, b);
    await request("/api/profile", { actor: b, method: "PATCH", data: { notifyTurn: true, notifyComments: true } });
    await db.notification.create({ data: { eventKey: "cancel-" + r.id, userId: b.id, roomId: r.id, kind: "comment", dueAt: new Date(0) } });
    await request("/api/profile", { actor: b, method: "PATCH", data: { notifyComments: false } });
    assert.equal(await db.notification.count({ where: { userId: b.id } }), 0);
    assert.equal((await request("/api/profile", { actor: b, method: "GET" })).body.notifyTurn, true);
    await db.notification.create({ data: { eventKey: "stale-" + r.id, userId: b.id, roomId: r.id, kind: "turn", dueAt: new Date(0) } });
    await dispatch();
    assert.equal(mails.filter(m => m.to[0].address === b.email).length, 0);
    await db.room.update({ where: { id: r.id }, data: { archivedAt: new Date(), currentAskerId: b.id } });
    await db.notification.create({ data: { eventKey: "archive-" + r.id, userId: b.id, roomId: r.id, kind: "turn", dueAt: new Date(0) } });
    await dispatch();
    assert.equal(mails.filter(m => m.to[0].address === b.email).length, 0);
    assert.equal((await fetch(servers[0].origin + "/api/notifications/dispatch")).status, 401);
  });

  await t.test("browser: all three themes persist across devices and preserve independent notification switches", { skip: !process.env.QANDA_BROWSER_TESTS }, async () => {
    const { chromium } = await import("playwright");
    const { mkdir } = await import("node:fs/promises");
    const browser = await chromium.launch();
    try {
      const a = await verifiedUser();
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      await context.addCookies([{ name: "qanda_session", value: (await cookie(a)).slice("qanda_session=".length), url: servers[0].origin }]);
      const page = await context.newPage(), errors = [];
      page.on("pageerror", e => errors.push(e.message));
      await page.goto(servers[0].origin + "/konto");
      for (const label of ["Wenn ich am Zug bin", "Bei neuen Kommentaren"]) {
        assert.equal(await page.getByRole("switch", { name: label }).getAttribute("aria-checked"), "false");
      }
      await mkdir("test-results", { recursive: true });
      for (const [name, theme] of [["Bunt", "colorful"], ["Dark", "dark"], ["System", "standard"]]) {
        const saved = page.waitForResponse(res => res.url().endsWith("/api/profile") && res.request().method() === "PATCH");
        await page.getByRole("button", { name, exact: false }).filter({ hasText: name }).click();
        assert.equal((await saved).status(), 200);
        await page.waitForFunction(value => document.documentElement.dataset.theme === value, theme);
        await page.reload();
        assert.equal(await page.locator("html").getAttribute("data-theme"), theme);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.screenshot({ path: "test-results/profile-" + theme + ".png", fullPage: true });
      }
      const saved = page.waitForResponse(res => res.url().endsWith("/api/profile") && res.request().method() === "PATCH");
      await page.getByRole("switch", { name: "Wenn ich am Zug bin" }).click();
      assert.equal((await saved).status(), 200);
      await page.reload();
      assert.equal(await page.getByRole("switch", { name: "Wenn ich am Zug bin" }).getAttribute("aria-checked"), "true");
      assert.equal(await page.getByRole("switch", { name: "Bei neuen Kommentaren" }).getAttribute("aria-checked"), "false");
      const other = await browser.newContext();
      await other.addCookies([{ name: "qanda_session", value: (await cookie(a)).slice("qanda_session=".length), url: servers[0].origin }]);
      const otherPage = await other.newPage();
      await otherPage.goto(servers[0].origin + "/konto");
      assert.equal(await otherPage.getByRole("switch", { name: "Wenn ich am Zug bin" }).getAttribute("aria-checked"), "true");
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  });

});
