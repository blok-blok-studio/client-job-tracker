import crypto from "crypto";

/** Signs a subscriber id for one-click unsubscribe links (prevents enumeration). */
export function unsubscribeSig(id: string): string {
  return crypto
    .createHmac("sha256", process.env.AUTH_SECRET || "")
    .update(id)
    .digest("hex")
    .slice(0, 16);
}
