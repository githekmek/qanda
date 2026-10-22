import { NextResponse } from "next/server";
export function rejectForeignOrigin(request: Request) {
  const origin = request.headers.get("origin");
  try {
    if (request.headers.get("sec-fetch-site") === "cross-site") throw new Error();
    if (origin) {
      const source = new URL(origin);
      // Next may normalize request.url to an internal hostname; Host is the browser-facing authority.
      if (source.host !== request.headers.get("host") || source.protocol !== new URL(request.url).protocol) throw new Error();
    }
  } catch {
    return NextResponse.json({ error: "Unzulässige Herkunft" }, { status: 403 });
  }
  return null;
}
