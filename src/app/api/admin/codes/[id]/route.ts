import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getAdminSession } from "@/lib/admin";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "Kein Zugriff" }, { status: 403 });
  const { id } = await params;
  const result = await prisma.accessCode.updateMany({
    where: { id, redeemedById: null },
    data: { revokedAt: new Date() },
  });
  if (!result.count) {
    const code = await prisma.accessCode.findUnique({ where: { id }, select: { id: true } });
    return NextResponse.json(
      { error: code ? "Eingelöste Codes können nicht zurückgezogen werden" : "Code nicht gefunden" },
      { status: code ? 409 : 404 }
    );
  }
  return NextResponse.json({ ok: true });
}
