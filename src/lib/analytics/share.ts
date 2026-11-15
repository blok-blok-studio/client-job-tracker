import { randomBytes } from "crypto";
import prisma from "@/lib/prisma";

export const newShareToken = () => randomBytes(18).toString("base64url");

/** The site a read-only link points at, or null when the link was switched off or never existed. */
export async function siteByShare(token: string) {
  if (!/^[\w-]{20,40}$/.test(token)) return null;
  return prisma.analyticsSite.findFirst({
    where: { shareToken: token },
    select: { id: true, name: true, domain: true, active: true },
  });
}
