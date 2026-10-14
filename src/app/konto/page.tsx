import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import RecoveryForm from "@/components/RecoveryForm";

export default async function AccountPage() {
  if (!await getSession()) redirect("/login");
  return <RecoveryForm mode="account" />;
}
