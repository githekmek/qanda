import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const WINDOW_SECONDS = 15 * 60;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export async function limitLogin(request: Request, username: string) {
  const buckets = [{ key: hash("account:" + username), limit: 10 }];
  // Vercel overwrites this header. Never trust arbitrary X-Forwarded-For.
  const ip = process.env.VERCEL === "1"
    ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : null;
  if (ip) buckets.unshift({ key: hash("ip:" + ip), limit: 100 });

  await prisma.$executeRaw`DELETE FROM "LoginRateLimit" WHERE "expiresAt" < CURRENT_TIMESTAMP`;
  for (const bucket of buckets) {
    const rows = await prisma.$queryRaw<{ attempts: number; retryAfter: number }[]>`
      INSERT INTO "LoginRateLimit" ("key", "attempts", "expiresAt")
      VALUES (${bucket.key}, 1, CURRENT_TIMESTAMP + ${WINDOW_SECONDS} * INTERVAL '1 second')
      ON CONFLICT ("key") DO UPDATE SET
        "attempts" = CASE WHEN "LoginRateLimit"."expiresAt" <= CURRENT_TIMESTAMP
          THEN 1 ELSE LEAST("LoginRateLimit"."attempts" + 1, ${bucket.limit + 1}) END,
        "expiresAt" = CASE WHEN "LoginRateLimit"."expiresAt" <= CURRENT_TIMESTAMP
          THEN CURRENT_TIMESTAMP + ${WINDOW_SECONDS} * INTERVAL '1 second'
          ELSE "LoginRateLimit"."expiresAt" END
      RETURNING "attempts",
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM ("expiresAt" - CURRENT_TIMESTAMP))))::int AS "retryAfter"
    `;
    if (rows[0].attempts > bucket.limit) {
      return NextResponse.json(
        { error: "Zu viele Anmeldeversuche. Bitte versuche es später erneut." },
        { status: 429, headers: { "Retry-After": String(rows[0].retryAfter) } }
      );
    }
  }
  return null;
}
