import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import DraftsPage from "@/components/DraftsPage";
export default async function Page() {
  if (!await getSession()) redirect("/login");
  return <DraftsPage />;
}
