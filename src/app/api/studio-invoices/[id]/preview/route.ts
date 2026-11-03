import { NextRequest, NextResponse } from "next/server";
import { requireOwner, handleError } from "../../_shared";
import { previewIssue } from "@/lib/invoicing/service";
import { buildInvoiceView } from "@/lib/invoicing/view";
import { renderInvoicePdf } from "@/lib/invoicing/invoice-pdf";
import { buildStudioInvoiceEmail } from "@/lib/invoicing/email";

export const dynamic = "force-dynamic";

/**
 * Preview of a draft exactly as it would be issued: GET returns the email
 * (recipient, subject, HTML) and the predicted number; ?format=pdf returns
 * the final PDF. Nothing is saved, numbered or sent.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { denied } = await requireOwner();
  if (denied) return denied;
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const p = await previewIssue(id);
    const view = buildInvoiceView(p.row, p.settings, { corrects: p.corrects });
    if (url.searchParams.get("format") === "pdf") {
      const bytes = await renderInvoicePdf(view);
      return new NextResponse(Buffer.from(bytes), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${p.number}-preview.pdf"`,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
    const email = buildStudioInvoiceEmail(view);
    return NextResponse.json(
      { success: true, data: { number: p.number, to: p.to, autoSend: p.autoSend, blockers: p.blockers, subject: email.subject, html: email.html } },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return handleError(err, "Failed to build the preview");
  }
}
