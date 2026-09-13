import { NextRequest, NextResponse } from "next/server";
import { createZipLink } from "@/lib/media-zip";

export const dynamic = "force-dynamic";

// Team-only (behind the session middleware): stores a selection and returns a
// short-lived link Safari can open to download it as a zip.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const ids = Array.isArray(body?.ids) ? body.ids.filter((id: unknown): id is string => typeof id === "string") : [];
  if (ids.length === 0) return NextResponse.json({ error: "No files requested" }, { status: 400 });
  const name = typeof body?.name === "string" && body.name ? body.name : "media";

  const id = await createZipLink(ids, name);
  return NextResponse.json({ url: `/api/client-media/zip-link/${id}` });
}
