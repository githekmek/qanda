import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recoveryConfig, sendAppMail } from "@/lib/recoveryMail";
import { pushConfig, sendPushToUser } from "@/lib/push";

type Kind = "turn" | "comment";
type Channel = "email" | "push";

export async function enqueueNotification(
  tx: Prisma.TransactionClient,
  userId: string | null,
  roomId: string,
  kind: Kind,
  event: string,
) {
  if (!userId) return;
  const user = await tx.user.findUnique({
    where: { id: userId },
    include: {
      pushSubscriptions: {
        where: kind === "turn" ? { notifyTurn: true } : { notifyComments: true },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!user) return;

  const channels: Channel[] = [];
  const emailEnabled = Boolean(
    user.emailVerifiedAt && user.email &&
    (kind === "turn" ? user.notifyTurn : user.notifyComments) &&
    recoveryConfig(),
  );
  if (emailEnabled) channels.push("email");
  if (user.pushSubscriptions.length && pushConfig()) channels.push("push");

  for (const channel of channels) {
    await tx.notification.upsert({
      where: { eventKey: channel + ":" + kind + ":" + event + ":" + userId },
      update: {},
      create: {
        eventKey: channel + ":" + kind + ":" + event + ":" + userId,
        userId,
        roomId,
        kind,
        channel,
        dueAt: new Date(Date.now() + (kind === "comment" ? 5 * 60000 : 0)),
      },
    });
  }
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
  const emailConfig = recoveryConfig();
  const pushAvailable = Boolean(pushConfig());
  if (!emailConfig && !pushAvailable) return { sent: 0, configured: false };

  let sent = 0;
  // Bounded work: at most two deliveries per invocation.
  for (let batch = 0; batch < 2; batch++) {
    const now = new Date();
    const first = await prisma.notification.findFirst({
      where: { dueAt: { lte: now }, lockedUntil: { lte: now } },
      orderBy: { dueAt: "asc" },
    });
    if (!first) break;
    const channel = first.channel === "push" ? "push" : "email";
    const claim = randomUUID();
    // Claim a whole recipient/room/type/channel group. Comments still in the
    // five-minute window join the same digest.
    await prisma.notification.updateMany({
      where: {
        userId: first.userId,
        roomId: first.roomId,
        kind: first.kind,
        channel,
        lockedUntil: { lte: now },
      },
      data: {
        claim,
        lockedUntil: new Date(Date.now() + 5 * 60000),
        attempts: { increment: 1 },
      },
    });
    const jobs = await prisma.notification.findMany({ where: { claim }, orderBy: { id: "asc" } });
    if (!jobs.length) continue;

    const [user, room, pushTargets] = await Promise.all([
      prisma.user.findUnique({ where: { id: first.userId } }),
      prisma.room.findUnique({
        where: { id: first.roomId },
        include: { questions: { where: { status: "PENDING" }, select: { askerId: true }, take: 1 } },
      }),
      channel === "push" ? prisma.pushSubscription.count({
        where: {
          userId: first.userId,
          ...(first.kind === "turn" ? { notifyTurn: true } : { notifyComments: true }),
        },
      }) : Promise.resolve(0),
    ]);
    if ((channel === "email" && !emailConfig) || (channel === "push" && !pushAvailable)) {
      await prisma.notification.updateMany({
        where: { claim },
        data: { claim: null, lockedUntil: new Date(0), dueAt: new Date(Date.now() + 3600000) },
      });
      continue;
    }

    const isMember = room && [room.playerAId, room.playerBId].includes(first.userId);
    const stillTheirTurn = room?.playerBId && (
      room.questions.length
        ? room.questions[0].askerId !== first.userId
        : room.currentAskerId === first.userId
    );
    const preferenceEnabled = channel === "email"
      ? Boolean(
          emailConfig && user?.emailVerifiedAt && user.email &&
          (first.kind === "turn" ? user.notifyTurn : user.notifyComments)
        )
      : pushAvailable && pushTargets > 0;
    if (
      !user || !isMember || room.archivedAt || !preferenceEnabled ||
      (first.kind === "turn" && !stillTheirTurn) ||
      jobs.every((job) => job.createdAt.getTime() < Date.now() - 24 * 60 * 60000)
    ) {
      await prisma.notification.deleteMany({ where: { claim } });
      continue;
    }

    if (
      !await quota("notifications:" + channel + ":user:" + user.id, channel === "push" ? 30 : 10, 3600) ||
      !await quota("notifications:" + channel + ":global", channel === "push" ? 1000 : 100, 86400)
    ) {
      await prisma.notification.updateMany({
        where: { claim },
        data: { claim: null, lockedUntil: new Date(0), dueAt: new Date(Date.now() + 3600000) },
      });
      break;
    }

    try {
      if (!await prisma.notification.count({ where: { claim } })) continue;
      const subject = first.kind === "turn" ? "Q&A: Du bist am Zug" : "Q&A: Neue Kommentare";
      const body = first.kind === "turn"
        ? "Du kannst in einem deiner Räume weiterspielen."
        : "In einem deiner Räume gibt es neue Kommentare.";
      const path = "/room/" + encodeURIComponent(first.roomId);

      if (channel === "email") {
        const text = body + "\n\n" + emailConfig!.origin + path +
          "\n\nDu erhältst diese Nachricht aufgrund deiner Einstellungen. Benachrichtigungen ändern: " +
          emailConfig!.origin + "/konto";
        const messageId = "<" + createHash("sha256")
          .update(jobs.map((job) => job.id).join(","))
          .digest("hex") + "@qanda.invalid>";
        await sendAppMail(user.email!, subject, text, messageId);
      } else {
        await sendPushToUser(user.id, first.kind as Kind, {
          title: subject,
          body,
          url: path,
          tag: "qanda-" + first.kind + "-" + first.roomId,
        });
      }

      await prisma.notification.deleteMany({ where: { claim } });
      sent++;
    } catch {
      await prisma.notification.updateMany({
        where: { claim },
        data: {
          claim: null,
          lockedUntil: new Date(0),
          dueAt: new Date(Date.now() + Math.min(60, 5 * 2 ** Math.min(first.attempts, 4)) * 60000),
        },
      });
      console.error("Notification delivery failed; retry queued.");
    }
  }
  return { sent, configured: true };
}
