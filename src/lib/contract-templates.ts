// Contract template system for Blok Blok Studio
// Auto-generates contract text based on selected packages

export interface ServicePackage {
  id: string;
  name: string;
  price: number;
  description: string;
  deliverables: string[];
  timeline: string;
  supportPeriod: string;
}

export const SERVICE_PACKAGES: ServicePackage[] = [
  {
    id: "single-agent",
    name: "Single Agent Build",
    price: 5000,
    description:
      "One custom AI agent tailored to your business needs.",
    deliverables: [
      "1 custom AI agent (voice, email, web scraping, PDF generation, customer support, lead qualification, appointment booking, data processing, content generation, or social monitoring)",
      "Agent training with up to 50 data points",
      "Integration with 1 external system",
      "Testing and quality assurance",
      "Documentation and handover",
    ],
    timeline: "1\u20132 weeks",
    supportPeriod: "30 days post-launch support",
  },
  {
    id: "agent-team",
    name: "Agent Team",
    price: 8500,
    description:
      "Three interconnected AI agents working as a coordinated system.",
    deliverables: [
      "3 custom AI agents working as a coordinated team",
      "Workflow orchestration between agents",
      "3 external system integrations",
      "Training on up to 75 data points per agent",
      "Up to 25 training updates per agent during support period",
    ],
    timeline: "2\u20134 weeks",
    supportPeriod: "60 days post-launch support",
  },
  {
    id: "ai-operations",
    name: "AI Operations",
    price: 15000,
    description:
      "Five or more custom AI agents covering multiple departments.",
    deliverables: [
      "5+ custom AI agents across departments (sales, support, marketing, operations, data)",
      "Central orchestration layer",
      "6 external system integrations",
      "Security and compliance protocols",
      "Team training and onboarding",
      "Weekly performance reviews during support period",
    ],
    timeline: "4\u20138 weeks",
    supportPeriod: "90 days active monitoring",
  },
];

export const ADDON_PACKAGES: ServicePackage[] = [
  {
    id: "voice-agent",
    name: "Voice Agent",
    price: 5000,
    description: "Individual voice AI agent.",
    deliverables: ["1 custom voice AI agent", "Training and integration", "Documentation"],
    timeline: "1\u20132 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "email-agent",
    name: "Email Agent",
    price: 5000,
    description: "Individual email AI agent.",
    deliverables: ["1 custom email AI agent", "Training and integration", "Documentation"],
    timeline: "1\u20132 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "web-scraping-agent",
    name: "Web Scraping Agent",
    price: 5000,
    description: "Individual web scraping AI agent.",
    deliverables: ["1 custom web scraping AI agent", "Training and integration", "Documentation"],
    timeline: "1\u20132 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "pdf-generator-agent",
    name: "PDF Generator Agent",
    price: 5000,
    description: "Individual PDF generator AI agent.",
    deliverables: ["1 custom PDF generator AI agent", "Training and integration", "Documentation"],
    timeline: "1\u20132 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "customer-support-agent",
    name: "Customer Support Agent",
    price: 5000,
    description: "Individual customer support AI agent.",
    deliverables: ["1 custom customer support AI agent", "Training and integration", "Documentation"],
    timeline: "1\u20132 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "lead-qualification-agent",
    name: "Lead Qualification Agent",
    price: 5000,
    description: "Individual lead qualification AI agent.",
    deliverables: ["1 custom lead qualification AI agent", "Training and integration", "Documentation"],
    timeline: "1\u20132 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "appointment-booking-agent",
    name: "Appointment Booking Agent",
    price: 5000,
    description: "Individual appointment booking AI agent.",
    deliverables: ["1 custom appointment booking AI agent", "Training and integration", "Documentation"],
    timeline: "1\u20132 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "data-processing-agent",
    name: "Data Processing Agent",
    price: 5000,
    description: "Individual data processing AI agent.",
    deliverables: ["1 custom data processing AI agent", "Training and integration", "Documentation"],
    timeline: "1\u20132 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "content-generation-agent",
    name: "Content Generation Agent",
    price: 5000,
    description: "Individual content generation AI agent.",
    deliverables: ["1 custom content generation AI agent", "Training and integration", "Documentation"],
    timeline: "1\u20132 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "social-monitoring-agent",
    name: "Social Monitoring Agent",
    price: 5000,
    description: "Individual social monitoring AI agent.",
    deliverables: ["1 custom social monitoring AI agent", "Training and integration", "Documentation"],
    timeline: "1\u20132 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "api-integration",
    name: "API Integration Add-On",
    price: 3000,
    description: "Connect any agent to external APIs.",
    deliverables: [
      "API authentication setup",
      "Data mapping and transformation",
      "Error handling and retry logic",
      "Integration testing",
    ],
    timeline: "3\u20135 days",
    supportPeriod: "30 days",
  },
];

export function generateContractBody(
  clientName: string,
  companyName: string | null,
  selectedPackages: string[],
  selectedAddons: string[],
  customTerms?: string
): string {
  const packages = SERVICE_PACKAGES.filter((p) => selectedPackages.includes(p.id));
  const addons = ADDON_PACKAGES.filter((a) => selectedAddons.includes(a.id));
  const allItems = [...packages, ...addons];

  const total = allItems.reduce((sum, item) => sum + item.price, 0);
  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const clientLabel = companyName
    ? `${clientName} (${companyName})`
    : clientName;

  let contract = `SERVICE AGREEMENT

Date: ${today}

Between:
Blok Blok Studio ("Provider")
and
${clientLabel} ("Client")

---

1. SCOPE OF SERVICES

The Provider agrees to deliver the following services to the Client:

`;

  allItems.forEach((item, i) => {
    contract += `${i + 1}. ${item.name} \u2014 $${item.price.toLocaleString()}
   ${item.description}
   Deliverables:
`;
    item.deliverables.forEach((d) => {
      contract += `   \u2022 ${d}\n`;
    });
    contract += `   Timeline: ${item.timeline}
   Support: ${item.supportPeriod}

`;
  });

  contract += `---

2. TOTAL INVESTMENT

Total: $${total.toLocaleString()} USD
Payment is due upon signing of this agreement unless otherwise agreed upon in writing.
Ad spend is billed separately and is not included in the above total.

---

3. PAYMENT TERMS

\u2022 50% deposit is required before work begins.
\u2022 Remaining 50% is due upon project completion and delivery.
\u2022 Payments are accepted via Stripe, bank transfer, or other agreed-upon methods.
\u2022 Late payments may incur a 1.5% monthly fee on the outstanding balance.

---

4. TIMELINE & DELIVERY

\u2022 Estimated project timelines are provided in good faith and may vary based on scope changes or client response times.
\u2022 The Provider will communicate any delays promptly.
\u2022 Client is responsible for providing necessary materials, data, and feedback in a timely manner.

---

5. REVISIONS & CHANGES

\u2022 Minor adjustments within the agreed scope are included.
\u2022 Scope changes or additional features will be quoted separately and require written approval before work begins.
\u2022 Training updates during the support period are included as specified per package.

---

6. INTELLECTUAL PROPERTY

\u2022 Upon full payment, the Client owns all custom-built agents and deliverables.
\u2022 The Provider retains the right to use anonymized case studies and portfolio references.
\u2022 Third-party tools, APIs, and platforms remain subject to their respective licenses.

---

7. CONFIDENTIALITY

\u2022 Both parties agree to keep all shared information confidential.
\u2022 The Provider will not share client data, credentials, or business information with third parties.
\u2022 This obligation survives the termination of this agreement.

---

8. SUPPORT & MAINTENANCE

\u2022 Post-launch support is included as specified per package above.
\u2022 After the support period, ongoing maintenance and updates can be arranged under a separate agreement.
\u2022 Critical bug fixes during the support period will be prioritized within 24 hours.

---

9. TERMINATION

\u2022 Either party may terminate this agreement with 14 days written notice.
\u2022 Work completed up to the termination date will be billed proportionally.
\u2022 The deposit is non-refundable once work has commenced.

---

10. LIABILITY

\u2022 The Provider\u2019s liability is limited to the total amount paid under this agreement.
\u2022 The Provider is not liable for losses arising from third-party services, APIs, or platforms.
\u2022 The Client is responsible for ensuring compliance with their industry\u2019s regulations.

---

11. GOVERNING LAW

This agreement shall be governed by and construed in accordance with applicable law. Any disputes shall be resolved through good-faith negotiation before pursuing legal remedies.

`;

  if (customTerms) {
    contract += `---

12. ADDITIONAL TERMS

${customTerms}

`;
  }

  contract += `---

By signing below, both parties agree to the terms outlined in this Service Agreement.

`;

  return contract;
}
