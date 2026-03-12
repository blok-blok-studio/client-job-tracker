import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { randomBytes, createHash } from "crypto";
import { generateContractBody, SERVICE_PACKAGES, ADDON_PACKAGES } from "@/lib/contract-templates";
import { createCheckoutSession, getCurrencyForCountry, CURRENCY_CONFIG } from "@/lib/stripe";
import { sendPaymentLinkEmail } from "@/lib/email";
import { z } from "zod";

const milestoneSchema = z.object({
  label: z.string(), // "deposit" | "milestone" | "completion"
  percent: z.number().min(1).max(100),
});

const generateSchema = z.object({
  packages: z.array(z.string()).default([]),
  addons: z.array(z.string()).optional().default([]),
  customItems: z.array(z.object({
    name: z.string().min(1).max(200),
    price: z.number().min(0),
    recurring: z.boolean().optional().default(false),
  })).optional().default([]),
  customTerms: z.string().max(5000).optional(),
  packageCustomizations: z.record(z.string(), z.object({
    priceOverride: z.number().min(0).optional(),
    excludedDeliverables: z.array(z.number().int().min(0)).optional(),
  })).optional(),
  providerSignedName: z.string().min(1).max(200),
  // Payment schedule
  country: z.string().length(2).default("US"),
  paymentSchedule: z.array(milestoneSchema).optional(), // e.g. [{label:"deposit",percent:50},{label:"completion",percent:50}]
});

// POST — Generate a new contract for a client
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const client = await prisma.client.findUnique({
      where: { id },
      select: { id: true, name: true, email: true, company: true, stripeCustomerId: true },
    });

    if (!client) {
      return NextResponse.json({ success: false, error: "Client not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = generateSchema.parse(body);

    // Validate payment schedule adds up to 100%
    if (parsed.paymentSchedule && parsed.paymentSchedule.length > 0) {
      const totalPercent = parsed.paymentSchedule.reduce((s, m) => s + m.percent, 0);
      if (totalPercent !== 100) {
        return NextResponse.json(
          { success: false, error: `Payment schedule must add up to 100% (got ${totalPercent}%)` },
          { status: 400 }
        );
      }
    }

    const token = randomBytes(32).toString("hex");
    const contractBody = generateContractBody(
      client.name,
      client.company,
      parsed.packages,
      parsed.addons,
      parsed.customItems,
      parsed.customTerms,
      parsed.packageCustomizations
    );

    // SHA-256 hash of the contract body for tamper detection
    const documentHash = createHash("sha256").update(contractBody).digest("hex");

    // Capture provider's IP and user agent
    const providerIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      || request.headers.get("x-real-ip")
      || "unknown";
    const providerUa = request.headers.get("user-agent") || "unknown";

    const contract = await prisma.contractSignature.create({
      data: {
        clientId: client.id,
        token,
        contractBody,
        documentHash,
        providerSignedName: parsed.providerSignedName,
        providerSignedAt: new Date(),
        providerIpAddress: providerIp,
        providerUserAgent: providerUa,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    // Create audit log entries
    await prisma.contractAuditLog.createMany({
      data: [
        {
          contractId: contract.id,
          event: "created",
          actor: "system",
          ipAddress: providerIp,
          userAgent: providerUa,
          metadata: JSON.stringify({ documentHash }),
        },
        {
          contractId: contract.id,
          event: "provider_signed",
          actor: "provider",
          ipAddress: providerIp,
          userAgent: providerUa,
          metadata: JSON.stringify({ signedName: parsed.providerSignedName }),
        },
      ],
    });

    // Log the activity
    await prisma.activityLog.create({
      data: {
        clientId: client.id,
        actor: "chase",
        action: "contract_generated",
        details: `Contract generated and counter-signed by ${parsed.providerSignedName} for ${client.name}`,
      },
    });

    // --- Auto-create split payment links if schedule provided ---
    const paymentLinksCreated: Array<{ milestone: string; url: string; amount: number }> = [];

    if (parsed.paymentSchedule && parsed.paymentSchedule.length > 0) {
      // Calculate total one-time amount from selected packages
      const allItems = [
        ...SERVICE_PACKAGES.filter((p) => parsed.packages.includes(p.id)),
        ...ADDON_PACKAGES.filter((a) => (parsed.addons || []).includes(a.id)),
      ];
      const getPrice = (item: { id: string; price: number }) =>
        parsed.packageCustomizations?.[item.id]?.priceOverride ?? item.price;
      const oneTimeTotal = allItems.filter((i) => !i.recurring).reduce((s, i) => s + getPrice(i), 0)
        + (parsed.customItems || []).filter(i => !i.recurring).reduce((s, i) => s + i.price, 0);

      if (oneTimeTotal > 0) {
        const currency = getCurrencyForCountry(parsed.country);
        const currencyConfig = CURRENCY_CONFIG[currency];
        let latestStripeCustomerId = client.stripeCustomerId;

        for (const milestone of parsed.paymentSchedule) {
          const milestoneAmount = Math.round((oneTimeTotal * milestone.percent) / 100);
          if (milestoneAmount <= 0) continue;

          const milestoneLabel = milestone.label === "deposit" ? "Deposit"
            : milestone.label === "milestone" ? "Milestone"
            : "Completion";
          const description = `${milestoneLabel} (${milestone.percent}%) — ${client.name}`;

          const result = await createCheckoutSession({
            clientId: client.id,
            clientName: client.name,
            clientEmail: client.email,
            stripeCustomerId: latestStripeCustomerId,
            amount: milestoneAmount,
            description,
            currency,
            country: parsed.country,
            contractId: contract.id,
            milestone: milestone.label,
          });

          // Reuse the Stripe customer for subsequent milestones
          latestStripeCustomerId = result.stripeCustomerId;

          paymentLinksCreated.push({
            milestone: milestone.label,
            url: result.url,
            amount: milestoneAmount,
          });

          // Log each payment link
          await prisma.activityLog.create({
            data: {
              clientId: client.id,
              actor: "chase",
              action: "payment_link_created",
              details: `${milestoneLabel} payment link created: ${currencyConfig.symbol}${milestoneAmount.toLocaleString()} (${milestone.percent}%) for contract`,
            },
          });
        }

        // Auto-send deposit link via email (first milestone only)
        const depositLink = paymentLinksCreated.find((l) => l.milestone === "deposit");
        if (depositLink && client.email) {
          const currency = getCurrencyForCountry(parsed.country);
          const amountFormatted = new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: currency.toUpperCase(),
          }).format(depositLink.amount);

          sendPaymentLinkEmail({
            to: client.email,
            clientName: client.name,
            amount: amountFormatted,
            description: `Deposit — ${client.name}`,
            paymentUrl: depositLink.url,
            recurring: false,
            interval: null,
          }).catch((err) => console.error("[Email] Deposit payment link email error:", err));
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        id: contract.id,
        token: contract.token,
        status: contract.status,
        createdAt: contract.createdAt,
        paymentLinks: paymentLinksCreated,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: error.issues },
        { status: 400 }
      );
    }
    console.error("Contract generation error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate contract" },
      { status: 500 }
    );
  }
}

// GET — List all contracts for a client
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const contracts = await prisma.contractSignature.findMany({
      where: { clientId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        token: true,
        status: true,
        signedName: true,
        signedAt: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: contracts });
  } catch {
    return NextResponse.json(
      { success: false, error: "Failed to fetch contracts" },
      { status: 500 }
    );
  }
}
