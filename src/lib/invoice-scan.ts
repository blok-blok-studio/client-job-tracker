import Anthropic from "@anthropic-ai/sdk";
import prisma from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";

// AI verification of contractor invoice uploads: reads the actual file and
// extracts the billed amount so the tracker reflects what the document says,
// not just what was typed in. Opus for extraction accuracy — amounts feed
// bookkeeping and the legal record.
const SCAN_MODEL = "claude-opus-5";

const SCANNABLE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const EXTRACTION_SCHEMA = {
  type: "object" as const,
  properties: {
    is_invoice: {
      type: "boolean",
      description: "Whether the document is an invoice, bill, or payment request",
    },
    total_amount: {
      type: ["number", "null"],
      description: "The final total amount due on the invoice (after tax), or null if none found",
    },
    currency: {
      type: ["string", "null"],
      description: "3-letter ISO currency code of the total (USD, EUR, GBP, CHF...), or null if unclear",
    },
    invoice_number: { type: ["string", "null"], description: "Invoice number/ID as printed" },
    invoice_date: { type: ["string", "null"], description: "Invoice issue date as YYYY-MM-DD" },
    due_date: { type: ["string", "null"], description: "Payment due date as YYYY-MM-DD" },
    vendor_name: { type: ["string", "null"], description: "Name of the person/company issuing the invoice" },
    summary: { type: "string", description: "One sentence: who is billing for what" },
  },
  required: [
    "is_invoice",
    "total_amount",
    "currency",
    "invoice_number",
    "invoice_date",
    "due_date",
    "vendor_name",
    "summary",
  ],
  additionalProperties: false,
};

interface ExtractionResult {
  is_invoice: boolean;
  total_amount: number | null;
  currency: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  due_date: string | null;
  vendor_name: string | null;
  summary: string;
}

function scannableBlock(
  buffer: Buffer,
  contentType: string | null,
  filename: string
): Anthropic.ContentBlockParam | null {
  const type = (contentType || "").toLowerCase();
  const data = buffer.toString("base64");

  if (type === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data },
    };
  }
  const imageType = SCANNABLE_IMAGE_TYPES.find((t) => t === type);
  if (imageType) {
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: imageType as "image/jpeg" | "image/png" | "image/webp" | "image/gif",
        data,
      },
    };
  }
  if (type === "text/csv" || type.startsWith("text/")) {
    return { type: "text", text: `Document contents:\n\n${buffer.toString("utf8").slice(0, 50000)}` };
  }
  return null; // docx/xlsx etc — not scannable via the API
}

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Scan an uploaded invoice file and reconcile the extracted amount with what
 * the contractor entered. Called in the background after upload (via after())
 * and on demand from the rescan endpoint. Never throws — failures land as
 * scanStatus FAILED so the team sees it needs a manual look.
 */
export async function scanContractorInvoice(
  invoiceId: string,
  fileBuffer: Buffer,
  contentType: string | null,
  filename: string
): Promise<void> {
  try {
    const invoice = await prisma.contractorInvoice.findUnique({
      where: { id: invoiceId },
      include: { contractor: { select: { name: true } } },
    });
    if (!invoice) return;

    if (!process.env.ANTHROPIC_API_KEY) {
      await markScan(invoiceId, "FAILED", null, "ANTHROPIC_API_KEY not configured");
      return;
    }

    const block = scannableBlock(fileBuffer, contentType, filename);
    if (!block) {
      await prisma.contractorInvoice.update({
        where: { id: invoiceId },
        data: { scanStatus: "SKIPPED", scannedAt: new Date() },
      });
      await audit(invoiceId, "scanned", { result: "SKIPPED", reason: `unscannable type ${contentType}` });
      return;
    }

    const client = new Anthropic();
    const response = await client.messages.create({
      model: SCAN_MODEL,
      max_tokens: 2048,
      output_config: {
        format: { type: "json_schema", schema: EXTRACTION_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            block,
            {
              type: "text",
              text: "Extract the invoice details from this document. Report the final total amount due exactly as printed — never estimate or compute a number that is not on the document.",
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      await markScan(invoiceId, "FAILED", null, "Model declined to process the document");
      return;
    }

    const textBlock = response.content.find(
      (b): b is Anthropic.TextBlock => b.type === "text"
    );
    if (!textBlock) {
      await markScan(invoiceId, "FAILED", null, "No output from scan");
      return;
    }
    const extracted = JSON.parse(textBlock.text) as ExtractionResult;

    // Reconcile with what the contractor entered
    const enteredAmount = invoice.amount ? parseFloat(invoice.amount.toString()) : null;
    const scannedAmount = extracted.total_amount;
    const scannedCurrency = extracted.currency?.toUpperCase() || null;

    let scanStatus: "MATCHED" | "AUTO_FILLED" | "MISMATCH" | "NO_DATA";
    if (scannedAmount === null) {
      scanStatus = "NO_DATA";
    } else if (enteredAmount === null) {
      scanStatus = "AUTO_FILLED";
    } else if (
      Math.abs(enteredAmount - scannedAmount) < 0.01 &&
      (!scannedCurrency || scannedCurrency === invoice.currency)
    ) {
      scanStatus = "MATCHED";
    } else {
      scanStatus = "MISMATCH";
    }

    await prisma.contractorInvoice.update({
      where: { id: invoiceId },
      data: {
        scanStatus,
        scannedAmount: scannedAmount,
        scannedCurrency,
        scannedInvoiceNumber: extracted.invoice_number,
        scannedInvoiceDate: parseDate(extracted.invoice_date),
        scannedDueDate: parseDate(extracted.due_date),
        scanSummary: extracted.summary || null,
        scannedAt: new Date(),
        // Fill in what the contractor left blank — from the document itself
        ...(scanStatus === "AUTO_FILLED" && {
          amount: scannedAmount,
          ...(scannedCurrency && { currency: scannedCurrency }),
        }),
        ...(!invoice.invoiceNumber && extracted.invoice_number && { invoiceNumber: extracted.invoice_number }),
        ...(!invoice.invoiceDate && parseDate(extracted.invoice_date) && { invoiceDate: parseDate(extracted.invoice_date) }),
        ...(!invoice.dueDate && parseDate(extracted.due_date) && { dueDate: parseDate(extracted.due_date) }),
      },
    });

    await audit(invoiceId, "scanned", {
      result: scanStatus,
      scannedAmount,
      scannedCurrency,
      enteredAmount,
      enteredCurrency: invoice.currency,
      invoiceNumber: extracted.invoice_number,
      vendor: extracted.vendor_name,
      isInvoice: extracted.is_invoice,
    });

    if (scanStatus === "MISMATCH") {
      notifySlack(
        `:warning: Contractor invoice amount mismatch — *${invoice.contractor.name}* entered ${invoice.currency} ${enteredAmount?.toFixed(2)}, but the document says ${scannedCurrency || invoice.currency} ${scannedAmount?.toFixed(2)}${extracted.invoice_number ? ` (#${extracted.invoice_number})` : ""}. Check it in Contractors.`
      ).catch(() => {});
    }
    if (!extracted.is_invoice) {
      notifySlack(
        `:grey_question: File uploaded by *${invoice.contractor.name}* doesn't look like an invoice (${filename}) — worth a look.`
      ).catch(() => {});
    }
  } catch (error) {
    console.error("Invoice scan failed:", error);
    await markScan(invoiceId, "FAILED", null, error instanceof Error ? error.message.slice(0, 300) : "Unknown error").catch(() => {});
  }
}

async function markScan(
  invoiceId: string,
  status: "FAILED",
  summary: string | null,
  reason: string
): Promise<void> {
  await prisma.contractorInvoice.update({
    where: { id: invoiceId },
    data: { scanStatus: status, scanSummary: summary, scannedAt: new Date() },
  });
  await audit(invoiceId, "scan_failed", { reason });
}

async function audit(invoiceId: string, event: string, metadata: Record<string, unknown>): Promise<void> {
  await prisma.contractorInvoiceAudit.create({
    data: { invoiceId, event, actor: "system", metadata: JSON.stringify(metadata) },
  });
}
