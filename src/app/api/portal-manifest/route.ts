import { NextRequest, NextResponse } from "next/server";

// Per-portal web-app manifest. The root manifest's start_url is "/" (the team
// login), so a contractor or client who added their portal to the home screen
// got an icon that opened a login they can't use. Each public token page links
// this manifest instead, so the installed icon reopens THEIR link.
//
// `start` must be one of our short token links — anything else falls back to
// "/" rather than letting a crafted URL mint a manifest for an arbitrary path.
const START_RE = /^\/(i|r|o|u|c|a)\/[\w-]{16,64}$/;

const DESCRIPTIONS: Record<string, string> = {
  i: "Submit invoices, log hours, and manage your paperwork with Blok Blok Studio.",
  r: "Review and approve your finished work from Blok Blok Studio.",
  o: "Your onboarding with Blok Blok Studio.",
  u: "Securely share files with Blok Blok Studio.",
  c: "Your agreement with Blok Blok Studio.",
  a: "Your agreement with Blok Blok Studio.",
};

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("start") || "";
  const start = START_RE.test(raw) ? raw : "/";
  const kind = start === "/" ? "" : start.slice(1, 2);

  const manifest = {
    // The user names their own icon on iOS; Android shows short_name under it
    name: "Blok Blok Studio",
    short_name: "BlokBlok",
    description: DESCRIPTIONS[kind] || "Blok Blok Studio.",
    // id keeps installs distinct per person, so a phone with two portals on it
    // (e.g. a contractor who is also a client) gets two separate icons
    id: start,
    start_url: start,
    scope: "/",
    display: "standalone",
    background_color: "#0A0A0A",
    theme_color: "#0A0A0A",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
