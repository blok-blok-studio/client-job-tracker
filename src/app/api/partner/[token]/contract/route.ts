import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request-meta";
import { findRepByToken } from "@/lib/partner-portal";
import {
  PARTNER_WEBSITE_IDS,
  PARTNER_BRAND_GUIDE_ID,
  PARTNER_PLAN_IDS,
  PARTNER_PAYMENT_SCHEDULE,
  PARTNER_CONTRACT_TERMS,
  partnerPackage,
} from "@/lib/partner-catalog";
import { createClientContract, ContractCreateError } from "@/lib/contract-create";
import { getSetting } from "@/lib/lifecycle/settings";
import { notifySlack } from "@/lib/slack";

// Stripe (one Checkout per milestone + plan) and three emails: give it room
export const maxDuration = 300;

// POST — an approved closer generates our standard Service Agreement for a
// practice they registered. Everything is locked: the partner price list, US
// terms, a 50/50 payment schedule, Chase's counter-signature. The rep gets the
// signing link and the deposit link back to paste into the call; the client
// gets them by email at the same time.

const schema = z.object({
  clientId: z.string().min(1),
  websiteId: z.enum(PARTNER_WEBSITE_IDS).nullable().optional(),
  brandGuide: z.boolean().optional().default(false),
  planId: z.enum(PARTNER_PLAN_IDS).nullable().optional(),
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const rl = rateLimit(getClientIp(request), { max: 20, prefix: "partner-contract" });
  if (!rl.allowed) {
    return NextResponse.json({ success: false, error: "Too many requests" }, { status: 429 });
  }

  const { token } = await params;
  const rep = await findRepByToken(token);
  if (!rep) {
    return NextResponse.json({ success: false, error: "Invalid link" }, { status: 404 });
  }
  if (!rep.canClose) {
    return NextResponse.json(
      { success: false, error: "Your link is not approved for closing yet. Register the practice and book the call with Chase." },
      { status: 403 }
    );
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Pick at least one package from the price list" }, { status: 400 });
  }
  const d = parsed.data;

  const packages: string[] = [];
  if (d.websiteId) packages.push(d.websiteId);
  if (d.brandGuide) packages.push(PARTNER_BRAND_GUIDE_ID);
  if (d.planId) packages.push(d.planId);
  if (packages.length === 0 || packages.some((id) => !partnerPackage(id))) {
    return NextResponse.json({ success: false, error: "Pick at least one package from the price list" }, { status: 400 });
  }

  const client = await prisma.client.findUnique({
    where: { id: d.clientId },
    select: { id: true, name: true, email: true, partnerId: true },
  });
  if (!client || client.partnerId !== rep.partnerId) {
    return NextResponse.json({ success: false, error: "That practice is not registered to your team" }, { status: 404 });
  }
  if (!client.email) {
    return NextResponse.json({ success: false, error: "Add the practice's email first so we can send the contract" }, { status: 400 });
  }
  const openContract = await prisma.contractSignature.findFirst({
    where: { clientId: client.id, kind: "SERVICE_AGREEMENT", status: { in: ["PENDING", "SIGNED"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });
  if (openContract) {
    return NextResponse.json(
      {
        success: false,
        error:
          openContract.status === "SIGNED"
            ? "This practice already has a signed agreement. Contact Chase for changes."
            : "A contract is already out for signature with this practice. Contact Chase to void it before generating another.",
      },
      { status: 409 }
    );
  }

  const [signerName, signatureData] = await Promise.all([
    getSetting<string>("partner_contract_signer_name", "Chase Haynes"),
    getSetting<string | null>("partner_contract_signature_data", null),
  ]);

  const meta = requestMeta(request);

  try {
    // Attribution first, so the commission webhook sees a team close even if
    // the client pays before this request finishes logging.
    await prisma.client.update({
      where: { id: client.id },
      data: { closedBy: "PARTNER_REP", partnerRepId: rep.id },
    });

    const result = await createClientContract({
      clientId: client.id,
      packages,
      addons: [],
      customItems: [],
      customTerms: PARTNER_CONTRACT_TERMS,
      providerSignedName: signerName,
      providerSignatureData: signatureData || null,
      country: rep.partner.country || "US",
      paymentSchedule: [...PARTNER_PAYMENT_SCHEDULE],
      skipPayment: false,
      draft: false,
      createdBy: `${rep.name} (${rep.partner.name})`,
      actor: "partner",
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    const deposit = result.paymentLinks.find((l) => l.milestone === "deposit") || result.paymentLinks[0] || null;
    const plan = result.paymentLinks.find((l) => l.milestone === "subscription") || null;

    notifySlack(
      `:memo: *Partner close* — ${rep.name} (${rep.partner.name}) generated a contract for *${client.name}*: ${packages
        .map((id) => partnerPackage(id)?.name)
        .filter(Boolean)
        .join(", ")}.\n${APP_URL}/clients/${client.id}`
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      data: {
        contractUrl: `${APP_URL}/c/${result.token}`,
        depositUrl: deposit?.url || null,
        depositAmount: deposit?.amount || null,
        planUrl: plan?.url || null,
        planAmount: plan?.amount || null,
        paymentLinkError: result.paymentLinkError,
      },
    });
  } catch (err) {
    if (err instanceof ContractCreateError) {
      return NextResponse.json({ success: false, error: err.message }, { status: err.status });
    }
    console.error("[partner/contract] failed:", err);
    return NextResponse.json({ success: false, error: "Could not generate the contract. Contact Chase." }, { status: 500 });
  }
}
