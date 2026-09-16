import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin";
import { formatAccessCode, generateAccessCode } from "@/lib/codes";

const createSchema = z.object({
  note: z.string().trim().max(60).optional(),
});

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const codes = await prisma.accessCode.findMany({
    include: { redeemedBy: { select: { username: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    codes: codes.map((code) => ({
      id: code.id,
      code: formatAccessCode(code.code),
      rawCode: code.code,
      note: code.note,
      createdAt: code.createdAt.toISOString(),
      revoked: code.revokedAt !== null,
      redeemedBy: code.redeemedBy?.username ?? null,
      redeemedAt: code.redeemedAt?.toISOString() ?? null,
    })),
  });
}

export async function POST(request: Request) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Notiz" }, { status: 400 });
  }

  const code = await prisma.accessCode.create({
    data: {
      code: generateAccessCode(),
      note: parsed.data.note || null,
      createdById: admin.id,
    },
  });

  return NextResponse.json({ id: code.id, code: formatAccessCode(code.code) });
}
