/**
 * Draft editing + "Edit a copy" checks. Run against a THROWAWAY database only:
 *   DATABASE_URL=postgresql://postgres@127.0.0.1:<port>/<db> ANTHROPIC_API_KEY= npx tsx scripts/test-contract-edit.ts
 * Refuses to run against anything but localhost. No AI key: covers the offline paths
 * (hand edits, copy, guards, the AI-unavailable error).
 */
import { createHash } from "crypto";
import prisma from "@/lib/prisma";
import { editDraftContract, copyContractAsDraft, ContractEditError } from "@/lib/contract-edit";

if (!/127\.0\.0\.1|localhost/.test(process.env.DATABASE_URL || "")) {
  console.error("Refusing: DATABASE_URL is not local");
  process.exit(1);
}

let failed = 0;
const ok = (cond: unknown, label: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) failed++;
};
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
async function rejects(p: Promise<unknown>, status: number, label: string) {
  try { await p; ok(false, label); } catch (e) { ok(e instanceof ContractEditError && e.status === status, `${label} (${e instanceof ContractEditError ? e.status : String(e)})`); }
}

async function main() {
  const client = await prisma.client.create({ data: { name: "Test Client", email: "t@example.com" } as never });
  const body = "SERVICE AGREEMENT\n\nFee: $5,000. 50% deposit.\n\nPROVIDER / CLIENT";
  const mk = (status: "DRAFT" | "PENDING" | "SIGNED") =>
    prisma.contractSignature.create({
      data: {
        clientId: client.id, token: `t-${status}-${Date.now()}`, contractBody: body, documentHash: sha(body), status,
        providerSignedName: "Chase Haynes", providerSignatureData: "data:image/png;base64,AAA", providerSignedAt: new Date(0),
        selectedPackages: { packages: [], customItems: [{ name: "Website", price: 5000 }], billingCurrency: "USD", billingSource: "ai", paymentSchedule: null, skipPayment: false },
      },
    });
  const draft = await mk("DRAFT");
  const pending = await mk("PENDING");
  const signed = await mk("SIGNED");

  // Hand edit
  const newBody = body.replace("$5,000", "$6,000");
  const r = await editDraftContract({ clientId: client.id, contractId: draft.id, body: newBody, editedBy: "chase@test", ipAddress: "1.2.3.4", userAgent: "ua" });
  const after = await prisma.contractSignature.findUniqueOrThrow({ where: { id: draft.id } });
  ok(after.contractBody === newBody && r.contractBody === newBody, "hand edit saves the new text");
  ok(after.documentHash === sha(newBody), "hash matches the new text");
  ok(after.token === draft.token && after.status === "DRAFT", "same draft, same link, still a draft");
  ok(after.providerSignedAt! > new Date(0) && after.providerIpAddress === "1.2.3.4", "counter-signature re-stamped on the new version");
  const audit = await prisma.contractAuditLog.findMany({ where: { contractId: draft.id } });
  ok(audit.some((a) => a.event === "edited" && a.metadata?.includes(sha(body)) && a.metadata.includes(sha(newBody))), "audit 'edited' records old + new hash");
  ok(audit.some((a) => a.event === "provider_signed" && a.metadata?.includes(sha(newBody))), "audit provider_signed on the new hash");
  ok(!!r.billingError && JSON.stringify(after.selectedPackages).includes("5000"), "fee re-read failure keeps old fees and warns");

  await rejects(editDraftContract({ clientId: client.id, contractId: draft.id, body: newBody, editedBy: "x" }), 400, "no-op edit refused");
  await rejects(editDraftContract({ clientId: client.id, contractId: draft.id, body: "   ", editedBy: "x" }), 400, "empty text refused");
  await rejects(editDraftContract({ clientId: client.id, contractId: pending.id, body: "x", editedBy: "x" }), 409, "sent contract can't be edited");
  await rejects(editDraftContract({ clientId: client.id, contractId: signed.id, body: "x", editedBy: "x" }), 409, "signed contract can't be edited");
  await rejects(editDraftContract({ clientId: "other", contractId: draft.id, body: "x", editedBy: "x" }), 404, "other client's id refused");
  await rejects(editDraftContract({ clientId: client.id, contractId: draft.id, instructions: "raise the fee", editedBy: "x" }), 502, "AI unavailable: clear error, draft untouched");
  ok((await prisma.contractSignature.findUniqueOrThrow({ where: { id: draft.id } })).contractBody === newBody, "draft unchanged after failed AI edit");

  // Copy
  const signedBefore = await prisma.contractSignature.findUniqueOrThrow({ where: { id: signed.id } });
  const c = await copyContractAsDraft({ clientId: client.id, contractId: signed.id, editedBy: "chase@test", ipAddress: "5.6.7.8" });
  const copy = await prisma.contractSignature.findUniqueOrThrow({ where: { id: c.id } });
  ok(copy.status === "DRAFT" && copy.id !== signed.id && copy.token !== signed.token, "copy is a new draft with its own link");
  ok(copy.contractBody === signed.contractBody && copy.documentHash === sha(copy.contractBody), "copy carries the text + correct hash");
  ok(copy.providerSignatureData === signed.providerSignatureData && copy.providerIpAddress === "5.6.7.8", "copy keeps the signature, stamps this request");
  ok(c.billing?.currency === "USD", "copy keeps the fees");
  const signedAfter = await prisma.contractSignature.findUniqueOrThrow({ where: { id: signed.id } });
  ok(JSON.stringify(signedAfter) === JSON.stringify(signedBefore), "original signed contract untouched");
  ok((await prisma.contractAuditLog.findMany({ where: { contractId: copy.id } })).some((a) => a.metadata?.includes(signed.id)), "copy audit names the source");
  await editDraftContract({ clientId: client.id, contractId: copy.id, body: copy.contractBody + "\n\nExtra clause.", editedBy: "x" });
  ok((await prisma.contractSignature.findUniqueOrThrow({ where: { id: copy.id } })).contractBody.endsWith("Extra clause."), "the copy is editable");
  await rejects(copyContractAsDraft({ clientId: "other", contractId: signed.id, editedBy: "x" }), 404, "can't copy another client's contract");

  console.log(failed ? `\n${failed} FAILED` : "\nAll passed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
