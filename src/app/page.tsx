import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import Dashboard from "@/components/Dashboard";

export default async function Home() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { isAdmin: true },
  });

  return <Dashboard username={session.username} isAdmin={user?.isAdmin ?? false} />;
}
