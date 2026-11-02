import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { shareMeta } from "@/lib/share-meta";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const q = await prisma.quote.findUnique({ where: { token }, select: { number: true, status: true, language: true } }).catch(() => null);
  if (!q || q.status === "DRAFT") return shareMeta("Quote", "Blok Blok Studio quote.");
  const de = q.language === "de";
  return shareMeta(de ? `Angebot ${q.number}` : `Quote ${q.number}`, de ? "Ihr Angebot von Blok Blok Studio: online ansehen und annehmen." : "Your quote from Blok Blok Studio: review and accept online.");
}

export default function QuoteLayout({ children }: { children: React.ReactNode }) {
  return children;
}
