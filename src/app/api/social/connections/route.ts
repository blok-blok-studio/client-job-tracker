import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { CredentialMeta } from "@/lib/social/types";

/**
 * Social connections for the composer account picker and the planner's
 * connections tab. Metadata only: tokens, account ids and refresh tokens never
 * leave the server.
 *
 * GET ?clientId=<id>  → that client's accounts
 * GET                 → every client's accounts (with client name)
 */

type SocialPlatform = "INSTAGRAM" | "TIKTOK" | "YOUTUBE" | "FACEBOOK" | "LINKEDIN" | "TWITTER" | "THREADS";
type Health = "ok" | "expiring" | "expired" | "needs_reconnect" | "unknown";

const DAY = 24 * 60 * 60 * 1000;

/** Vault rows are free-form ("Instagram", "INSTAGRAM", "X (Twitter)"); skip anything not social. */
function normalizePlatform(raw: string): SocialPlatform | null {
  const p = raw.trim().toLowerCase();
  if (p.includes("instagram")) return "INSTAGRAM";
  if (p.includes("tiktok")) return "TIKTOK";
  if (p.includes("youtube") || p === "google") return "YOUTUBE";
  if (p.includes("threads")) return "THREADS";
  if (p.includes("facebook") || p === "meta") return "FACEBOOK";
  if (p.includes("linkedin")) return "LINKEDIN";
  if (p.includes("twitter") || p === "x" || p === "x.com") return "TWITTER";
  return null;
}

function reconnectProviderFor(platform: SocialPlatform, meta: CredentialMeta | null): string {
  if (meta?.provider) return meta.provider;
  switch (platform) {
    case "INSTAGRAM":
      return meta?.apiHost === "graph.instagram.com" ? "instagram" : "meta";
    case "FACEBOOK":
      return "meta";
    case "THREADS":
      return "threads";
    case "TWITTER":
      return "twitter";
    case "LINKEDIN":
      return "linkedin";
    case "YOUTUBE":
      return "google";
    case "TIKTOK":
      return "tiktok";
  }
}

/** The OAuth flow stores the access-token expiry in `url`; manual vault rows keep a website there. */
function parseExpiry(url: string | null): Date | null {
  if (!url || !/^\d{4}-\d{2}-\d{2}T/.test(url)) return null;
  const d = new Date(url);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");

  try {
    // Cast: Prisma's select/include type inference is broken repo-wide
    const credentials = (await prisma.credential.findMany({
      where: clientId ? { clientId } : {},
      select: {
        id: true,
        clientId: true,
        platform: true,
        label: true,
        url: true,
        notes: true, // only read as "has a refresh token"; never returned
        meta: true,
        lastRotated: true,
        createdAt: true,
        client: { select: { name: true } },
      },
      orderBy: [{ platform: "asc" }, { createdAt: "asc" }],
    })) as unknown as {
      id: string;
      clientId: string;
      platform: string;
      label: string | null;
      url: string | null;
      notes: string | null;
      meta: unknown;
      lastRotated: Date | null;
      createdAt: Date;
      client: { name: string };
    }[];

    const social = credentials
      .map((c) => ({ ...c, normalized: normalizePlatform(c.platform) }))
      .filter((c): c is typeof c & { normalized: SocialPlatform } => c.normalized !== null);

    // Dead connections are recorded in the activity log when refresh gives up
    const deadLogs = social.length
      ? await prisma.activityLog.findMany({
          where: {
            action: "credential_needs_reconnect",
            clientId: { in: [...new Set(social.map((c) => c.clientId))] },
          },
          select: { clientId: true, details: true, createdAt: true },
          orderBy: { createdAt: "desc" },
          take: 500,
        })
      : [];

    const now = Date.now();

    const data = social.map((c) => {
      const meta = (c.meta as CredentialMeta | null) ?? null;
      const expiresAt = parseExpiry(c.url);
      const hasRefreshToken = !!c.notes;
      const label = c.label || meta?.username || c.platform;
      const provider = reconnectProviderFor(c.normalized, meta);
      const isOAuth = !!meta?.provider || !!expiresAt || hasRefreshToken || !!c.lastRotated;

      const markedDead = deadLogs.some(
        (log) =>
          log.clientId === c.clientId &&
          log.details?.includes(`connection for ${c.label || "account"}`) &&
          (!c.lastRotated || log.createdAt > c.lastRotated)
      );

      let health: Health = "unknown";
      if (markedDead && !expiresAt) {
        health = "needs_reconnect";
      } else if (hasRefreshToken) {
        // Access tokens here refresh themselves; only the refresh token's own
        // lifetime (TikTok reports it) can run out
        const refreshExpiry = meta?.refreshExpiresAt ? new Date(meta.refreshExpiresAt).getTime() : null;
        if (refreshExpiry && refreshExpiry < now) health = "expired";
        else if (refreshExpiry && refreshExpiry - now < 7 * DAY) health = "expiring";
        else health = "ok";
      } else if (expiresAt) {
        const left = expiresAt.getTime() - now;
        health = left < 0 ? "expired" : left < 7 * DAY ? "expiring" : "ok";
      } else if (isOAuth) {
        health = markedDead ? "needs_reconnect" : "unknown";
      }

      return {
        id: c.id,
        clientId: c.clientId,
        clientName: c.client.name,
        platform: c.normalized,
        label,
        username: meta?.username || (c.label?.startsWith("@") ? c.label.slice(1) : null),
        displayName: meta?.displayName || null,
        avatarUrl: meta?.avatarUrl || null,
        provider,
        apiHost: meta?.apiHost || null,
        expiresAt: expiresAt?.toISOString() || null,
        lastRotated: c.lastRotated?.toISOString() || null,
        health,
        reconnectProvider: provider,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to load connections" }, { status: 500 });
  }
}
