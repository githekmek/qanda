import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { getRequestOrigin } from "@/lib/origin";
import RoomClient from "@/components/RoomClient";

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const { id } = await params;
  return <RoomClient roomId={id} origin={await getRequestOrigin()} />;
}
