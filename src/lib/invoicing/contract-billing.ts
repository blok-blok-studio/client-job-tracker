import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { createDraft, issueInvoice, sendIssuedInvoice, CLIENT_BILLING_SELECT, logInvoiceActivity } from "./service";
import { createPlan, firstRunAt } from "./recurring";
import { clientToBillTo } from "./view";
import { addDays, parseDateOnly } from "./money";
import { defaultsForTemplate, templateForCountry } from "./vat";
import { loadInvoiceSettings } from "./settings";
import { notifyUser } from "@/lib/notifications";
import { markReadyForReview } from "./ready";

/**
 * Contracts bill by bank transfer. Sending a contract prepares the paperwork:
 * one draft invoice per payment milestone and a paused plan per monthly item.
 * Nothing is numbered yet, because an invoice issued for an unsigned contract
 * would need a Storno if the client walks away. Signing issues and emails the
 * first milestone and starts the plans. Later milestones stay drafts for the
 * owner to issue when the work is done.
 */
export interface ContractBillingInput {
  contractId: string;
  clientId: string;
  clientName: string;
  country: string;
  currency: string; // ISO, upper case
  milestones: Array<{ label: string; title: string; percent: number; amount: number }>;
  recurring: Array<{ name: string; price: number }>;
}

export interface PreparedLine {
  milestone: string;
  url: string; // no pay link exists until the invoice is issued
  amount: number;
}

export async function prepareContractBilling(input: ContractBillingInput, actor: string): Promise<PreparedLine[]> {
  const [existing, existingPlans] = await Promise.all([
    prisma.studioInvoice.count({ where: { contractId: input.contractId } }),
    prisma.recurringPlan.count({ where: { contractId: input.contractId } }),
  ]);
  if (existing || existingPlans) return []; // a re-send never duplicates the drafts
  const template = templateForCountry(input.country);
  const { language } = defaultsForTemplate(template);
  const out: PreparedLine[] = [];
  for (const m of input.milestones) {
    if (m.amount <= 0) continue;
    const { invoice } = await createDraft(
      {
        clientId: input.clientId,
        template,
        language,
        currency: input.currency,
        items: [{ description: `${m.title} (${m.percent}%)`, qty: 1, unitPrice: m.amount }],
        internalNote: `From the service agreement, milestone: ${m.label}`,
      },
      actor
    );
    await prisma.studioInvoice.update({ where: { id: invoice.id }, data: { contractId: input.contractId, milestone: m.label } });
    out.push({ milestone: m.label, url: "", amount: m.amount });
  }
  const today = new Date().toISOString().slice(0, 10);
  for (const r of input.recurring) {
    if (r.price <= 0) continue;
    const plan = await createPlan(
      {
        clientId: input.clientId,
        name: r.name,
        interval: "MONTHLY",
        dayOfMonth: Math.min(new Date().getUTCDate(), 28),
        startDate: today,
        template,
        language,
        currency: input.currency,
        dueDays: 14,
        items: [{ description: `${r.name}, {month}`, qty: 1, unitPrice: r.price }],
        autoSend: true,
        paymentMethod: "BANK",
      },
      actor
    );
    await prisma.recurringPlan.update({ where: { id: plan.id }, data: { contractId: input.contractId, status: "PAUSED" } });
    out.push({ milestone: "subscription", url: "", amount: r.price });
  }
  return out;
}

async function pingOwners(clientId: string, title: string, body: string, link: string) {
  const owners = await prisma.user.findMany({ where: { role: "OWNER", isActive: true }, select: { id: true } });
  for (const o of owners) await notifyUser({ userId: o.id, type: "connection_problem", title, body, link, clientId }).catch(() => {});
}

/** Client signed: prepare the first milestone for the owner's yes (or issue + email it when approval is switched off), start the plans. Never throws into the signing flow. */
export async function activateContractBilling(contractId: string): Promise<void> {
  const contract = await prisma.contractSignature.findUnique({ where: { id: contractId }, select: { clientId: true, selectedPackages: true } });
  if (!contract) return;
  const first = (await prisma.studioInvoice.findMany({ where: { contractId, status: "DRAFT" }, orderBy: { createdAt: "asc" }, take: 1 }))[0];
  const client = await prisma.client.findUnique({ where: { id: contract.clientId }, select: CLIENT_BILLING_SELECT });
  if (first && client) {
    const billTo = clientToBillTo(client);
    const today = parseDateOnly(new Date().toISOString())!;
    // The client may have added their address since the contract went out
    await prisma.studioInvoice.update({
      where: { id: first.id },
      data: { billTo: billTo as unknown as Prisma.InputJsonValue, issueDate: today, dueDate: addDays(today, first.dueDays) },
    });
    const settings = await loadInvoiceSettings();
    if (settings.approveBeforeSend) {
      // Stop before anything is numbered or emailed: the owner reviews and sends
      await markReadyForReview(first.id, `${client.name} signed the contract, so the first invoice is prepared.${billTo.addressLines.length ? "" : " Their address is missing: add it under Bill to before issuing."}`);
    } else if (!billTo.addressLines.length) {
      await pingOwners(client.id, `Deposit invoice needs ${client.name}'s address`, "The contract is signed, but an invoice needs the client's full address. Add it under Bill to, then issue the draft.", `/invoices?invoice=${first.id}`);
    } else {
      try {
        const issued = await issueInvoice(first.id, "contract signing");
        const sent = settings.autoSendOnIssue ? await sendIssuedInvoice(first.id, "contract signing") : { sent: false, error: "auto-send is off" };
        if (!sent.sent) await pingOwners(client.id, `Invoice ${issued.number} was not emailed`, sent.error || "Send it from the Invoices page.", `/invoices?invoice=${first.id}`);
      } catch (err) {
        const why = err instanceof Error ? err.message : "unknown error";
        await logInvoiceActivity({ clientId: client.id, actor: "system", action: "invoice_issue_failed", details: `Deposit invoice not issued after signing: ${why}` });
        await pingOwners(client.id, `Deposit invoice for ${client.name} was not issued`, why, `/invoices?invoice=${first.id}`);
      }
    }
  }
  const plans = await prisma.recurringPlan.findMany({ where: { contractId, status: "PAUSED" } });
  for (const p of plans) {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    await prisma.recurringPlan.update({ where: { id: p.id }, data: { status: "ACTIVE", startDate: start, nextRunAt: firstRunAt(start, p.dayOfMonth) } });
  }
}

/** Contract expired or deleted: drop what was only ever prepared for it. */
export async function cancelContractBilling(contractIds: string[]): Promise<void> {
  if (!contractIds.length) return;
  await prisma.studioInvoice.deleteMany({ where: { contractId: { in: contractIds }, status: "DRAFT" } });
  await prisma.recurringPlan.updateMany({ where: { contractId: { in: contractIds }, status: "PAUSED", runs: 0 }, data: { status: "ENDED" } });
}
