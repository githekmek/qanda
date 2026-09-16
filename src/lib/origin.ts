import { headers } from "next/headers";

/** Absolute origin of the current request, used to build shareable links. */
export async function getRequestOrigin() {
  const headerList = await headers();
  const host = headerList.get("host") ?? "localhost:3000";
  const protocol = headerList.get("x-forwarded-proto") ?? "http";
  return `${protocol}://${host}`;
}
