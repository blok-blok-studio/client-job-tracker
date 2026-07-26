import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Global command-palette search across clients, tasks, files, deliverables,
// contracts, and content posts.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({
      success: true,
      data: { clients: [], tasks: [], files: [], deliverables: [], contracts: [], posts: [] },
    });
  }

  const contains = { contains: q, mode: "insensitive" as const };

  const [clients, tasks, files, deliverables, contracts, posts] = await Promise.all([
    prisma.client.findMany({
      where: {
        type: { not: "ARCHIVED" },
        OR: [{ name: contains }, { company: contains }, { email: contains }],
      },
      select: { id: true, name: true, company: true, type: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.task.findMany({
      where: { OR: [{ title: contains }, { description: contains }] },
      select: {
        id: true,
        title: true,
        status: true,
        client: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.clientMedia.findMany({
      where: { OR: [{ filename: contains }, { label: contains }] },
      select: {
        id: true,
        filename: true,
        fileType: true,
        client: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.deliverable.findMany({
      where: { title: contains },
      select: {
        id: true,
        title: true,
        status: true,
        client: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.contractSignature.findMany({
      where: { OR: [{ contractBody: contains }, { client: { name: contains } }] },
      select: {
        id: true,
        status: true,
        createdAt: true,
        client: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.contentPost.findMany({
      where: { OR: [{ title: contains }, { body: contains }] },
      select: {
        id: true,
        title: true,
        platform: true,
        status: true,
        client: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
  ]);

  return NextResponse.json({
    success: true,
    data: { clients, tasks, files, deliverables, contracts, posts },
  });
}
