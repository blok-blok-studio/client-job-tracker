import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

// Owner-only: partner pages carry commission rates, payouts and rep links.
export default async function PartnersLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session?.role !== "OWNER") redirect("/");
  return <>{children}</>;
}
