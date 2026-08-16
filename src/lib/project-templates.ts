/**
 * Project templates — the standard task set for each service, spawned onto a
 * client when a project kicks off ("Start project" on the client page).
 *
 * Each task carries a role hint (team-roles.ts jobRole key) so work lands with
 * the right person automatically: the first active user with that jobRole gets
 * it; no match = unassigned. offsetDays sets the due date relative to the
 * chosen start date. Templates are deliberately opinionated — this is how
 * BlokBlok delivers, not a generic board builder.
 */

export interface TemplateTask {
  title: string;
  description?: string;
  /** TaskCategory enum value */
  category: string;
  priority: "URGENT" | "HIGH" | "MEDIUM" | "LOW";
  /** team-roles.ts jobRole key for the default assignee */
  role?: string;
  /** Due date = start + offsetDays (skipped when null) */
  offsetDays?: number;
  checklist?: string[];
}

export interface ProjectTemplate {
  key: string;
  name: string;
  blurb: string;
  tasks: TemplateTask[];
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    key: "website-build",
    name: "Website Build",
    blurb: "Discovery through launch — the full site delivery playbook.",
    tasks: [
      {
        title: "Discovery call + project brief",
        description: "Goals, audience, pages, references. Write the brief into the client notes.",
        category: "STRATEGY",
        priority: "HIGH",
        role: "owner-operator",
        offsetDays: 2,
        checklist: ["Call held", "Brief written", "Assets list sent to client"],
      },
      {
        title: "Sitemap + wireframes",
        category: "DESIGN",
        priority: "HIGH",
        role: "creative-director",
        offsetDays: 5,
      },
      {
        title: "Design concept (home + one inner page)",
        category: "DESIGN",
        priority: "HIGH",
        role: "creative-director",
        offsetDays: 10,
      },
      {
        title: "Client design review",
        description: "Send the concept as a Deliverable for approval before build starts.",
        category: "CLIENT_COMMS",
        priority: "HIGH",
        role: "producer",
        offsetDays: 12,
      },
      {
        title: "Build site",
        category: "DEVELOPMENT",
        priority: "HIGH",
        role: "full-stack-dev",
        offsetDays: 22,
        checklist: ["All pages built", "Mobile pass", "Forms wired + tested"],
      },
      {
        title: "Content + copy load",
        category: "CONTENT_CREATION",
        priority: "MEDIUM",
        role: "marketing-strategist",
        offsetDays: 24,
      },
      {
        title: "SEO + performance pass",
        description: "Metadata, OG images, alt text, WebP images, Lighthouse ≥ 90s.",
        category: "DEVELOPMENT",
        priority: "MEDIUM",
        role: "full-stack-dev",
        offsetDays: 26,
        checklist: ["Meta titles/descriptions", "OG cards", "Images WebP", "Lighthouse run"],
      },
      {
        title: "QA — devices + browsers",
        category: "DEVELOPMENT",
        priority: "HIGH",
        role: "producer",
        offsetDays: 27,
        checklist: ["iPhone", "Android", "Safari", "Chrome", "Tablet", "404 + form errors"],
      },
      {
        title: "Client review of staging site",
        description: "Send the staging link as a Deliverable; collect per-page feedback.",
        category: "CLIENT_COMMS",
        priority: "HIGH",
        role: "producer",
        offsetDays: 28,
      },
      {
        title: "Launch",
        description: "Domain, SSL, redirects, analytics, search console. Set the client's launch date so Care sequences start.",
        category: "DEVELOPMENT",
        priority: "URGENT",
        role: "full-stack-dev",
        offsetDays: 32,
        checklist: ["DNS cut over", "SSL live", "Redirects in place", "Analytics firing", "Search Console submitted"],
      },
      {
        title: "Post-launch check (1 week)",
        description: "Uptime, forms, analytics data flowing, no console errors.",
        category: "DEVELOPMENT",
        priority: "MEDIUM",
        role: "full-stack-dev",
        offsetDays: 39,
      },
    ],
  },
  {
    key: "brand-design",
    name: "Brand & Design",
    blurb: "Questionnaire to asset handoff — logo, palette, brand guide.",
    tasks: [
      {
        title: "Brand questionnaire + kickoff",
        category: "STRATEGY",
        priority: "HIGH",
        role: "owner-operator",
        offsetDays: 2,
      },
      {
        title: "Moodboards (2–3 directions)",
        category: "DESIGN",
        priority: "HIGH",
        role: "creative-director",
        offsetDays: 6,
      },
      {
        title: "Logo concepts",
        category: "DESIGN",
        priority: "HIGH",
        role: "creative-director",
        offsetDays: 12,
      },
      {
        title: "Client review — concepts",
        description: "Send as a Deliverable; one consolidated revision round.",
        category: "CLIENT_COMMS",
        priority: "HIGH",
        role: "producer",
        offsetDays: 14,
      },
      {
        title: "Revisions + final marks",
        category: "DESIGN",
        priority: "HIGH",
        role: "creative-director",
        offsetDays: 18,
      },
      {
        title: "Brand guide (colors, type, usage)",
        category: "DESIGN",
        priority: "MEDIUM",
        role: "creative-director",
        offsetDays: 22,
      },
      {
        title: "Asset handoff",
        description: "SVG logos, favicons, social kit — deliver via the Deliverables tab.",
        category: "CLIENT_COMMS",
        priority: "MEDIUM",
        role: "producer",
        offsetDays: 24,
        checklist: ["SVG + PNG exports", "Favicon set", "Social avatars/covers", "Brand guide PDF"],
      },
    ],
  },
  {
    key: "social-month",
    name: "Social Content (monthly cycle)",
    blurb: "One month of videos/carousels: plan, produce, approve, schedule.",
    tasks: [
      {
        title: "Content plan for the month",
        description: "Topics, formats, posting cadence. Align with what's converting.",
        category: "STRATEGY",
        priority: "HIGH",
        role: "marketing-strategist",
        offsetDays: 2,
      },
      {
        title: "Collect / shoot raw assets",
        category: "CONTENT_CREATION",
        priority: "MEDIUM",
        role: "marketing-strategist",
        offsetDays: 6,
      },
      {
        title: "Design carousels + edit videos",
        category: "CONTENT_CREATION",
        priority: "HIGH",
        role: "creative-director",
        offsetDays: 12,
      },
      {
        title: "Client approval",
        description: "Send the batch as a Deliverable for per-item approve/changes.",
        category: "CLIENT_COMMS",
        priority: "HIGH",
        role: "producer",
        offsetDays: 15,
      },
      {
        title: "Schedule the month",
        description: "Load approved posts into the Content calendar.",
        category: "SOCIAL_MEDIA",
        priority: "MEDIUM",
        role: "marketing-strategist",
        offsetDays: 18,
      },
    ],
  },
  {
    key: "seo-sprint",
    name: "SEO Sprint",
    blurb: "Audit, fix, and set the content plan — the add-on SEO engagement.",
    tasks: [
      {
        title: "Technical SEO audit",
        description: "Crawl, indexing, speed, structured data, broken links.",
        category: "STRATEGY",
        priority: "HIGH",
        role: "full-stack-dev",
        offsetDays: 3,
      },
      {
        title: "Keyword research + mapping",
        category: "STRATEGY",
        priority: "HIGH",
        role: "marketing-strategist",
        offsetDays: 5,
      },
      {
        title: "On-page fixes",
        description: "Titles, descriptions, headings, internal links, image alts.",
        category: "DEVELOPMENT",
        priority: "HIGH",
        role: "full-stack-dev",
        offsetDays: 10,
      },
      {
        title: "Local listings + profiles",
        description: "Google Business Profile, key directories, NAP consistency.",
        category: "SOCIAL_MEDIA",
        priority: "MEDIUM",
        role: "marketing-strategist",
        offsetDays: 12,
      },
      {
        title: "Content plan + baseline report",
        description: "What to publish next quarter; snapshot rankings/traffic as the baseline.",
        category: "REPORTING",
        priority: "MEDIUM",
        role: "marketing-strategist",
        offsetDays: 15,
      },
    ],
  },
  {
    key: "client-onboarding",
    name: "Client Onboarding",
    blurb: "New client housekeeping — access, folders, kickoff, expectations.",
    tasks: [
      {
        title: "Countersign + file the contract",
        category: "ONBOARDING",
        priority: "HIGH",
        role: "owner-operator",
        offsetDays: 1,
      },
      {
        title: "Collect access + credentials into Vault",
        description: "Domain, hosting, socials, analytics — store in the client's Vault, never in chat.",
        category: "ONBOARDING",
        priority: "HIGH",
        role: "producer",
        offsetDays: 3,
        checklist: ["Domain/DNS", "Hosting", "Social accounts", "Analytics"],
      },
      {
        title: "Book + hold kickoff call",
        category: "CLIENT_COMMS",
        priority: "HIGH",
        role: "owner-operator",
        offsetDays: 5,
      },
      {
        title: "Send asset upload link + deadline",
        description: "Use the client's upload portal; set the asset deadline on the Lifecycle card so chasers arm.",
        category: "ONBOARDING",
        priority: "MEDIUM",
        role: "producer",
        offsetDays: 6,
      },
    ],
  },
];

export const TEMPLATE_BY_KEY = new Map(PROJECT_TEMPLATES.map((t) => [t.key, t]));
