import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

// Owner-only: invoices are finance (amounts, bank details, public pay tokens).
// Server-side gate so members never load the page, same as /contracts.
export default async function InvoicesLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session?.role !== "OWNER") redirect("/");
  return <>{children}</>;
}
