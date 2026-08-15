import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { shareMeta } from "@/lib/share-meta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const contract = await prisma.contractorContract
    .findUnique({
      where: { token },
      select: {
        title: true,
        contractor: { select: { name: true, company: true, uploadToken: true } },
      },
    })
    .catch(() => null);
  const who = contract?.contractor.company || contract?.contractor.name;
  return {
    ...shareMeta(
      contract?.title ? `${contract.title}${who ? ` — ${who}` : ""}` : "Your Agreement",
      "Review and sign your agreement with Blok Blok Studio — secure online signing."
    ),
    // If they install from here, the icon should open their durable portal —
    // the signing link is one-shot, the portal is where they live
    ...(contract?.contractor.uploadToken
      ? { manifest: `/api/portal-manifest?start=/i/${contract.contractor.uploadToken}` }
      : {}),
  };
}

export default function AgreementLayout({ children }: { children: React.ReactNode }) {
  return children;
}
