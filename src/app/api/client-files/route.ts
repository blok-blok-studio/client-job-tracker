import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { requestMeta } from "@/lib/request-meta";

const createSchema = z.object({
  clientId: z.string().min(1),
  kind: z.enum(["FILE", "LINK"]).default("FILE"),
  filename: z.string().min(1, "Name the file or link").max(300),
  url: z.string().url("A valid URL is required").max(1000),
  fileSize: z.number().int().min(0).optional().nullable(),
  mimeType: z.string().max(200).optional().nullable(),
  folder: z.string().max(120).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

// GET /api/client-files?clientId=… — a client's handed-over files and links
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ success: false, error: "clientId is required" }, { status: 400 });
  }
  const files = await prisma.clientFile.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ success: true, data: files });
}

// POST /api/client-files — register an uploaded file (blob already streamed
// via browser → Blob) or save an external link (their Drive folder)
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }
    const input = parsed.data;

    const client = await prisma.client.findUnique({
      where: { id: input.clientId },
      select: { id: true, name: true },
    });
    if (!client) {
      return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
    }

    const file = await prisma.clientFile.create({
      data: {
        clientId: input.clientId,
        kind: input.kind,
        filename: input.filename,
        url: input.url,
        fileSize: input.fileSize ?? null,
        mimeType: input.mimeType || null,
        folder: input.folder || null,
        notes: input.notes || null,
        uploadedBy: session.name,
      },
    });

    await prisma.activityLog.create({
      data: {
        clientId: client.id,
        actor: session.name,
        action: input.kind === "LINK" ? "added_client_link" : "added_client_file",
        details:
          input.kind === "LINK"
            ? `Saved link: ${file.filename}`
            : `Added client file: ${file.filename}`,
        ...requestMeta(request),
      },
    });

    return NextResponse.json({ success: true, data: file }, { status: 201 });
  } catch (error) {
    console.error("Failed to add client file:", error);
    return NextResponse.json({ success: false, error: "Failed to add file" }, { status: 500 });
  }
}
