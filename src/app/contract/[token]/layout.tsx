import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { shareMeta } from "@/lib/share-meta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const contract = await prisma.contractSignature
    .findUnique({
      where: { token },
      select: { client: { select: { name: true, company: true } } },
    })
    .catch(() => null);
  const who = contract?.client.company || contract?.client.name;
  return shareMeta(
    who ? `Contract for ${who}` : "Your Contract",
    "Review and sign your service agreement with Blok Blok Studio — secure online signing."
  );
}

export default function ContractLayout({ children }: { children: React.ReactNode }) {
  return children;
}
