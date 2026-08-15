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
      where: { onboardToken: token },
      select: { name: true, company: true },
    })
    .catch(() => null);
  const who = client?.company || client?.name;
  return {
    ...shareMeta(
      who ? `Welcome, ${who}!` : "Welcome!",
      "Let's get your project started — complete your onboarding with Blok Blok Studio."
    ),
    // Installed home-screen icon reopens their onboarding, not the team login
    manifest: `/api/portal-manifest?start=/o/${token}`,
  };
}

export default function OnboardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
