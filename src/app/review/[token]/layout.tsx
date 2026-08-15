import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { shareMeta } from "@/lib/share-meta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const deliverable = await prisma.deliverable
    .findUnique({
      where: { token },
      select: { title: true, client: { select: { name: true, company: true } } },
    })
    .catch(() => null);
  const who = deliverable?.client.company || deliverable?.client.name;
  return {
    ...shareMeta(
      deliverable ? `${deliverable.title}${who ? ` — for ${who}` : ""}` : "Your Deliverables",
      "Your finished work is ready — review and approve it online with Blok Blok Studio."
    ),
    // Installed home-screen icon reopens this review link, not the team login
    manifest: `/api/portal-manifest?start=/r/${token}`,
  };
}

export default function ReviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
