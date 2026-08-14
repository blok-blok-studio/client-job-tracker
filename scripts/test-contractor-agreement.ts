/**
 * End-to-end smoke test for contractor agreements.
 *
 * Creates a throwaway contractor, drafts an agreement through the real API,
 * releases it, signs it through the public token route, and checks that the
 * compliance gate opened. Cleans everything up at the end.
 *
 * Run against a local dev server:
 *   SLACK_WEBHOOK_URL= RESEND_API_KEY= npm run dev
 *   npx tsx scripts/test-contractor-agreement.ts
 */
import prisma from "../src/lib/prisma";
import { createSessionToken } from "../src/lib/auth";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
const NAME = "ZZ Agreement Smoke Test";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, extra?: unknown) {
  if (ok) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`, extra ?? "");
  }
}

async function main() {
  // Clean up anything left behind by an earlier run
  await prisma.contractor.deleteMany({ where: { name: NAME } });

  const owner = await prisma.user.findFirst({ where: { role: "OWNER" } });
  if (!owner) throw new Error("No OWNER user found to mint a session for");
  const cookie = `bb_session=${createSessionToken({
    id: owner.id,
    email: owner.email,
    name: owner.name,
    role: owner.role,
  })}`;

  console.log("\n1. Create the contractor (US, so W-9 + agreement are required)");
  const createRes = await fetch(`${BASE}/api/contractors`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ name: NAME, country: "US" }),
  });
  const created = await createRes.json();
  check("contractor created", createRes.ok && created.success, created);
  const contractorId: string = created.data.id;
  const uploadToken: string = created.data.uploadToken;

  const docsBefore = await prisma.taxDocument.findMany({ where: { contractorId } });
  check(
    "agreement document requested at onboarding",
    docsBefore.some((d) => d.type === "CONTRACTOR_AGREEMENT" && d.status === "REQUESTED")
  );

  console.log("\n2. Invoice submission is blocked before anything is signed");
  const gate = await fetch(`${BASE}/api/contractor/${uploadToken}`);
  const gateJson = await gate.json();
  check("portal reports missing paperwork", (gateJson.data?.missingDocs || []).length > 0, gateJson.data);

  console.log("\n3. Draft an agreement (baseline template, no AI)");
  const draftRes = await fetch(`${BASE}/api/contractors/contracts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      contractorId,
      kind: "IC_AGREEMENT",
      services: "Test services for the smoke test.",
      compensation: "$50 per hour",
      paymentDays: 15,
      providerSignedName: "Smoke Test Provider",
      contractorAddress: "1 Test Street, Austin, TX",
      saveProviderDetails: false,
      draft: true,
    }),
  });
  const draft = await draftRes.json();
  check("draft created", draftRes.ok && draft.success, draft);
  const contractId: string = draft.data.id;
  const token: string = draft.data.token;
  const body: string = draft.data.contractBody;

  check("present-tense IP assignment present", /irrevocably ASSIGNS/i.test(body));
  check("classification section present", /INDEPENDENT CONTRACTOR STATUS/i.test(body));
  check("payment window inside 30 days", /within 15 days/.test(body));
  check("signature block present", /ACKNOWLEDGMENT AND ACCEPTANCE/.test(body));

  console.log("\n4. A draft link must not resolve publicly");
  const draftPublic = await fetch(`${BASE}/api/agreement/${token}`);
  check("draft token returns 404", draftPublic.status === 404, draftPublic.status);

  console.log("\n5. Release it for signing");
  const sendRes = await fetch(`${BASE}/api/contractors/contracts/${contractId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ action: "send" }),
  });
  check("released", sendRes.ok && (await sendRes.json()).success);

  const publicRes = await fetch(`${BASE}/api/agreement/${token}`);
  const publicJson = await publicRes.json();
  check("public link now loads", publicRes.ok && publicJson.success, publicJson);
  check("counter-signature is visible to the contractor", publicJson.data?.providerSignedName === "Smoke Test Provider");

  console.log("\n6. Tamper detection");
  await prisma.contractorContract.update({
    where: { id: contractId },
    data: { contractBody: body + "\nSNEAKY EXTRA CLAUSE" },
  });
  const tampered = await fetch(`${BASE}/api/agreement/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedName: "Test Contractor" }),
  });
  check("altered document is refused at signing (409)", tampered.status === 409, tampered.status);
  await prisma.contractorContract.update({ where: { id: contractId }, data: { contractBody: body } });

  console.log("\n7. Sign it");
  const signRes = await fetch(`${BASE}/api/agreement/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedName: "Test Contractor" }),
  });
  const signJson = await signRes.json();
  check("signed", signRes.ok && signJson.success, signJson);

  const signedRow = await prisma.contractorContract.findUnique({ where: { id: contractId } });
  check("status is SIGNED", signedRow?.status === "SIGNED");
  check("signed hash recorded", !!signedRow?.signedDocumentHash);
  check("signing IP recorded", !!signedRow?.ipAddress);

  const secondSign = await fetch(`${BASE}/api/agreement/${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedName: "Someone Else" }),
  });
  check("cannot be signed twice", secondSign.status === 400, secondSign.status);

  console.log("\n8. Compliance side effects");
  const docsAfter = await prisma.taxDocument.findMany({ where: { contractorId } });
  check(
    "agreement document marked received",
    docsAfter.some((d) => d.type === "CONTRACTOR_AGREEMENT" && d.status === "RECEIVED")
  );
  check(
    "countersigned copy marked sent",
    docsAfter.some((d) => d.type === "COUNTERSIGNED_AGREEMENT" && d.status === "SENT")
  );
  const c = await prisma.contractor.findUnique({ where: { id: contractorId } });
  check("agreementSignedAt stamped", !!c?.agreementSignedAt);

  const gate2 = await fetch(`${BASE}/api/contractor/${uploadToken}`);
  const gate2Json = await gate2.json();
  check(
    "only the W-9 still blocks invoicing",
    (gate2Json.data?.missingDocs || []).every((d: string) => /W-9/.test(d)),
    gate2Json.data?.missingDocs
  );

  console.log("\n9. Portal + documents");
  const portalContracts = await fetch(`${BASE}/api/contractor/${uploadToken}/contracts`);
  const portalJson = await portalContracts.json();
  check("agreement listed in the contractor portal", portalJson.data?.contracts?.length === 1, portalJson.data);

  const pdf = await fetch(`${BASE}/api/agreement/${token}/pdf`);
  const pdfBuf = Buffer.from(await pdf.arrayBuffer());
  check("PDF renders", pdf.ok && pdfBuf.subarray(0, 4).toString() === "%PDF", `${pdf.status} ${pdfBuf.length} bytes`);

  const cert = await fetch(`${BASE}/api/agreement/${token}/certificate`);
  const certJson = await cert.json();
  check(
    "certificate carries the full audit trail",
    cert.ok && certJson.data?.auditTrail?.some((e: { event: string }) => e.event === "contractor_signed"),
    certJson.data?.auditTrail?.map((e: { event: string }) => e.event)
  );

  console.log("\n10. Signed agreements are permanent");
  const del = await fetch(`${BASE}/api/contractors/contracts/${contractId}`, { method: "DELETE", headers: { cookie } });
  check("delete refused for a signed agreement", del.status === 400, del.status);
  const void_ = await fetch(`${BASE}/api/contractors/contracts/${contractId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ action: "void" }),
  });
  check("void refused for a signed agreement", void_.status === 400, void_.status);

  console.log("\n11. Profile fields");
  const profileRes = await fetch(`${BASE}/api/contractors/${contractorId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      role: "Test Editor",
      skills: ["Premiere", "After Effects"],
      accentColor: "#22c55e",
      emoji: "🎬",
      funFact: "Only edits at night",
      startedAt: "2026-01-15",
    }),
  });
  check("profile saved", profileRes.ok && (await profileRes.json()).success);
  const getProfile = await fetch(`${BASE}/api/contractors/${contractorId}`, { headers: { cookie } });
  const profile = await getProfile.json();
  check("profile GET returns contracts + docs", profile.data?.contracts?.length === 1 && profile.data?.taxDocuments?.length > 0);
  check("skills round-tripped", profile.data?.skills?.length === 2, profile.data?.skills);

  const badColor = await fetch(`${BASE}/api/contractors/${contractorId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ accentColor: "not-a-colour" }),
  });
  check("invalid accent colour rejected", badColor.status === 400, badColor.status);

  console.log("\n12. Profile photo (portal side, token-scoped)");
  const goodBlob = "https://teststore123.public.blob.vercel-storage.com/contractor-avatars/x.jpg";
  const avatarRes = await fetch(`${BASE}/api/contractor/${uploadToken}/avatar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blobUrl: goodBlob }),
  });
  check("contractor can set their own photo", avatarRes.ok && (await avatarRes.json()).success);
  const withAvatar = await prisma.contractor.findUnique({ where: { id: contractorId } });
  check("avatar stored + timestamped", withAvatar?.avatarUrl === goodBlob && !!withAvatar?.avatarUpdatedAt);

  const badHost = await fetch(`${BASE}/api/contractor/${uploadToken}/avatar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blobUrl: "https://evil.example.com/x.jpg" }),
  });
  check("photo from a non-blob host refused", badHost.status === 400, badHost.status);

  const badToken = await fetch(`${BASE}/api/contractor/notarealtokenatall/avatar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ blobUrl: goodBlob }),
  });
  check("photo upload needs a valid portal token", badToken.status === 404, badToken.status);

  const portalMe = await fetch(`${BASE}/api/contractor/${uploadToken}`);
  check("portal returns the photo", (await portalMe.json()).data?.contractor?.avatarUrl === goodBlob);

  console.log("\n13. Draft handling: expiry starts at release, email needs release");
  const draft2Res = await fetch(`${BASE}/api/contractors/contracts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      contractorId,
      kind: "NDA",
      providerSignedName: "Smoke Test Provider",
      saveProviderDetails: false,
      expiresInDays: 10,
      draft: true,
    }),
  });
  const draft2 = await draft2Res.json();
  check("NDA draft created", draft2Res.ok && draft2.success, draft2);
  check("NDA body is a mutual NDA", /MUTUAL NON-DISCLOSURE AGREEMENT/.test(draft2.data.contractBody));

  const emailDraft = await fetch(`${BASE}/api/contractors/contracts/${draft2.data.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ action: "email" }),
  });
  check("emailing an unreleased draft is refused", emailDraft.status === 400, emailDraft.status);

  // Backdate the draft as if it had sat around for a month
  await prisma.contractorContract.update({
    where: { id: draft2.data.id },
    data: { createdAt: new Date(Date.now() - 40 * 864e5), expiresAt: new Date(Date.now() - 30 * 864e5) },
  });
  await fetch(`${BASE}/api/contractors/contracts/${draft2.data.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ action: "send" }),
  });
  const released = await prisma.contractorContract.findUnique({ where: { id: draft2.data.id } });
  check(
    "released draft gets a fresh signing window",
    !!released?.expiresAt && released.expiresAt.getTime() > Date.now(),
    released?.expiresAt
  );
  const staleCheck = await fetch(`${BASE}/api/agreement/${released!.token}`);
  check("stale draft link works after release", staleCheck.ok, staleCheck.status);

  console.log("\n14. Voiding, and SOW generation");
  const voidRes = await fetch(`${BASE}/api/contractors/contracts/${draft2.data.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ action: "void" }),
  });
  check("void succeeds on an unsigned agreement", voidRes.ok && (await voidRes.json()).success);
  const voided = await fetch(`${BASE}/api/agreement/${released!.token}`);
  check("voided link stops working (410)", voided.status === 410, voided.status);
  const voidedSign = await fetch(`${BASE}/api/agreement/${released!.token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedName: "Too Late" }),
  });
  check("voided agreement cannot be signed", voidedSign.status === 410, voidedSign.status);

  const sowRes = await fetch(`${BASE}/api/contractors/contracts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      contractorId,
      kind: "SOW",
      services: "One landing page build.",
      compensation: "$1,500 flat",
      providerSignedName: "Smoke Test Provider",
      saveProviderDetails: false,
      draft: true,
    }),
  });
  const sow = await sowRes.json();
  check("SOW created and references the IC agreement", /STATEMENT OF WORK/.test(sow.data.contractBody) && /Independent Contractor Agreement/.test(sow.data.contractBody));

  console.log("\n15. Records survive contractor deletion attempts");
  const delContractor = await fetch(`${BASE}/api/contractors/${contractorId}`, {
    method: "DELETE",
    headers: { cookie },
  });
  check("contractor with agreements cannot be deleted", delContractor.status === 400, delContractor.status);
  const delDraft = await fetch(`${BASE}/api/contractors/contracts/${sow.data.id}`, {
    method: "DELETE",
    headers: { cookie },
  });
  check("unsent draft can still be deleted", delDraft.ok && (await delDraft.json()).success);

  console.log("\n16. Liability language is conspicuous (Texas express-negligence)");
  const usBody: string = body;
  check(
    "US cap is in capitals with express negligence language",
    /EACH PARTY'S TOTAL LIABILITY[\s\S]*OWN NEGLIGENCE[\s\S]*LIMITED TO THE TOTAL FEES/.test(usBody)
  );

  console.log("\n17. EUR amounts survive the PDF font (pdf-lib draws € over the next character)");
  {
    const { renderContractPdf } = await import("../src/lib/contract-pdf");
    const bytes = await renderContractPdf({
      documentLabel: "Independent Contractor Agreement",
      counterpartyLabel: "EUR Test",
      counterpartyRole: "Contractor",
      contractBody: "SECTION 1. FEES\n\nThe rate is €60 per hour.\n\nTotal    €12,150 EUR\n",
      providerSignedName: "Provider",
      providerSignatureData: null,
      providerSignedAt: new Date(),
      signedName: null,
      signatureData: null,
      signedAt: null,
      documentHash: null,
      signedDocumentHash: null,
    });
    const text = Buffer.from(bytes).toString("latin1");
    check("no raw euro sign reaches the PDF text layer", !/\(\s*[^)]*€/.test(text));
    check("PDF still renders with EUR amounts", Buffer.from(bytes).subarray(0, 4).toString() === "%PDF");
  }

  if (process.env.RUN_AI === "1") {
    console.log("\n18. AI drafting keeps the protected clauses (RUN_AI=1)");
    const { generateContractorAgreementBody } = await import("../src/lib/contractor-agreement");
    const { generateAiContractorAgreementBody } = await import("../src/lib/contract-ai");
    const baseline = generateContractorAgreementBody("IC_AGREEMENT", {
      contractorName: "Jane Doe",
      country: "US",
      services: "Video editing.",
      compensation: "$65 per hour",
    });
    const ai = await generateAiContractorAgreementBody({
      baselineBody: baseline,
      customPrompt:
        "Warmer, plainer tone. Add a numbered section titled EQUIPMENT requiring return of studio-owned equipment within seven days of the end of an engagement.",
      contractorName: "Jane Doe",
      companyName: null,
      country: "US",
      documentType: "Independent Contractor Agreement",
    });
    const b = ai.body;
    check("AI actually ran", ai.usedAi, ai.error);
    check("present-tense IP assignment survived", /irrevocably ASSIGNS to the Provider/.test(b));
    check("conspicuous cap survived", /TOTAL LIABILITY[\s\S]{0,200}LIMITED TO THE TOTAL FEES/.test(b));
    check("express negligence survived", /OWN NEGLIGENCE/.test(b));
    check("signature block survived", /ACKNOWLEDGMENT AND ACCEPTANCE/.test(b) && /CONTRACTOR:/.test(b));
    check("requested section was added", /SECTION \d+\. EQUIPMENT/i.test(b));
    check("payment window not stretched past 30 days", !/within (3[1-9]|[4-9]\d) days/.test(b));
  } else {
    console.log("\n18. AI drafting — skipped (set RUN_AI=1 to include a live model call)");
  }

  console.log("\nCleaning up…");
  await prisma.contractor.delete({ where: { id: contractorId } });
  await prisma.activityLog.deleteMany({ where: { details: { contains: NAME } } });

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.contractor.deleteMany({ where: { name: NAME } });
  process.exit(1);
});
