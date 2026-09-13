import { NextRequest, NextResponse } from "next/server";
import { readZipLink, zipResponse } from "@/lib/media-zip";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Public (opened in Safari, which doesn't have the app's login). The random
// id is the credential: created by a signed-in team member, expires in 15 min.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await readZipLink(token);
  if (!link) return NextResponse.json({ error: "This download link has expired. Start the download again." }, { status: 404 });
  return zipResponse(link.ids, link.name);
}
