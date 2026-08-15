import type { Metadata } from "next";
import prisma from "@/lib/prisma";
import { shareMeta } from "@/lib/share-meta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const client = await prisma.client
    .findUnique({
      where: { uploadToken: token },
      select: { name: true, company: true },
    })
    .catch(() => null);
  const who = client?.company || client?.name;
  return {
    ...shareMeta(
      who ? `File Drop for ${who}` : "File Drop",
      "Securely share files with Blok Blok Studio."
    ),
    // Installed home-screen icon reopens their file drop, not the team login
    manifest: `/api/portal-manifest?start=/u/${token}`,
  };
}

export default function UploadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
