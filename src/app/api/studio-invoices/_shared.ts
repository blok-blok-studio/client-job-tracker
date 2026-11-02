import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { InvoiceError } from "@/lib/invoicing/service";
import { ZodError } from "zod";

/** Studio invoices are finance: owner only, like /contracts and the Stripe invoice API. */
export async function requireOwner() {
  const session = await getSession();
  if (!session || session.role !== "OWNER") return { session: null, denied: NextResponse.json({ success: false, error: "Owner only" }, { status: 403 }) };
  return { session, denied: null };
}

export function handleError(err: unknown, fallback: string) {
  if (err instanceof InvoiceError) return NextResponse.json({ success: false, error: err.message }, { status: err.status });
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const where = first?.path?.length ? `${first.path.join(".")}: ` : "";
    return NextResponse.json({ success: false, error: `${where}${first?.message || "Invalid input"}` }, { status: 400 });
  }
  console.error(`[studio-invoices] ${fallback}:`, err);
  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}
