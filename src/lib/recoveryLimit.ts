import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

// Separate keys from login limits. Atomic upserts work across server instances.
export async function allowRecovery(request: Request, target: string, sending: boolean) {
  const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : null;
  const buckets = [
    { name: "recovery-target:" + target, limit: sending ? 3 : 20, seconds: 900 },
    ...(ip ? [{ name: "recovery-ip:" + ip, limit: 30, seconds: 900 }] : []),
    ...(sending ? [{ name: "recovery-send-budget", limit: 100, seconds: 86400 }] : [{ name: "recovery-consume-budget", limit: 500, seconds: 900 }]),
  ];
  for (const bucket of buckets) {
    const key = createHash("sha256").update(bucket.name).digest("hex");
    const rows = await prisma.$queryRaw<{ attempts: number }[]>`
      INSERT INTO "LoginRateLimit" ("key", "attempts", "expiresAt")
      VALUES (${key}, 1, CURRENT_TIMESTAMP + ${bucket.seconds} * INTERVAL '1 second')
      ON CONFLICT ("key") DO UPDATE SET
        "attempts" = CASE WHEN "LoginRateLimit"."expiresAt" <= CURRENT_TIMESTAMP
          THEN 1 ELSE LEAST("LoginRateLimit"."attempts" + 1, ${bucket.limit + 1}) END,
        "expiresAt" = CASE WHEN "LoginRateLimit"."expiresAt" <= CURRENT_TIMESTAMP
          THEN CURRENT_TIMESTAMP + ${bucket.seconds} * INTERVAL '1 second' ELSE "LoginRateLimit"."expiresAt" END
      RETURNING "attempts"
    `;
    if (rows[0].attempts > bucket.limit) return false;
  }
  return true;
}
