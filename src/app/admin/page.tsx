import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/admin";
import { getRequestOrigin } from "@/lib/origin";
import AdminClient from "@/components/AdminClient";

export default async function AdminPage() {
  const admin = await getAdminSession();
  if (!admin) {
    redirect("/");
  }

  return <AdminClient origin={await getRequestOrigin()} />;
}
