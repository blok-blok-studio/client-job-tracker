import { NextRequest, NextResponse } from "next/server";
import { requireOwner, handleError } from "@/app/api/studio-invoices/_shared";
import { attachInvoicePdf } from "@/lib/invoicing/stripe-documents";

// POST multipart (file) — one Stripe invoice PDF, matched by its number. Owner only.
export async function POST(request: NextRequest) {
  const { denied } = await requireOwner();
  if (denied) return denied;
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ success: false, error: "No file" }, { status: 400 });
    return NextResponse.json({ success: true, data: await attachInvoicePdf(file.name, new Uint8Array(await file.arrayBuffer())) });
  } catch (err) {
    return handleError(err, "Upload failed");
  }
}
