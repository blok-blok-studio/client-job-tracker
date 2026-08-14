/**
 * Smoke test for two fixes:
 *  1. Member tab access — the Team page's toggles and the API's allow-list are
 *     one list now, so granting Services/Deliverables no longer 400s.
 *  2. Contractor onboarding email — adding a contractor sends their portal
 *     link, and an unconfigured mailer is reported rather than claimed as sent.
 *
 * Run against a local dev server:
 *   npm run dev
 *   npx tsx scripts/test-team-access-and-onboarding.ts
 *
 * With RESEND_API_KEY unset on the server, the email checks assert the honest
 * failure path; with it set they assert a real send.
 */
import prisma from "../src/lib/prisma";
import { createSessionToken } from "../src/lib/auth";
import { PAGE_OPTIONS, VALID_PAGES } from "../src/lib/page-access";

const BASE = process.env.TEST_BASE_URL || "http://localhost:3000";
const USER_EMAIL = "zz-access-test@blokblokstudio.test";
const CONTRACTOR_NAME = "ZZ Onboarding Test";

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
  await prisma.user.deleteMany({ where: { email: USER_EMAIL } });
  await prisma.contractor.deleteMany({ where: { name: CONTRACTOR_NAME } });

  const owner = await prisma.user.findFirst({ where: { role: "OWNER" } });
  if (!owner) throw new Error("No OWNER user found to mint a session for");
  const cookie = `bb_session=${createSessionToken({
    id: owner.id,
    email: owner.email,
    name: owner.name,
    role: owner.role,
  })}`;

  console.log("\n1. Every tab the Team page offers is one the API accepts");
  check("no toggle is missing from the allow-list", PAGE_OPTIONS.every((p) => VALID_PAGES.includes(p.key)));
  check("Services is grantable (used to 400)", VALID_PAGES.includes("services"));
  check("Deliverables is grantable (used to 400)", VALID_PAGES.includes("deliverables"));
  check("Contracts is grantable", VALID_PAGES.includes("contracts"));
  check("Automations is grantable", VALID_PAGES.includes("automations"));

  console.log("\n2. Granting access through the API");
  const createUser = await fetch(`${BASE}/api/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      name: "ZZ Access Test",
      email: USER_EMAIL,
      password: "temp-password-123",
      role: "MEMBER",
    }),
  });
  const userJson = await createUser.json();
  check("test member created", createUser.ok, userJson);
  const userId: string = userJson.user?.id || userJson.id;

  const grantAll = await fetch(`${BASE}/api/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ allowedPages: VALID_PAGES }),
  });
  check("every listed tab can be granted at once", grantAll.ok, await grantAll.clone().text());

  const grantPair = await fetch(`${BASE}/api/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ allowedPages: ["services", "deliverables"] }),
  });
  check("Services + Deliverables specifically (the reported bug)", grantPair.ok, await grantPair.clone().text());
  const saved = await prisma.user.findUnique({ where: { id: userId }, select: { allowedPages: true } });
  check("selection is stored", saved?.allowedPages.join(",") === "services,deliverables", saved?.allowedPages);

  const bogus = await fetch(`${BASE}/api/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ allowedPages: ["services", "not-a-page"] }),
  });
  check("an unknown page is still rejected", bogus.status === 400, bogus.status);

  const cleared = await fetch(`${BASE}/api/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ allowedPages: [] }),
  });
  check("clearing the list restores full access", cleared.ok);

  await fetch(`${BASE}/api/users/${userId}`, { method: "DELETE", headers: { cookie } });

  console.log("\n3. Contractor onboarding email");
  const mailerConfigured = !!process.env.SERVER_HAS_RESEND;
  const addRes = await fetch(`${BASE}/api/contractors`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      name: CONTRACTOR_NAME,
      email: "zz-onboarding@blokblokstudio.test",
      country: "US",
    }),
  });
  const added = await addRes.json();
  check("contractor created", addRes.ok && added.success, added);
  const contractorId: string = added.data.id;

  if (mailerConfigured) {
    check("welcome email sent automatically", added.emailed === true, added.emailError);
  } else {
    check("unsent email is reported, not claimed", added.emailed === false && !!added.emailError, added);
    check(
      "the reason names the missing config",
      /RESEND_API_KEY/.test(added.emailError || ""),
      added.emailError
    );
  }

  const noEmailRes = await fetch(`${BASE}/api/contractors`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ name: CONTRACTOR_NAME + " 2" }),
  });
  const noEmail = await noEmailRes.json();
  check("contractor without an address is flagged, not silently skipped", !!noEmail.emailError, noEmail);

  const optOutRes = await fetch(`${BASE}/api/contractors`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({
      name: CONTRACTOR_NAME + " 3",
      email: "zz-optout@blokblokstudio.test",
      sendWelcomeEmail: false,
    }),
  });
  const optOut = await optOutRes.json();
  check("opting out sends nothing and reports nothing", !optOut.emailed && !optOut.emailError, optOut);

  console.log("\n4. Re-sending the link to someone already added (the Yahya case)");
  const resend = await fetch(`${BASE}/api/contractors/${contractorId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie },
    body: JSON.stringify({ sendPortalEmail: true }),
  });
  const resendJson = await resend.json();
  check("resend endpoint responds", resend.ok && resendJson.success, resendJson);
  if (mailerConfigured) {
    check("link re-sent", resendJson.emailed === true, resendJson.emailError);
  } else {
    check("resend reports the mailer problem", !!resendJson.emailError, resendJson);
  }

  const logged = await prisma.activityLog.count({
    where: { action: "contractor_portal_link_sent", details: { contains: CONTRACTOR_NAME } },
  });
  check(
    mailerConfigured ? "sends are activity-logged" : "nothing is logged when nothing was sent",
    mailerConfigured ? logged > 0 : logged === 0,
    logged
  );

  console.log("\nCleaning up…");
  await prisma.contractor.deleteMany({ where: { name: { startsWith: CONTRACTOR_NAME } } });
  await prisma.user.deleteMany({ where: { email: USER_EMAIL } });
  await prisma.activityLog.deleteMany({ where: { details: { contains: CONTRACTOR_NAME } } });
  await prisma.activityLog.deleteMany({ where: { details: { contains: "ZZ Access Test" } } });

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.contractor.deleteMany({ where: { name: { startsWith: CONTRACTOR_NAME } } });
  await prisma.user.deleteMany({ where: { email: USER_EMAIL } });
  process.exit(1);
});
