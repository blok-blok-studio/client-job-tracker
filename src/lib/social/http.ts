/**
 * Shared HTTP utilities for social platform API calls.
 *
 * Handles realistic request headers, request delays, and retry logic
 * to avoid automated-request detection by platform APIs.
 */

// Realistic browser-like User-Agent strings (rotated per request)
const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

/**
 * Add a small random delay between API calls (200-800ms)
 * to avoid burst-pattern detection.
 */
export async function humanDelay(minMs = 200, maxMs = 800): Promise<void> {
  const delay = minMs + Math.random() * (maxMs - minMs);
  return new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * Retry-capable fetch with exponential backoff + jitter.
 * Only retries on 429 (rate limited) and 5xx server errors.
 */
export async function resilientFetch(
  url: string,
  init: RequestInit & { retries?: number } = {}
): Promise<Response> {
  const { retries = 3, ...fetchInit } = init;

  // Inject realistic headers (these complement, not replace, existing headers)
  const headers = new Headers(fetchInit.headers);
  if (!headers.has("User-Agent")) {
    headers.set("User-Agent", getRandomUserAgent());
  }
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json, text/plain, */*");
  }
  if (!headers.has("Accept-Language")) {
    headers.set("Accept-Language", "en-US,en;q=0.9");
  }
  // Signal we accept compressed responses
  if (!headers.has("Accept-Encoding")) {
    headers.set("Accept-Encoding", "gzip, deflate, br");
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { ...fetchInit, headers });

      // Don't retry client errors (except 429)
      if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
        return res;
      }

      // Rate limited — respect Retry-After header if present
      if (res.status === 429) {
        const retryAfter = res.headers.get("Retry-After");
        const waitSec = retryAfter ? parseInt(retryAfter) : 0;
        if (waitSec > 0 && waitSec < 120) {
          await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));
          continue;
        }
      }

      // 5xx — retry with backoff
      if (attempt < retries) {
        const backoff = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
        continue;
      }

      return res; // final attempt, return whatever we got
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        const backoff = Math.pow(2, attempt) * 1000;
        const jitter = Math.random() * 1000;
        await new Promise((resolve) => setTimeout(resolve, backoff + jitter));
      }
    }
  }

  throw lastError || new Error(`Failed to fetch ${url} after ${retries + 1} attempts`);
}

/**
 * Build platform-specific headers for OAuth-based APIs.
 * Includes anti-bot measures.
 */
export function buildApiHeaders(
  accessToken: string,
  extra: Record<string, string> = {}
): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": getRandomUserAgent(),
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    ...extra,
  };
}
