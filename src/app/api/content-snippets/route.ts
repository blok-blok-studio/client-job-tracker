import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

const KINDS = ["CAPTION", "HASHTAGS"];

function cleanTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const raw of input) {
    const tag = String(raw).trim().replace(/^#+/, "").replace(/\s+/g, "").slice(0, 100);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out.slice(0, 60);
}

// GET /api/content-snippets?clientId= — this client's snippets plus the ones saved for every client
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  const snippets = await prisma.contentSnippet.findMany({
    where: clientId ? { OR: [{ clientId }, { clientId: null }] } : {},
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    take: 300,
  });
  return NextResponse.json({ success: true, data: snippets });
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const kind = typeof body.kind === "string" && KINDS.includes(body.kind) ? body.kind : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!kind) return NextResponse.json({ success: false, error: "Invalid snippet type" }, { status: 400 });
  if (!name) return NextResponse.json({ success: false, error: "Give it a name." }, { status: 400 });

  const text = kind === "CAPTION" && typeof body.body === "string" ? body.body.trim().slice(0, 5000) : "";
  const hashtags = kind === "HASHTAGS" ? cleanTags(body.hashtags) : [];
  if (kind === "CAPTION" && !text) return NextResponse.json({ success: false, error: "There's no text to save." }, { status: 400 });
  if (kind === "HASHTAGS" && hashtags.length === 0) return NextResponse.json({ success: false, error: "There are no hashtags to save." }, { status: 400 });

  const clientId = typeof body.clientId === "string" && body.clientId ? body.clientId : null;
  if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true } });
    if (!client) return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
  }

  const session = await getSession();
  const snippet = await prisma.contentSnippet.create({
    data: { clientId, kind, name, body: text || null, hashtags, createdBy: session?.name || null },
  });
  return NextResponse.json({ success: true, data: snippet }, { status: 201 });
}
