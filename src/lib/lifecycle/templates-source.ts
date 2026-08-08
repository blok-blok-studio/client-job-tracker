/**
 * Shipped template copy — VERBATIM from Chase's lifecycle spec. Do not edit
 * wording here; the portal's template editor (backed by the EmailTemplate
 * table) is where copy changes happen. This file is the source for initial
 * seeding and for the "reset to original" button.
 *
 * Copy rules (enforced socially, shown in the editor): no dashes, no AI
 * sounding phrases, plain sentences, flat numbers.
 */

export type TemplateSourceKind = "SEQUENCE_EMAIL" | "SEQUENCE_DRAFT" | "SNIPPET";

export interface TemplateSource {
  key: string;
  name: string;
  kind: TemplateSourceKind;
  subject: string;
  body: string;
}

export const TEMPLATE_SOURCES: TemplateSource[] = [
  {
    key: "A1",
    name: "A1 — Onboarding welcome",
    kind: "SEQUENCE_EMAIL",
    subject: "Welcome aboard. Here is exactly what happens next",
    body: `Hi {{first_name}},

The paperwork is done and we are officially building your site. I am excited about this one.

So you always know where things stand, here is the whole project on one page.

What you are getting ({{tier_name}}):
{{scope_bullets}}

Investment: {{price}}. {{deposit}} received, thank you. The remaining {{balance}} is due at launch, and the site goes live the day it lands.

The roadmap:
Kickoff call: this week, pick a time here: {{booking_link}}
Design direction: you will see the first visual work within 7 days of kickoff
{{timeline_line}}
Launch: {{target_date}}

How we work:
You get an update from me every Friday. Short and clear: what got done, what is next, what I need from you.
Each design phase includes {{revision_rounds}} revision rounds. You send feedback in one batch per round and we keep momentum.
When you approve a phase, it is closed and we move forward. Changes to closed phases are quoted as a written change order, so the timeline and price you see stay true.

What I need from you: the checklist here covers everything, with dates: {{asset_checklist_link}}. The single biggest thing that delays websites is waiting on content, so the sooner this comes in, the sooner you launch.

Book the kickoff and we are rolling: {{booking_link}}

Chase`,
  },
  {
    key: "A2",
    name: "A2 — Kickoff nudge",
    kind: "SEQUENCE_EMAIL",
    subject: "Grab your kickoff time",
    body: `Hi {{first_name}}, quick one. The kickoff call is where your site officially starts moving, and I keep the calendar tight so we hit your launch date. Here is the link again: {{booking_link}}. Takes 30 minutes.`,
  },
  {
    key: "B1",
    name: "B1 — Content due in one week",
    kind: "SEQUENCE_EMAIL",
    subject: "One week until content day",
    body: `Hi {{first_name}}, quick heads up that your content is due {{asset_deadline}}. Whatever you have, send it, done is better than perfect and we polish everything anyway. If writing is the blocker, say the word and we take it over at 200 per page so your launch date holds.`,
  },
  {
    key: "B2",
    name: "B2 — Content day",
    kind: "SEQUENCE_EMAIL",
    subject: "Content day",
    body: `Hi {{first_name}}, today is the day. Send what you have and we keep your launch date locked. Missing pieces can follow within the week.`,
  },
  {
    key: "B3",
    name: "B3 — Content overdue decision",
    kind: "SEQUENCE_EMAIL",
    subject: "Your launch date needs a decision",
    body: `Hi {{first_name}}, I do not have your content yet, so here are the two ways forward. Option one, it arrives by {{deadline_plus_7}} and your launch date holds. Option two, we write it for you at 200 per page and nothing moves. If I hear nothing by {{deadline_plus_7}}, the project pauses and re-enters the queue when content lands, and I would honestly rather keep your momentum. Which way do you want to go?`,
  },
  {
    key: "C1",
    name: "C1 — Friday update skeleton (internal, Chase fills)",
    kind: "SEQUENCE_DRAFT",
    subject: "{{project_name}} weekly update",
    body: `Hi {{first_name}},
Done this week:
Next week:
Need from you:
Timeline:
Budget:

Have a good weekend,
Chase`,
  },
  {
    key: "D1",
    name: "D1 — Completion summary",
    kind: "SEQUENCE_EMAIL",
    subject: "{{project_name}} is live. Here is your completion summary",
    body: `Hi {{first_name}},

Your site is live at {{url}}. Congratulations, it looks fantastic and I am proud of what we built together.

This email is your official project completion summary, so we both have everything in one place.

Delivered and complete as of {{date}}:
{{deliverables_list}}

Your support period runs until {{support_end}}. Support means we fix anything that breaks and answer your questions about what was delivered. Content changes, improvements and new features are separate, and that is what your Care Plan is for.

Your free Care Plan runs until {{care_free_end}}. For the next 3 months we handle hosting, security, updates and backups, plus 2 hours of content edits per month, on us. I will send you a short note each month showing what Care did for you. From month 4 it continues at 200 per month unless you tell us to stop.

Please reply with a quick "confirmed" so we both have the completion on record. If anything on the list above looks off, tell me now and I will make it right.

Thank you for trusting us with this. Talk soon,
Chase`,
  },
  {
    key: "E1",
    name: "E1 — Monthly Care value note (semi-automated, Chase fills stats)",
    kind: "SEQUENCE_DRAFT",
    subject: "What Care did for you in {{month}}",
    body: `Hi {{first_name}}, your monthly Care summary:
Uptime: {{uptime}}%
Updates and security patches run: {{patch_count}}
Backups taken: {{backup_count}}
Content edits used: {{hours_used}} of 2 hours ({{what_was_done}})

Anything you want changed on the site this month? You have {{hours_remaining}} of edit time left, just reply with the change.`,
  },
  {
    key: "E2",
    name: "E2 — Care conversion call",
    kind: "SEQUENCE_EMAIL",
    subject: "Quick 15 minutes before your included Care period ends",
    body: `Hi {{first_name}}, your included Care Plan runs to {{care_free_end}}. Before then I want 15 minutes with you to look at how the site is performing and what staying on Care looks like. Grab a slot: {{booking_link}}`,
  },
  {
    key: "E3",
    name: "E3 — Care decision email",
    kind: "SEQUENCE_EMAIL",
    subject: "Your Care Plan, decision time",
    body: `Hi {{first_name}}, your included Care period ends {{care_free_end}}. Two ways forward.

Keep Care, 200 per month. Everything continues exactly as the last 3 months: hosting, security, updates, backups, 2 hours of edits. You do nothing, it just continues.

Go it alone. No hard feelings. I will send you the Website Owner's Manual, the full list of what to handle yourself, and you can always book us ad hoc at 125 per hour.

If I do not hear from you by {{care_free_end}}, I will assume you are staying on, most people do, and you can cancel any time.`,
  },
  {
    key: "G1",
    name: "G1 — Quarterly recap broadcast (draft, Chase edits results lines)",
    kind: "SEQUENCE_DRAFT",
    subject: "What we have been building lately",
    body: `Hi {{first_name}},

Quick quarterly note, no ask, just keeping you in the loop on what Blok Blok has been up to.

[RESULTS LINE 1]
[RESULTS LINE 2]
[WHAT IS NEW LINE]

If someone around you is losing business to a bad website, you know where I am. And the referral deal stands: 10% of the project to you when it closes.

Chase`,
  },
  // --- Snippet library (manual sends) ---
  {
    key: "snippet_phase_signoff",
    name: "Snippet — Phase sign-off",
    kind: "SNIPPET",
    subject: "{{phase}} approved and closed",
    body: `Hi {{first_name}}, confirming today's approval: {{phase}} is closed and we are moving to {{next_phase}}. From here, changes to {{phase}} would be quoted as a written change order, that is how we protect your timeline and your price. Next milestone: {{milestone}} on {{date}}.`,
  },
  {
    key: "snippet_kickoff_recap",
    name: "Snippet — Kickoff recap",
    kind: "SNIPPET",
    subject: "Kickoff recap. We are building",
    body: `Hi {{first_name}}, great call today. What we agreed: Pages: {{list}} · Design direction: {{summary}} · Your content is due {{date}}, full list attached again · You will see the first design work on {{date}} · Every Friday you get an update from me. If I missed anything, reply and correct me. Otherwise, we are off.`,
  },
  {
    key: "snippet_partner_outreach",
    name: "Snippet — Partner outreach",
    kind: "SNIPPET",
    subject: "Your clients ask you about websites. I have an answer for you",
    body: `Hi {{first_name}}, I run Blok Blok Studio, we build premium websites for {{vertical}} businesses. I am guessing your clients ask you about this stuff, because everyone's clients do. Two things on the table. One, a standing 10% referral fee on any project that closes from your intro. Two, happy to return the favor, my clients constantly need {{their_service}}. Worth a 20 minute call? {{booking_link}}`,
  },
];

export const TEMPLATE_SOURCE_BY_KEY: Record<string, TemplateSource> = Object.fromEntries(
  TEMPLATE_SOURCES.map((t) => [t.key, t])
);
