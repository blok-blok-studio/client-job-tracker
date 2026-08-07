import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { shareMeta } from "@/lib/share-meta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const contractor = await prisma.contractor
    .findUnique({
      where: { uploadToken: token },
      select: { name: true, company: true },
    })
    .catch(() => null);
  const who = contractor?.company || contractor?.name;
  return shareMeta(
    who ? `Invoice Upload for ${who}` : "Invoice Upload",
    "Securely submit your invoices to Blok Blok Studio."
  );
}

export default function ContractorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
