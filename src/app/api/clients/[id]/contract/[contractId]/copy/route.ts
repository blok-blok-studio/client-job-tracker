import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { requestMeta } from "@/lib/request-meta";
import { copyContractAsDraft, ContractEditError } from "@/lib/contract-edit";

// POST — Make a new editable draft from any of this client's contracts (the original is untouched)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contractId: string }> }
) {
  const session = await getSession();
  if (session?.role !== "OWNER") {
    return NextResponse.json({ success: false, error: "Owner only" }, { status: 403 });
  }

  const { id, contractId } = await params;

  try {
    const meta = requestMeta(request);
    const result = await copyContractAsDraft({
      clientId: id,
      contractId,
      editedBy: session.email,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof ContractEditError) {
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error("Failed to copy contract:", error);
    return NextResponse.json({ success: false, error: "Failed to copy contract" }, { status: 500 });
  }
}
