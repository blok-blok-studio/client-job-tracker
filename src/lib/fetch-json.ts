/**
 * Safe JSON reading for fetch responses.
 *
 * Our API routes always answer with JSON, but the platform in front of them
 * does not: Vercel returns text/plain for 413 FUNCTION_PAYLOAD_TOO_LARGE and
 * HTML for gateway timeouts, and a dropped connection yields an empty body.
 * Calling `res.json()` on those throws a raw browser SyntaxError — which reads
 * "The string did not match the expected pattern." in Safari and lands in a
 * toast in front of a contractor or client. Parse through here instead.
 */

export interface JsonResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** Human-readable message, already safe to show. Null when ok. */
  error: string | null;
}

/** Platform/proxy failures that never carry a JSON body of ours. */
function platformMessage(status: number): string | null {
  if (status === 413) return "That file is too large to send this way.";
  if (status === 401 || status === 403) return "Your session expired. Please sign in again.";
  if (status === 429) return "Too many requests in a row. Wait a moment and try again.";
  if (status === 502 || status === 503) return "The server is unavailable right now. Try again.";
  if (status === 504) return "That took too long and timed out. Try again with fewer files at once.";
  return null;
}

/**
 * Read a response as JSON, never throwing on a non-JSON body.
 * `fallback` is the message used when the server gave no usable error text.
 */
export async function readJson<T = unknown>(
  res: Response,
  fallback = "Something went wrong. Please try again."
): Promise<JsonResult<T>> {
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    data = null;
  }

  if (res.ok && data && (data as { success?: boolean }).success !== false) {
    return { ok: true, status: res.status, data, error: null };
  }

  const serverError = (data as { error?: unknown } | null)?.error;
  const error =
    (typeof serverError === "string" && serverError.trim()) ||
    platformMessage(res.status) ||
    fallback;

  return { ok: false, status: res.status, data, error };
}

/**
 * Turn any thrown value into something worth showing a user. Browser internals
 * (JSON parse failures, DOMExceptions, `TypeError: Load failed`) are replaced
 * with `fallback`; messages we threw ourselves pass through.
 */
export function friendlyError(err: unknown, fallback = "Something went wrong. Please try again."): string {
  if (!(err instanceof Error) || !err.message) return fallback;

  const message = err.message.trim();

  // Every browser words a failed JSON.parse differently:
  //   Safari  "The string did not match the expected pattern."
  //           "JSON Parse error: Unexpected identifier"
  //   Chrome  "Unexpected token 'R', \"Request En\"... is not valid JSON"
  //   Firefox "JSON.parse: unexpected character at line 1 column 1"
  const lower = message.toLowerCase();
  if (
    lower.includes("did not match the expected pattern") ||
    lower.includes("is not valid json") ||
    lower.includes("json.parse") ||
    lower.includes("json parse error") ||
    lower.includes("unexpected token") ||
    lower.includes("unexpected end of")
  ) {
    return fallback;
  }

  // Network-layer failures, which browsers word differently on every platform
  if (
    message === "Load failed" ||
    message === "Failed to fetch" ||
    message === "NetworkError when attempting to fetch resource." ||
    message.includes("Network request failed")
  ) {
    return "Connection lost. Check your internet and try again.";
  }

  if (err.name === "AbortError") return "Upload cancelled.";

  return message;
}
