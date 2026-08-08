import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureSeeded } from "@/lib/lifecycle/engine";
import { SEQUENCE_SOURCES } from "@/lib/lifecycle/sequences-source";

// GET /api/lifecycle/templates — every template with its trigger context and last-edited info
export async function GET() {
  await ensureSeeded();
  const templates = (await prisma.emailTemplate.findMany({
    orderBy: { key: "asc" },
    include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
  })) as unknown as Array<
    import("@prisma/client").EmailTemplate & {
      versions: import("@prisma/client").EmailTemplateVersion[];
    }
  >;

  // Map template → the sequence step(s) that use it, for the trigger column
  const usage: Record<string, string[]> = {};
  for (const seq of SEQUENCE_SOURCES) {
    for (const step of seq.steps) {
      if (!step.templateKey) continue;
      (usage[step.templateKey] ||= []).push(`${seq.name}: ${step.label}`);
    }
  }

  return NextResponse.json({
    success: true,
    data: templates.map((t) => ({
      key: t.key,
      name: t.name,
      subject: t.subject,
      kind: t.kind,
      trigger: usage[t.key]?.join(" · ") || "Manual send (snippet library)",
      updatedAt: t.updatedAt,
      updatedBy: t.updatedBy,
      versionCount: t.versions.length > 0 ? undefined : 0, // detail route returns full history
    })),
  });
}
