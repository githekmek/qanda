import { NextResponse } from "next/server";
export function rejectForeignOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" || (origin && origin !== new URL(request.url).origin)) {
    return NextResponse.json({ error: "Unzulässige Herkunft" }, { status: 403 });
  }
  return null;
}
