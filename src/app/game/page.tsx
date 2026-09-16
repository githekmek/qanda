import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import GameClient from "./GameClient";

export default async function GamePage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return <GameClient username={session.username} />;
}
