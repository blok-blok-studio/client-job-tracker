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

export interface CustomLineItem {
  name: string;
  price: number;
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
    timeline: "1 to 2 weeks",
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
    timeline: "2 to 4 weeks",
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
    timeline: "4 to 8 weeks",
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
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "email-agent",
    name: "Email Agent",
    price: 5000,
    description: "Individual email AI agent.",
    deliverables: ["1 custom email AI agent", "Training and integration", "Documentation"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "web-scraping-agent",
    name: "Web Scraping Agent",
    price: 5000,
    description: "Individual web scraping AI agent.",
    deliverables: ["1 custom web scraping AI agent", "Training and integration", "Documentation"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "pdf-generator-agent",
    name: "PDF Generator Agent",
    price: 5000,
    description: "Individual PDF generator AI agent.",
    deliverables: ["1 custom PDF generator AI agent", "Training and integration", "Documentation"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "customer-support-agent",
    name: "Customer Support Agent",
    price: 5000,
    description: "Individual customer support AI agent.",
    deliverables: ["1 custom customer support AI agent", "Training and integration", "Documentation"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "lead-qualification-agent",
    name: "Lead Qualification Agent",
    price: 5000,
    description: "Individual lead qualification AI agent.",
    deliverables: ["1 custom lead qualification AI agent", "Training and integration", "Documentation"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "appointment-booking-agent",
    name: "Appointment Booking Agent",
    price: 5000,
    description: "Individual appointment booking AI agent.",
    deliverables: ["1 custom appointment booking AI agent", "Training and integration", "Documentation"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "data-processing-agent",
    name: "Data Processing Agent",
    price: 5000,
    description: "Individual data processing AI agent.",
    deliverables: ["1 custom data processing AI agent", "Training and integration", "Documentation"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "content-generation-agent",
    name: "Content Generation Agent",
    price: 5000,
    description: "Individual content generation AI agent.",
    deliverables: ["1 custom content generation AI agent", "Training and integration", "Documentation"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "social-monitoring-agent",
    name: "Social Monitoring Agent",
    price: 5000,
    description: "Individual social monitoring AI agent.",
    deliverables: ["1 custom social monitoring AI agent", "Training and integration", "Documentation"],
    timeline: "1 to 2 weeks",
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
    timeline: "3 to 5 days",
    supportPeriod: "30 days",
  },
];

export function generateContractBody(
  clientName: string,
  companyName: string | null,
  selectedPackages: string[],
  selectedAddons: string[],
  customItems: CustomLineItem[],
  customTerms?: string
): string {
  const packages = SERVICE_PACKAGES.filter((p) => selectedPackages.includes(p.id));
  const addons = ADDON_PACKAGES.filter((a) => selectedAddons.includes(a.id));
  const allItems = [...packages, ...addons];

  const packageTotal = allItems.reduce((sum, item) => sum + item.price, 0);
  const customTotal = customItems.reduce((sum, item) => sum + item.price, 0);
  const grandTotal = packageTotal + customTotal;

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const clientLabel = companyName
    ? `${clientName} on behalf of ${companyName}`
    : clientName;

  let contract = `SERVICE AGREEMENT


This Service Agreement ("Agreement") is entered into as of ${today} by and between Blok Blok Studio ("Provider") and ${clientLabel} ("Client"). Together referred to as the "Parties."

This Agreement outlines the terms and conditions under which the Provider will deliver the services described below. By signing this Agreement, both Parties acknowledge and accept the obligations set forth herein.



SECTION 1. SCOPE OF SERVICES

The Provider agrees to deliver the following services to the Client:

`;

  allItems.forEach((item, i) => {
    contract += `   ${String.fromCharCode(65 + i)}. ${item.name}    $${item.price.toLocaleString()} USD
      ${item.description}

      What is included:
`;
    item.deliverables.forEach((d) => {
      contract += `         ${d}\n`;
    });
    contract += `
      Estimated timeline: ${item.timeline}
      Post-launch support: ${item.supportPeriod}

`;
  });

  if (customItems.length > 0) {
    const startChar = allItems.length;
    customItems.forEach((item, i) => {
      contract += `   ${String.fromCharCode(65 + startChar + i)}. ${item.name}    $${item.price.toLocaleString()} USD

`;
    });
  }

  contract += `

SECTION 2. TOTAL INVESTMENT

`;

  // Itemized breakdown
  allItems.forEach((item) => {
    contract += `   ${item.name}    $${item.price.toLocaleString()} USD\n`;
  });
  customItems.forEach((item) => {
    contract += `   ${item.name}    $${item.price.toLocaleString()} USD\n`;
  });

  contract += `
   Total    $${grandTotal.toLocaleString()} USD

Payment is due in accordance with the payment schedule outlined in Section 3 of this Agreement, unless a different arrangement has been agreed upon in writing by both Parties. Any advertising spend, third-party software licenses, API subscription fees, or external service costs are billed separately and are not included in the total above.



SECTION 3. PAYMENT TERMS

A deposit equal to fifty percent (50%) of the total project investment is required before any work begins. This deposit secures the Client's position in the Provider's project schedule and allows the Provider to allocate the necessary resources.

The remaining fifty percent (50%) is due upon project completion and final delivery of all agreed-upon deliverables. The Provider will notify the Client in writing when the project is ready for final review.

Payments may be made via Stripe, direct bank transfer, or any other method mutually agreed upon by both Parties. The Client is responsible for any transaction fees imposed by their chosen payment method.

In the event that a payment is not received within fourteen (14) calendar days of the due date, a late fee of one and a half percent (1.5%) per month will be applied to the outstanding balance. This late fee compounds monthly until the balance is paid in full. The Provider reserves the right to pause or suspend all work until outstanding payments are resolved.

If the Client fails to make payment within thirty (30) days of the due date, the Provider reserves the right to terminate this Agreement and retain all work product completed to date. The Client will remain liable for all amounts owed.



SECTION 4. TIMELINE AND DELIVERY

The estimated project timelines provided in this Agreement are offered in good faith and represent the Provider's best assessment based on the agreed scope of work. Actual timelines may vary depending on the complexity of the project, the responsiveness of the Client, and any changes to the original scope.

The Provider commits to communicating any anticipated delays to the Client as promptly as possible and will work collaboratively to adjust the schedule as needed.

The Client acknowledges that timely delivery depends on the Client providing all necessary materials, data, access credentials, feedback, and approvals within a reasonable timeframe. Delays caused by the Client's failure to provide these items in a timely manner may result in extended project timelines, and the Provider shall not be held responsible for such delays.

Final deliverables will be presented to the Client for review before the project is considered complete. The Client will have a reasonable period, not to exceed seven (7) business days, to review and request any final adjustments within the agreed scope.



SECTION 5. REVISIONS AND SCOPE CHANGES

Minor adjustments and refinements that fall within the originally agreed scope of work are included at no additional cost. The Provider is committed to ensuring the Client is satisfied with the final product.

Any requests that fall outside the original scope of work, including but not limited to new features, additional agents, expanded integrations, or changes to previously approved specifications, will be treated as scope changes. The Provider will prepare a written quote for any scope changes, and work on the additional items will not begin until the Client provides written approval and any required additional payment.

Training updates, data point adjustments, and configuration changes during the post-launch support period are included as specified in the package details above. Requests beyond the included allotment will be quoted separately.

The Provider reserves the right to suggest alternative approaches that may better serve the Client's objectives. Any such suggestions will be discussed with the Client before implementation.



SECTION 6. INTELLECTUAL PROPERTY RIGHTS

Upon receipt of full and final payment for all services rendered under this Agreement, all intellectual property rights in the custom-built deliverables, including but not limited to AI agents, custom code, workflow configurations, and documentation created specifically for the Client, shall transfer to and become the sole property of the Client.

The Provider retains the right to use general knowledge, techniques, skills, and experience gained during the project for future engagements. The Provider also retains the right to reference the project in an anonymized capacity for portfolio, case study, and marketing purposes, unless the Client provides written notice opting out of this provision within thirty (30) days of project completion.

Third-party tools, platforms, application programming interfaces (APIs), libraries, and frameworks utilized in the delivery of services remain subject to their respective license agreements. The Client is responsible for maintaining any required subscriptions or licenses for third-party services after the support period concludes.

No open-source components will be incorporated into the deliverables without prior disclosure to the Client.



SECTION 7. CONFIDENTIALITY AND DATA PROTECTION

Both Parties agree to treat all information shared during the course of this engagement as strictly confidential. This includes, but is not limited to, business strategies, financial information, customer data, technical specifications, login credentials, API keys, proprietary processes, and any other information that is not publicly available.

The Provider will not disclose, share, sell, or otherwise make available any confidential information belonging to the Client to any third party without the Client's prior written consent. The Provider will implement reasonable security measures to protect all Client data and credentials in its possession.

The Client agrees not to disclose the Provider's proprietary methods, pricing structures, internal processes, or trade secrets to any third party.

These confidentiality obligations shall survive the termination or expiration of this Agreement and shall remain in effect for a period of three (3) years following the date of termination or completion, whichever occurs later.

In the event that either Party is required by law, regulation, or court order to disclose confidential information, the disclosing Party shall provide the other Party with prompt written notice to allow the other Party an opportunity to seek a protective order or other appropriate remedy.



SECTION 8. WARRANTIES AND REPRESENTATIONS

The Provider warrants that all services will be performed in a professional and workmanlike manner, consistent with generally accepted industry standards. The Provider further warrants that the deliverables will substantially conform to the specifications agreed upon by both Parties.

If any deliverable fails to conform to the agreed specifications within the post-launch support period, the Provider will, at no additional cost, correct the non-conforming deliverable. This warranty does not extend to issues arising from the Client's modifications, misuse, or failure to follow the Provider's documented instructions.

Except as expressly stated in this Agreement, the Provider makes no other warranties, whether express, implied, statutory, or otherwise, including but not limited to implied warranties of merchantability, fitness for a particular purpose, or non-infringement. The Provider does not guarantee specific business outcomes, revenue increases, or performance metrics as a result of the services provided.

The Client represents and warrants that it has the authority to enter into this Agreement and that the materials provided to the Provider do not infringe on any third party's intellectual property rights.



SECTION 9. LIMITATION OF LIABILITY

To the maximum extent permitted by applicable law, the Provider's total cumulative liability under this Agreement, whether arising from contract, tort (including negligence), strict liability, or any other legal theory, shall not exceed the total amount actually paid by the Client to the Provider under this Agreement.

In no event shall the Provider be liable for any indirect, incidental, special, consequential, punitive, or exemplary damages, including but not limited to damages for loss of profits, revenue, data, business opportunities, goodwill, or anticipated savings, even if the Provider has been advised of the possibility of such damages.

The Provider shall not be held liable for any damages, losses, or service interruptions arising from the acts or omissions of third-party service providers, platforms, APIs, hosting services, or any other external systems that are beyond the Provider's reasonable control.

The Client acknowledges that AI-based systems may produce unexpected outputs and that the Provider cannot guarantee that AI agents will perform flawlessly in all circumstances. The Client assumes responsibility for reviewing and validating AI outputs before relying on them for business decisions.



SECTION 10. INDEMNIFICATION

The Client agrees to indemnify, defend, and hold harmless the Provider, its owners, employees, contractors, and agents from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable attorney's fees) arising out of or related to (a) the Client's use of the deliverables, (b) the Client's breach of this Agreement, (c) the Client's violation of any applicable law, regulation, or third-party right, or (d) any claim that materials provided by the Client to the Provider infringe on any third party's intellectual property or proprietary rights.

The Provider agrees to indemnify, defend, and hold harmless the Client from and against any claims arising directly from the Provider's gross negligence or willful misconduct in the performance of services under this Agreement.



SECTION 11. SUPPORT AND MAINTENANCE

Post-launch support is included as specified for each package in Section 1 of this Agreement. During the support period, the Provider will address bugs, errors, and technical issues related to the delivered agents and systems.

Critical issues that prevent the normal operation of delivered agents will be prioritized and addressed within twenty-four (24) hours of being reported. Non-critical issues will be addressed within a reasonable timeframe based on their severity and complexity.

After the conclusion of the post-launch support period, the Client may request ongoing maintenance, updates, or enhancements under a separate maintenance agreement. The terms and pricing for ongoing support will be discussed and agreed upon separately.

The Provider is not responsible for issues arising from changes made by the Client or third parties to the delivered systems, infrastructure changes outside the Provider's control, or failures in third-party services.



SECTION 12. TERMINATION

Either Party may terminate this Agreement with fourteen (14) calendar days' written notice to the other Party. Written notice may be delivered via email to the contact addresses on file for each Party.

In the event of termination by the Client, the Client shall pay for all work completed and expenses incurred up to the effective date of termination. The initial deposit is non-refundable once the Provider has commenced work, as it compensates the Provider for scheduling, resource allocation, and preliminary work.

In the event of termination by the Provider, the Provider will deliver all completed work product to the Client and will refund any payments received for services not yet rendered.

Either Party may terminate this Agreement immediately and without notice if the other Party commits a material breach of this Agreement and fails to cure such breach within seven (7) calendar days of receiving written notice of the breach.

Upon termination, all confidentiality obligations shall survive and remain in full effect as specified in Section 7.



SECTION 13. FORCE MAJEURE

Neither Party shall be held liable for any delay or failure to perform its obligations under this Agreement if such delay or failure results from circumstances beyond the Party's reasonable control, including but not limited to natural disasters, acts of government, pandemic, epidemic, war, terrorism, riots, civil unrest, widespread internet outages, cyberattacks, or failure of third-party infrastructure.

The affected Party shall provide prompt written notice to the other Party of the force majeure event and shall use commercially reasonable efforts to resume performance as soon as practicable. If a force majeure event continues for more than sixty (60) calendar days, either Party may terminate this Agreement without further liability.



SECTION 14. DISPUTE RESOLUTION

In the event of any dispute, controversy, or claim arising out of or relating to this Agreement, the Parties agree to first attempt to resolve the matter through good-faith negotiation. Either Party may initiate this process by providing written notice of the dispute to the other Party.

If the dispute cannot be resolved through negotiation within thirty (30) calendar days, either Party may pursue mediation administered by a mutually agreed-upon mediator. The costs of mediation shall be shared equally between the Parties.

If mediation is unsuccessful, either Party may pursue binding arbitration or litigation in a court of competent jurisdiction. The prevailing Party in any arbitration or litigation shall be entitled to recover its reasonable attorney's fees and costs from the non-prevailing Party.



SECTION 15. NON-SOLICITATION

During the term of this Agreement and for a period of twelve (12) months following its termination or expiration, neither Party shall directly solicit, recruit, or hire any employee, contractor, or agent of the other Party who was involved in the performance of services under this Agreement, without the prior written consent of the other Party.



SECTION 16. INDEPENDENT CONTRACTOR

The Provider is an independent contractor and nothing in this Agreement shall be construed to create a partnership, joint venture, agency, or employment relationship between the Parties. The Provider retains full control over the manner and means by which the services are performed, subject to the specifications agreed upon in this Agreement.

The Provider is solely responsible for its own taxes, insurance, benefits, and compliance with applicable employment laws. The Client shall not be required to withhold taxes or provide benefits on behalf of the Provider.



SECTION 17. ENTIRE AGREEMENT AND AMENDMENTS

This Agreement constitutes the entire agreement between the Parties with respect to the subject matter hereof and supersedes all prior or contemporaneous agreements, understandings, negotiations, and discussions, whether oral or written.

No amendment, modification, or waiver of any provision of this Agreement shall be effective unless made in writing and signed by both Parties. A waiver of any provision or breach of this Agreement shall not constitute a waiver of any other provision or any subsequent breach.

If any provision of this Agreement is held to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect.



SECTION 18. GOVERNING LAW

This Agreement shall be governed by and construed in accordance with the laws of the jurisdiction in which the Provider maintains its principal place of business, without regard to conflict of law principles. Both Parties consent to the exclusive jurisdiction of the courts in that jurisdiction for the resolution of any disputes arising under this Agreement.

`;

  if (customTerms) {
    contract += `

SECTION 19. ADDITIONAL TERMS

${customTerms}

`;
  }

  contract += `

ACKNOWLEDGMENT AND ACCEPTANCE

By signing below, both Parties acknowledge that they have read this Agreement in its entirety, understand its terms and conditions, and agree to be bound by them. Both Parties confirm that they have the authority to enter into this Agreement and that they do so voluntarily.

`;

  return contract;
}
