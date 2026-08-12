import type { NextRequest } from "next/server";

/**
 * Client IP + user agent for audit-trail activity logs.
 *
 * On Vercel, `x-real-ip` and `x-vercel-forwarded-for` are set by the platform to
 * the true client address and cannot be spoofed by the caller, whereas the
 * left-most `x-forwarded-for` entry IS attacker-controlled. We trust the
 * platform headers first so the legal audit trail can't be forged, and fall
 * back to the right-most XFF hop (closest to our edge) only if they're absent.
 */
export function requestMeta(request: NextRequest): { ipAddress: string | null; userAgent: string | null } {
  const platformIp =
    request.headers.get("x-real-ip") || request.headers.get("x-vercel-forwarded-for");

  let ipAddress = platformIp;
  if (!ipAddress) {
    const forwarded = request.headers.get("x-forwarded-for");
    if (forwarded) {
      const hops = forwarded.split(",").map((h) => h.trim()).filter(Boolean);
      // right-most hop is the one our own infrastructure observed
      ipAddress = hops[hops.length - 1] || null;
    }
  }

  const userAgent = request.headers.get("user-agent");
  return { ipAddress: ipAddress || null, userAgent: userAgent ? userAgent.slice(0, 500) : null };
}
