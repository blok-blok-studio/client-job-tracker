import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = [
  "/login",
  "/payment",
  "/onboard",
  "/contract",
  "/upload",
  "/api/auth/login",
  "/api/openclaw/webhook",
  "/api/onboard",
  "/api/contract",
  "/api/client-media/upload-portal",
  "/api/telegram/webhook",
  "/api/stripe/webhook",
  "/api/cron",
];

// In-memory rate limiter (Edge runtime compatible)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 120; // standard API requests per minute
const RATE_LIMIT_WINDOW = 60_000; // 1 minute

// Stricter limits for sensitive endpoints
const UPLOAD_RATE_LIMIT_MAX = 20;
const BULK_RATE_LIMIT_MAX = 5;

function checkRateLimit(ip: string, max: number = RATE_LIMIT_MAX, prefix = "api"): boolean {
  const key = `${prefix}:${ip}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (entry.count >= max) return false;
  entry.count++;
  return true;
}

// Periodic cleanup of stale entries (every 5 minutes)
let lastCleanup = Date.now();
function cleanupRateLimits() {
  const now = Date.now();
  if (now - lastCleanup < 300_000) return;
  lastCleanup = now;
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(key);
  }
}

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  return new TextEncoder().encode(secret);
}

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  cleanupRateLimits();

  // Allow static assets, Next.js internals, and uploaded media files
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/uploads/") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".ico") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".gif") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".mp4") ||
    pathname.endsWith(".mov") ||
    pathname.endsWith(".webm") ||
    pathname.endsWith(".woff") ||
    pathname.endsWith(".woff2")
  ) {
    return NextResponse.next();
  }

  const ip = getClientIp(request);

  // Rate limit API requests with different tiers
  if (pathname.startsWith("/api/")) {
    // Upload endpoint — stricter limit
    if (pathname.startsWith("/api/uploads")) {
      if (!checkRateLimit(ip, UPLOAD_RATE_LIMIT_MAX, "upload")) {
        return addSecurityHeaders(
          NextResponse.json(
            { error: "Upload rate limit exceeded. Please try again later." },
            { status: 429, headers: { "Retry-After": "60" } }
          )
        );
      }
    }
    // Bulk import — very strict limit
    else if (pathname.startsWith("/api/content-posts/bulk")) {
      if (!checkRateLimit(ip, BULK_RATE_LIMIT_MAX, "bulk")) {
        return addSecurityHeaders(
          NextResponse.json(
            { error: "Bulk import rate limit exceeded." },
            { status: 429, headers: { "Retry-After": "60" } }
          )
        );
      }
    }
    // Standard API rate limit
    else if (!checkRateLimit(ip)) {
      return addSecurityHeaders(
        NextResponse.json(
          { error: "Too many requests. Please try again later." },
          { status: 429, headers: { "Retry-After": "60" } }
        )
      );
    }

    // Block suspiciously large payloads on non-upload routes
    if (!pathname.startsWith("/api/uploads") && !pathname.startsWith("/api/content-posts/bulk") && !pathname.startsWith("/api/client-media/upload-portal")) {
      const contentLength = request.headers.get("content-length");
      if (contentLength && parseInt(contentLength) > 5 * 1024 * 1024) {
        return addSecurityHeaders(
          NextResponse.json({ error: "Request body too large" }, { status: 413 })
        );
      }
    }
  }

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return addSecurityHeaders(NextResponse.next());
  }

  // Check session cookie
  const token = request.cookies.get("bb_session")?.value;
  if (!token) {
    if (pathname.startsWith("/api/")) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const secret = getSecret();
  if (!secret) {
    if (pathname.startsWith("/api/")) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Server misconfigured" }, { status: 500 })
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  try {
    await jwtVerify(token, secret);
    return addSecurityHeaders(NextResponse.next());
  } catch {
    if (pathname.startsWith("/api/")) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
