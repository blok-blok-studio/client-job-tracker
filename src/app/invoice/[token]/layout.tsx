import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { shareMeta } from "@/lib/share-meta";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const invoice = await prisma.studioInvoice
    .findUnique({ where: { token }, select: { number: true, status: true, language: true } })
    .catch(() => null);
  if (!invoice || invoice.status === "DRAFT") return shareMeta("Invoice", "Blok Blok Studio invoice.");
  const de = invoice.language === "de";
  return shareMeta(
    de ? `Rechnung ${invoice.number}` : `Invoice ${invoice.number}`,
    de ? "Ihre Rechnung von Blok Blok Studio: Zahlungsdetails, GiroCode und PDF." : "Your invoice from Blok Blok Studio: payment details, QR code and PDF."
  );
}

export default function InvoiceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
