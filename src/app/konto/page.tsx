import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recoveryConfig } from "@/lib/recoveryMail";
import ProfileSettings from "@/components/ProfileSettings";

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId },
    select: { username: true, email: true, emailVerifiedAt: true, theme: true, notifyTurn: true, notifyComments: true } });
  return <ProfileSettings initial={{ ...user, emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null, available: Boolean(recoveryConfig()) }} />;
}
