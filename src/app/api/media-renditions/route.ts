import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ensureRenditions } from "@/lib/social/renditions";
import { ASPECT_PRESETS, ORIGINAL_ASPECT, clampFocus, type MediaFormat } from "@/lib/social/formats";

const formatSchema = z.object({
  aspect: z.string().refine((a) => a === ORIGINAL_ASPECT || !!ASPECT_PRESETS[a], "Unknown aspect ratio"),
  fit: z.enum(["pad", "crop"]),
  focus: z.record(z.string(), z.object({ x: z.number(), y: z.number() })).optional(),
});

const prewarmSchema = formatSchema.extend({
  clientId: z.string().nullable().optional(),
  urls: z.array(z.string().url()).min(1).max(50),
});

function toFormat(input: z.infer<typeof formatSchema>): MediaFormat {
  const focus: MediaFormat["focus"] = {};
  for (const [url, p] of Object.entries(input.focus || {})) focus[url] = { x: clampFocus(p.x), y: clampFocus(p.y) };
  return { aspect: input.aspect, fit: input.fit, focus };
}

/**
 * POST: queue formatted copies ahead of publishing (the composer calls this on
 * save so rendering is done by the time the post is due). Failed copies get a
 * fresh try.
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = prewarmSchema.parse(await request.json());
    const items = await ensureRenditions({
      urls: parsed.urls,
      format: toFormat(parsed),
      clientId: parsed.clientId,
      resetFailedBefore: new Date(),
    });
    return NextResponse.json({ success: true, data: { items } });
  } catch (err) {
    const message = err instanceof z.ZodError ? err.issues[0]?.message || "Invalid request" : "Couldn't queue the formatted copies";
    return NextResponse.json({ success: false, error: message }, { status: err instanceof z.ZodError ? 400 : 500 });
  }
}

/**
 * GET ?url=<a>&url=<b>&aspect=9:16&fit=pad[&focus=<json {url:{x,y}}>]
 * Status of each formatted copy (creates missing rows, so polling after a
 * save always converges).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const urls = params.getAll("url").flatMap((u) => u.split(",")).filter(Boolean).slice(0, 50);
  let focus: unknown;
  try {
    focus = params.get("focus") ? JSON.parse(params.get("focus")!) : undefined;
  } catch {
    return NextResponse.json({ success: false, error: "focus must be JSON" }, { status: 400 });
  }

  const parsed = formatSchema.safeParse({ aspect: params.get("aspect") || "", fit: params.get("fit") || "pad", focus });
  if (!parsed.success || urls.length === 0) {
    return NextResponse.json({ success: false, error: "url, aspect and fit are required" }, { status: 400 });
  }

  try {
    const items = await ensureRenditions({ urls, format: toFormat(parsed.data) });
    return NextResponse.json({ success: true, data: { items } });
  } catch {
    return NextResponse.json({ success: false, error: "Couldn't read formatting status" }, { status: 500 });
  }
}
