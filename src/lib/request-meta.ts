import type { NextRequest } from "next/server";

/** Client IP + user agent for audit-trail activity logs. */
export function requestMeta(request: NextRequest): { ipAddress: string | null; userAgent: string | null } {
  const forwarded = request.headers.get("x-forwarded-for");
  const ipAddress = forwarded ? forwarded.split(",")[0].trim() : request.headers.get("x-real-ip");
  const userAgent = request.headers.get("user-agent");
  return { ipAddress: ipAddress || null, userAgent: userAgent ? userAgent.slice(0, 500) : null };
}
