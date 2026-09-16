import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin";

/** Withdraws an unredeemed code so the link stops working. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  }

  const { id } = await params;
  const code = await prisma.accessCode.findUnique({ where: { id } });
  if (!code) {
    return NextResponse.json({ error: "Code nicht gefunden" }, { status: 404 });
  }
  if (code.redeemedById) {
    return NextResponse.json(
      { error: "Eingelöste Codes können nicht zurückgezogen werden" },
      { status: 409 }
    );
  }

  await prisma.accessCode.update({ where: { id }, data: { revokedAt: new Date() } });

  return NextResponse.json({ ok: true });
}
