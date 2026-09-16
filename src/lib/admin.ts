import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** Returns the session user only if they are the admin. */
export async function getAdminSession() {
  const session = await getSession();
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, username: true, isAdmin: true },
  });

  return user?.isAdmin ? user : null;
}
