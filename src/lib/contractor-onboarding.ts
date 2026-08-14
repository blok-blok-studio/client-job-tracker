import prisma from "@/lib/prisma";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

/** Short-link form of a contractor's private portal (middleware rewrites /i/ → /contractor/). */
export function contractorPortalUrl(uploadToken: string): string {
  return `${APP_URL}/i/${uploadToken}`;
}

// Human labels for the paperwork that blocks invoicing — same set the portal
// gates on, so the welcome email and the portal never disagree.
const DOC_LABELS: Record<string, string> = {
  CONTRACTOR_AGREEMENT: "A signed contractor agreement",
  W9: "Form W-9 (sent straight to our accountant — we never store your SSN)",
  W8BEN: "Form W-8BEN / W-8BEN-E (sent straight to our accountant)",
};

const BLOCKING_DOC_TYPES = Object.keys(DOC_LABELS);

/** What this contractor still owes us, phrased for an email to them. */
export async function requiredDocLabels(contractorId: string): Promise<string[]> {
  const open = await prisma.taxDocument.findMany({
    where: {
      contractorId,
      direction: "INBOUND",
      status: "REQUESTED",
      type: { in: BLOCKING_DOC_TYPES },
    },
    select: { type: true },
  });
  return open.map((d) => DOC_LABELS[d.type] || d.type);
}
