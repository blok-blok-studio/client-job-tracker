import prisma from "@/lib/prisma";
import { notifySlack } from "@/lib/slack";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://blokblokstudio-clients.vercel.app";

/** Public signing link for a contractor agreement (short form, like /c/ and /i/). */
export function agreementUrl(token: string): string {
  return `${APP_URL}/a/${token}`;
}

/**
 * Everything that has to happen once a contractor signs an agreement.
 *
 * The important side effect is the compliance one: an e-signed IC agreement
 * satisfies the CONTRACTOR_AGREEMENT document requirement, which is what gates
 * invoice submission in the portal. Without this, a contractor could sign here
 * and still be blocked from invoicing.
 */
export async function onContractorAgreementSigned(contractId: string): Promise<void> {
  const contract = await prisma.contractorContract.findUnique({
    where: { id: contractId },
    include: { contractor: { select: { id: true, name: true, agreementSignedAt: true } } },
  });
  if (!contract) return;

  const contractor = contract.contractor;
  const isIcAgreement = contract.kind === "IC_AGREEMENT";

  if (isIcAgreement) {
    // Satisfy the inbound signed-agreement requirement (the invoice gate reads
    // status === REQUESTED as "still missing").
    const doc = await prisma.taxDocument.findFirst({
      where: {
        contractorId: contractor.id,
        direction: "INBOUND",
        type: "CONTRACTOR_AGREEMENT",
        status: "REQUESTED",
      },
      select: { id: true },
    });
    if (doc) {
      await prisma.taxDocument.update({
        where: { id: doc.id },
        data: {
          status: "RECEIVED",
          receivedAt: contract.signedAt || new Date(),
          note: `Signed electronically through the contractor portal on ${(contract.signedAt || new Date()).toLocaleDateString("en-US")} — see the agreement record for the signature certificate.`,
        },
      });
    }

    // The countersigned copy is available to them on the same link, so the
    // outbound "send them their copy" row is satisfied too.
    const copyDoc = await prisma.taxDocument.findFirst({
      where: {
        contractorId: contractor.id,
        direction: "OUTBOUND",
        type: "COUNTERSIGNED_AGREEMENT",
        status: "REQUESTED",
      },
      select: { id: true },
    });
    if (copyDoc) {
      await prisma.taxDocument.update({
        where: { id: copyDoc.id },
        data: {
          status: "SENT",
          note: "Fully signed copy is downloadable by the contractor from their portal (Contracts tab).",
        },
      });
    }

    // Lifecycle sequence I keys off agreementSignedAt
    if (!contractor.agreementSignedAt) {
      await prisma.contractor.update({
        where: { id: contractor.id },
        data: { agreementSignedAt: contract.signedAt || new Date() },
      });
      const { onContractorChanged } = await import("@/lib/lifecycle/engine");
      await onContractorChanged(contractor.id, null, "system").catch((err) =>
        console.error("[ContractorContract] onContractorChanged failed:", err)
      );
    }
  }

  await prisma.activityLog.create({
    data: {
      actor: "contractor",
      action: "contractor_contract_signed",
      details: `${contractor.name} signed "${contract.title}"${contract.signedName ? ` as ${contract.signedName}` : ""}`,
    },
  });

  await notifySlack(
    `:handshake: *${contractor.name}* signed *${contract.title}*${
      isIcAgreement ? " — invoicing is now unlocked for them" : ""
    }\n${APP_URL}/contractors?contract=${contract.id}`
  ).catch(() => {});
}
