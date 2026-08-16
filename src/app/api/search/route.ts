import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sessionIsOwner } from "@/lib/finance-fields";

// Global command-palette search across clients, tasks, files, deliverables,
// contracts, content posts, contractors, contractor invoices, and contractor agreements.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim().slice(0, 100);
  if (!q || q.length < 2) {
    return NextResponse.json({
      success: true,
      data: {
        clients: [],
        tasks: [],
        files: [],
        deliverables: [],
        contracts: [],
        posts: [],
        contractors: [],
        contractorInvoices: [],
        contractorHours: [],
        contractorContracts: [],
      },
    });
  }

  const contains = { contains: q, mode: "insensitive" as const };

  const [clients, tasks, files, deliverables, contracts, posts, contractors, contractorInvoices, contractorHours, contractorContracts] = await Promise.all([
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
    prisma.contractor.findMany({
      where: { OR: [{ name: contains }, { company: contains }, { email: contains }] },
      select: { id: true, name: true, company: true, isActive: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    }),
    prisma.contractorInvoice.findMany({
      where: {
        OR: [{ invoiceNumber: contains }, { filename: contains }, { contractor: { name: contains } }],
      },
      select: {
        id: true,
        invoiceNumber: true,
        filename: true,
        status: true,
        amount: true,
        currency: true,
        contractor: { select: { name: true } },
      },
      orderBy: { submittedAt: "desc" },
      take: 5,
    }),
    prisma.contractorHoursEntry.findMany({
      where: {
        OR: [{ description: contains }, { clientName: contains }, { contractor: { name: contains } }],
      },
      select: {
        id: true,
        workDate: true,
        startLocal: true,
        endLocal: true,
        durationMinutes: true,
        clientName: true,
        status: true,
        contractor: { select: { name: true } },
      },
      orderBy: { startAt: "desc" },
      take: 5,
    }),
    prisma.contractorContract.findMany({
      where: {
        OR: [{ title: contains }, { signedName: contains }, { contractor: { name: contains } }],
      },
      select: {
        id: true,
        title: true,
        kind: true,
        status: true,
        signedAt: true,
        contractor: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  // Invoice amounts are owner-only — members still find the invoice, just
  // without the money on it.
  const isOwner = await sessionIsOwner();
  const safeInvoices = isOwner
    ? contractorInvoices
    : contractorInvoices.map((inv) => ({ ...inv, amount: null, currency: null }));

  return NextResponse.json({
    success: true,
    data: { clients, tasks, files, deliverables, contracts, posts, contractors, contractorInvoices: safeInvoices, contractorHours, contractorContracts },
  });
}
