import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { shareMeta } from "@/lib/share-meta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const rep = await prisma.partnerRep
    .findUnique({ where: { token }, select: { partner: { select: { name: true } } } })
    .catch(() => null);
  return {
    ...shareMeta(
      rep ? `${rep.partner.name} × Blok Blok Studio` : "Partner portal",
      "Register practices, track deals and close on Blok Blok Studio's standard agreement."
    ),
    manifest: `/api/portal-manifest?start=/partner/${token}`,
  };
}

export default function PartnerPortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
