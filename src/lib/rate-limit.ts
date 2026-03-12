/**
 * In-memory rate limiter for API routes.
 * Uses a sliding window counter per IP address.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, RateLimitEntry>();

// Cleanup stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now > entry.resetAt) buckets.delete(key);
  }
}, 5 * 60 * 1000);

interface RateLimitOptions {
  /** Max requests per window (default: 60) */
  max?: number;
  /** Window duration in ms (default: 60_000 = 1 min) */
  windowMs?: number;
  /** Prefix for the bucket key to separate different routes */
  prefix?: string;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(
  ip: string,
  options: RateLimitOptions = {}
): RateLimitResult {
  const { max = 60, windowMs = 60_000, prefix = "api" } = options;
  const key = `${prefix}:${ip}`;
  const now = Date.now();

  const entry = buckets.get(key);

  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, resetAt: now + windowMs };
  }

  if (entry.count >= max) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, remaining: max - entry.count, resetAt: entry.resetAt };
}

/**
 * Helper to extract client IP from a Next.js request.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}
