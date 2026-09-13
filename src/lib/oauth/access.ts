/**
 * Who may start an account connection for a client.
 *
 * Team members connect from inside the app (session). Clients connect their
 * own accounts from their onboarding link, which proves itself with the
 * client's onboardToken. Anyone else is refused, so nobody can attach their
 * own social account to a client.
 */

import crypto from "crypto";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export type OAuthActor = { kind: "team"; name: string } | { kind: "client" };

function tokensMatch(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

export async function resolveOAuthActor(clientId: string, onboardToken?: string | null): Promise<OAuthActor | null> {
  const session = await getSession();
  if (session) return { kind: "team", name: session.name };

  if (!onboardToken) return null;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { onboardToken: true } });
  if (!client?.onboardToken || !tokensMatch(client.onboardToken, onboardToken)) return null;
  return { kind: "client" };
}

/** Only ever redirect back into this app; anything else falls back to `fallback`. */
export function safeReturnTo(returnTo: string | null | undefined, fallback: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  if (!returnTo) return fallback;
  try {
    const url = new URL(returnTo, base);
    return url.origin === new URL(base).origin ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

/** Append a query param to a URL that may already have a query string. */
export function withParam(url: string, key: string, value: string): string {
  const u = new URL(url, process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");
  u.searchParams.set(key, value);
  return u.toString();
}
