import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { shareMeta } from "@/lib/share-meta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const approval = await prisma.contentApproval
    .findUnique({
      where: { token },
      select: { title: true, client: { select: { name: true, company: true } } },
    })
    .catch(() => null);
  const who = approval?.client.company || approval?.client.name;
  return shareMeta(
    approval?.title || (who ? `Posts for ${who}` : "Your Upcoming Posts"),
    "Your upcoming social posts are ready. Review them and approve or ask for changes."
  );
}

export default function PostReviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
