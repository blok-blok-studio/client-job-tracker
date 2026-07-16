import { NextResponse } from "next/server";
import type Stripe from "stripe";
import prisma from "@/lib/prisma";
import { getStripe } from "@/lib/stripe";
import { getSession } from "@/lib/auth";

export const maxDuration = 300;

// POST — pull every Stripe customer (and their paid invoices) into the
// command center. Safe to re-run: matches by stripeCustomerId, then email;
// invoices dedupe on stripeInvoiceId. Owner only.
export async function POST() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.role !== "OWNER")
    return NextResponse.json({ error: "Only owners can run a Stripe sync" }, { status: 403 });

  const stripe = getStripe();
  let customersSeen = 0;
  let clientsCreated = 0;
  let clientsLinked = 0;
  let invoicesImported = 0;
  const errors: string[] = [];

  try {
    // ── Customers ──
    for await (const customer of stripe.customers.list({ limit: 100 })) {
      customersSeen++;
      if (customer.deleted) continue;

      try {
        // Already linked?
        let client = await prisma.client.findUnique({ where: { stripeCustomerId: customer.id } });

        // Match by email (case-insensitive)
        if (!client && customer.email) {
          client = await prisma.client.findFirst({
            where: { email: { equals: customer.email, mode: "insensitive" } },
          });
          if (client && !client.stripeCustomerId) {
            await prisma.client.update({
              where: { id: client.id },
              data: {
                stripeCustomerId: customer.id,
                phone: client.phone || customer.phone || null,
              },
            });
            clientsLinked++;
          }
        }

        // Brand new — create the client
        if (!client) {
          if (!customer.email && !customer.name) continue; // nothing to identify them by
          client = await prisma.client.create({
            data: {
              name: customer.name || customer.email || "Stripe customer",
              email: customer.email?.toLowerCase() || null,
              phone: customer.phone || null,
              stripeCustomerId: customer.id,
              source: "Stripe",
              type: "ACTIVE",
            },
          });
          await prisma.activityLog.create({
            data: {
              clientId: client.id,
              actor: "stripe",
              action: "created_client",
              details: "Imported from Stripe customer sync",
            },
          });
          clientsCreated++;
        }

        // ── Paid invoices for this customer ──
        const invoices = await stripe.invoices.list({ customer: customer.id, status: "paid", limit: 100 });
        for (const inv of invoices.data as Stripe.Invoice[]) {
          if (!inv.id || !inv.amount_paid) continue;
          const exists = await prisma.invoice.findUnique({ where: { stripeInvoiceId: inv.id } });
          if (exists) continue;
          await prisma.invoice.create({
            data: {
              clientId: client.id,
              amount: inv.amount_paid / 100,
              currency: (inv.currency || "usd").toUpperCase(),
              status: "PAID",
              paidAt: inv.status_transitions?.paid_at
                ? new Date(inv.status_transitions.paid_at * 1000)
                : new Date(inv.created * 1000),
              notes: inv.description || (inv.number ? `Stripe invoice ${inv.number}` : "Imported from Stripe"),
              stripeInvoiceId: inv.id,
              stripeInvoiceUrl: inv.hosted_invoice_url || null,
            },
          });
          invoicesImported++;
        }
      } catch (err) {
        errors.push(`${customer.email || customer.id}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }

    return NextResponse.json({
      success: true,
      data: { customersSeen, clientsCreated, clientsLinked, invoicesImported, errors: errors.slice(0, 5) },
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 }
    );
  }
}
