import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";

// GET /api/contractors — contractors with their invoices for the overview page
export async function GET() {
  try {
    const contractors = await prisma.contractor.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        invoices: {
          orderBy: { submittedAt: "desc" },
          include: {
            notes: { orderBy: { createdAt: "asc" } },
            audits: { orderBy: { createdAt: "asc" } },
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: contractors });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to load contractors" }, { status: 500 });
  }
}

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email().optional().or(z.literal("")),
  company: z.string().max(200).optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

// POST /api/contractors — add a contractor and mint their upload link
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message || "Invalid input" },
        { status: 400 }
      );
    }
    const d = parsed.data;

    const contractor = await prisma.contractor.create({
      data: {
        name: d.name,
        email: d.email || null,
        company: d.company || null,
        phone: d.phone || null,
        notes: d.notes || null,
        uploadToken: randomBytes(16).toString("base64url"),
      },
      include: { invoices: true },
    });

    await prisma.activityLog.create({
      data: {
        actor: session?.name || "team",
        action: "contractor_added",
        details: `Added contractor: ${contractor.name}`,
      },
    });

    return NextResponse.json({ success: true, data: contractor });
  } catch {
    return NextResponse.json({ success: false, error: "Failed to add contractor" }, { status: 500 });
  }
}
