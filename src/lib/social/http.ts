/**
 * Retry helper for platform API calls.
 *
 * Only for requests that are safe to send twice: reads (GET/HEAD), status and
 * offset queries, and chunk uploads that carry an explicit Content-Range. Never
 * wrap a call that creates or publishes something (media_publish, createPost,
 * upload init, comments): a retry after a lost response would do it twice.
 */

export interface RetryOptions {
  /** Extra attempts after the first (default 3) */
  retries?: number;
  /**
   * Set for a non-GET/HEAD request that is still safe to repeat (offset
   * queries, Content-Range chunk PUTs). Other methods are sent once.
   */
  idempotent?: boolean;
}

const MAX_RETRY_AFTER_MS = 30_000;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function backoffMs(attempt: number, retryAfter: string | null): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
    const at = Date.parse(retryAfter);
    if (Number.isFinite(at)) return Math.min(Math.max(at - Date.now(), 0), MAX_RETRY_AFTER_MS);
  }
  return Math.min(1000 * 2 ** attempt, 8000) + Math.random() * 500;
}

export async function fetchWithRetry(url: string, init: RequestInit = {}, opts: RetryOptions = {}): Promise<Response> {
  const method = (init.method || "GET").toUpperCase();
  const safe = method === "GET" || method === "HEAD" || opts.idempotent === true;
  const retries = safe ? (opts.retries ?? 3) : 0;

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch (err) {
      if (attempt >= retries) throw err;
      await new Promise((r) => setTimeout(r, backoffMs(attempt, null)));
      continue;
    }

    if (!isRetryableStatus(res.status) || attempt >= retries) return res;

    const wait = backoffMs(attempt, res.headers.get("retry-after"));
    await res.body?.cancel().catch(() => {});
    await new Promise((r) => setTimeout(r, wait));
  }
}
