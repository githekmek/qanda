import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recoveryConfig, sendAppMail } from "@/lib/recoveryMail";

export async function enqueueNotification(tx: Prisma.TransactionClient, userId: string | null, roomId: string, kind: "turn" | "comment", event: string) {
  if (!userId) return;
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user?.emailVerifiedAt || !user.email || !(kind === "turn" ? user.notifyTurn : user.notifyComments)) return;
  await tx.notification.upsert({
    where: { eventKey: kind + ":" + event + ":" + userId }, update: {},
    create: { eventKey: kind + ":" + event + ":" + userId, userId, roomId, kind,
      dueAt: new Date(Date.now() + (kind === "comment" ? 5 * 60000 : 0)) },
  });
}

// Atomic shared quota across instances. Recovery has a separate budget.
async function quota(key: string, max: number, seconds: number) {
  const rows = await prisma.$queryRaw<{ attempts: number }[]> `
    INSERT INTO "LoginRateLimit" ("key", "attempts", "expiresAt")
    VALUES (${key}, 1, NOW() + ${seconds} * INTERVAL '1 second')
    ON CONFLICT ("key") DO UPDATE SET
      "attempts" = CASE WHEN "LoginRateLimit"."expiresAt" <= NOW() THEN 1 ELSE "LoginRateLimit"."attempts" + 1 END,
      "expiresAt" = CASE WHEN "LoginRateLimit"."expiresAt" <= NOW() THEN NOW() + ${seconds} * INTERVAL '1 second' ELSE "LoginRateLimit"."expiresAt" END
    RETURNING "attempts"`;
  return rows[0].attempts <= max;
}

export async function dispatchNotifications() {
  const config = recoveryConfig();
  if (!config) return { sent: 0, configured: false };
  let sent = 0;
  // Bounded work: at most two SMTP operations per invocation.
  for (let batch = 0; batch < 2; batch++) {
    const now = new Date();
    const first = await prisma.notification.findFirst({
      where: { dueAt: { lte: now }, lockedUntil: { lte: now } }, orderBy: { dueAt: "asc" },
    });
    if (!first) break;
    const claim = randomUUID();
    // Claim a whole recipient/room/type group, including comments still in the
    // five-minute window, so an active conversation produces a single digest.
    await prisma.notification.updateMany({
      where: { userId: first.userId, roomId: first.roomId, kind: first.kind, lockedUntil: { lte: now } },
      data: { claim, lockedUntil: new Date(Date.now() + 5 * 60000), attempts: { increment: 1 } },
    });
    const jobs = await prisma.notification.findMany({ where: { claim }, orderBy: { id: "asc" } });
    if (!jobs.length) continue;
    const [user, room] = await Promise.all([
      prisma.user.findUnique({ where: { id: first.userId } }),
      prisma.room.findUnique({ where: { id: first.roomId }, include: {
        questions: { where: { status: "PENDING" }, select: { askerId: true }, take: 1 },
      } }),
    ]);
    const isMember = room && [room.playerAId, room.playerBId].includes(first.userId);
    const stillTheirTurn = room?.playerBId && (room.questions.length ?
      room.questions[0].askerId !== first.userId : room.currentAskerId === first.userId);
    if (!user?.emailVerifiedAt || !user.email || !isMember || room.archivedAt ||
        !(first.kind === "turn" ? user.notifyTurn && stillTheirTurn : user.notifyComments) ||
        jobs.every((job) => job.createdAt.getTime() < Date.now() - 24 * 60 * 60000)) {
      await prisma.notification.deleteMany({ where: { claim } });
      continue;
    }
    if (!await quota("notifications:user:" + user.id, 10, 3600) ||
        !await quota("notifications:global", 100, 86400)) {
      await prisma.notification.updateMany({ where: { claim },
        data: { claim: null, lockedUntil: new Date(0), dueAt: new Date(Date.now() + 3600000) } });
      break;
    }
    try {
      // Recheck cancellation just before SMTP. Settings changes delete pending jobs.
      if (!await prisma.notification.count({ where: { claim } })) continue;
      const subject = first.kind === "turn" ? "Q&A: Du bist am Zug" : "Q&A: Neue Kommentare";
      const text = (first.kind === "turn" ? "Du kannst in einem deiner Räume weiterspielen." :
        "In einem deiner Räume gibt es neue Kommentare.") +
        "\n\n" + config.origin + "/room/" + encodeURIComponent(first.roomId) +
        "\n\nDu erhältst diese Nachricht aufgrund deiner Einstellungen. Benachrichtigungen ändern: " +
        config.origin + "/konto";
      const messageId = "<" + createHash("sha256").update(jobs.map(j => j.id).join(",")).digest("hex") + "@qanda.invalid>";
      await sendAppMail(user.email, subject, text, messageId);
      await prisma.notification.deleteMany({ where: { claim } });
      sent++;
    } catch {
      await prisma.notification.updateMany({ where: { claim }, data: {
        claim: null, lockedUntil: new Date(0),
        dueAt: new Date(Date.now() + Math.min(60, 5 * 2 ** Math.min(first.attempts, 4)) * 60000),
      } });
      console.error("Notification delivery failed; retry queued.");
    }
  }
  return { sent, configured: true };
}
