import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner, handleError } from "@/app/api/studio-invoices/_shared";
import { mergeClients } from "@/lib/client-merge";

const schema = z.object({ fromId: z.string().min(1).max(64) });

// POST { fromId } — merge a duplicate client into this one. Owner only. The duplicate is archived, not deleted.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { session, denied } = await requireOwner();
  if (denied || !session) return denied;
  try {
    const { id } = await params;
    const { fromId } = schema.parse(await request.json());
    return NextResponse.json({ success: true, data: await mergeClients(id, fromId, session.name) });
  } catch (err) {
    if (err instanceof Error && /not found|different client|already merged/.test(err.message)) return NextResponse.json({ success: false, error: err.message }, { status: 400 });
    return handleError(err, "Merge failed");
  }
}
