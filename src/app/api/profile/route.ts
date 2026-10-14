import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recoveryConfig } from "@/lib/recoveryMail";
import { serializable, mutationError, RequestError } from "@/lib/transaction";

const select = { username: true, email: true, emailVerifiedAt: true, theme: true, notifyTurn: true, notifyComments: true } as const;
const schema = z.object({
  theme: z.enum(["standard", "colorful", "dark"]).optional(),
  notifyTurn: z.boolean().optional(), notifyComments: z.boolean().optional(),
}).strict().refine(data => Object.keys(data).length > 0);

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: session.userId }, select });
  return NextResponse.json({ ...user, available: Boolean(recoveryConfig()) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Nicht angemeldet" }, { status: 401 });
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const source = new URL(origin);
      if (source.host !== request.headers.get("host") || source.protocol !== new URL(request.url).protocol) throw new Error();
    } catch { return NextResponse.json({ error: "Ungültige Anfrage" }, { status: 403 }); }
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültige Einstellungen" }, { status: 400 });
  try {
    const user = await serializable(async tx => {
      const current = await tx.user.findUnique({ where: { id: session.userId } });
      if (!current || current.sessionVersion !== session.sessionVersion) throw new RequestError(401, "Bitte erneut anmelden.");
      if ((parsed.data.notifyTurn || parsed.data.notifyComments) && (!current.emailVerifiedAt || !current.email || !recoveryConfig())) {
        throw new RequestError(400, "Bitte zuerst eine E-Mail-Adresse bestätigen. Der Versand muss eingerichtet sein.");
      }
      const updated = await tx.user.update({ where: { id: session.userId }, data: parsed.data, select });
      const kinds = [];
      if (parsed.data.notifyTurn === false) kinds.push("turn");
      if (parsed.data.notifyComments === false) kinds.push("comment");
      if (kinds.length) await tx.notification.deleteMany({ where: { userId: session.userId, kind: { in: kinds } } });
      return updated;
    });
    return NextResponse.json({ ...user, available: Boolean(recoveryConfig()) });
  } catch (error) { return mutationError(error); }
}
