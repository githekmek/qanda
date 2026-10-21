import "server-only";
import webpush from "web-push";
import { prisma } from "@/lib/db";

export type PushKind = "turn" | "comment";

export function pushConfig() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject || !/^(mailto:|https:\/\/)/.test(subject)) return null;
  return { publicKey, privateKey, subject };
}

export function publicPushConfig() {
  const config = pushConfig();
  return config ? { available: true, publicKey: config.publicKey } : { available: false, publicKey: null };
}

export async function sendPushToUser(
  userId: string,
  kind: PushKind,
  payload: { title: string; body: string; url: string; tag: string },
) {
  const config = pushConfig();
  if (!config) return { configured: false, targets: 0, sent: 0 };

  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      userId,
      ...(kind === "turn" ? { notifyTurn: true } : { notifyComments: true }),
    },
  });
  if (!subscriptions.length) return { configured: true, targets: 0, sent: 0 };

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  let sent = 0;
  let temporaryFailures = 0;
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(payload),
        { TTL: kind === "turn" ? 3600 : 6 * 3600, urgency: kind === "turn" ? "high" : "normal" },
      );
      sent++;
    } catch (error) {
      const status = typeof error === "object" && error && "statusCode" in error
        ? Number((error as { statusCode?: unknown }).statusCode) : 0;
      if (status === 404 || status === 410) {
        await prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => {});
      } else {
        temporaryFailures++;
      }
    }
  }
  if (!sent && temporaryFailures) throw new Error("Push delivery failed temporarily.");
  return { configured: true, targets: subscriptions.length, sent };
}
