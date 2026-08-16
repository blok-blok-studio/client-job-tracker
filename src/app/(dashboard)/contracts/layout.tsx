import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

// Owner-only: contract bodies carry client pricing, and the archive exposes
// the public signing tokens. Server-side gate so members never load the page.
export default async function ContractsLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session?.role !== "OWNER") redirect("/");
  return <>{children}</>;
}
