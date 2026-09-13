import { NextRequest, NextResponse } from "next/server";
import { zipResponse } from "@/lib/media-zip";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Accepts a hidden-form POST (so the browser handles the download natively —
// no fetch()->blob() buffering, which crashes tabs on big galleries) or JSON.
export async function POST(request: NextRequest) {
  let ids: string[] = [];
  let zipName = "media";

  const contentType = request.headers.get("content-type") || "";
  try {
    if (contentType.includes("application/json")) {
      const body = await request.json();
      ids = Array.isArray(body?.ids) ? body.ids : [];
      if (typeof body?.name === "string") zipName = body.name;
    } else {
      const form = await request.formData();
      ids = JSON.parse(String(form.get("ids") || "[]"));
      const name = form.get("name");
      if (typeof name === "string" && name) zipName = name;
    }
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  return zipResponse(ids, zipName);
}
