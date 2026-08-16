import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

// Finances are owner-only. Server-side gate: members never receive this page's
// markup, unlike the client-side PageGuard which redirects after mount.
export default async function MoneyLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session?.role !== "OWNER") redirect("/");
  return <>{children}</>;
}
