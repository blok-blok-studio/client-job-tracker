// Contract template system for Blok Blok Studio
// Auto-generates contract text based on selected packages

export type PackageCategory =
  | "ai-agents"
  | "ai-agent-retainers"
  | "web-brand"
  | "social-setup"
  | "social-management"
  | "social-addons"
  | "youtube"
  | "marketing-retainers"
  | "custom-development"
  | "dev-retainers"
  | "general-addons"
  | "dev-addons";

export interface ServicePackage {
  id: string;
  name: string;
  category: PackageCategory;
  price: number;
  /** Monthly recurring packages use this flag */
  recurring?: boolean;
  description: string;
  deliverables: string[];
  timeline: string;
  supportPeriod: string;
}

export interface CustomLineItem {
  name: string;
  price: number;
  recurring?: boolean;
}

export const PACKAGE_CATEGORIES: { id: PackageCategory; label: string }[] = [
  { id: "ai-agents", label: "AI Agents" },
  { id: "ai-agent-retainers", label: "AI Agent Retainers" },
  { id: "web-brand", label: "Web & Brand" },
  { id: "social-setup", label: "Social Setup" },
  { id: "social-management", label: "Social Management" },
  { id: "social-addons", label: "Social Add-Ons" },
  { id: "youtube", label: "YouTube Management" },
  { id: "marketing-retainers", label: "Marketing Retainers" },
  { id: "custom-development", label: "Custom Development" },
  { id: "dev-retainers", label: "Dev Retainers" },
  { id: "general-addons", label: "General Add-Ons" },
  { id: "dev-addons", label: "Development Add-Ons" },
];

// ─── ONE-TIME PROJECTS ──────────────────────────────────────────────

export const SERVICE_PACKAGES: ServicePackage[] = [
  // ─── AI Agent Builds (One-Time) ─────────────────────────────────
  {
    id: "single-agent",
    name: "Single Agent Build",
    category: "ai-agents",
    price: 5000,
    description: "One custom AI agent tailored to your business needs.",
    deliverables: [
      "1 custom AI agent (voice, email, scraping, PDF, chatbot, lead qual, data processing, booking, etc.)",
      "Training with up to 50 data points",
      "1 external system integration",
      "API key security: encrypted env variables, secrets manager, never hardcoded — you own all credentials",
      "Testing & deployment with staging environment",
      "Documentation & handoff",
    ],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days post-launch support",
  },
  {
    id: "agent-team",
    name: "Agent Team",
    category: "ai-agents",
    price: 8500,
    description: "Three interconnected AI agents working as a coordinated system.",
    deliverables: [
      "3 interconnected AI agents with workflow orchestration",
      "3 external system integrations included",
      "API key security: encrypted, isolated per agent — you own all credentials",
      "Training with 75 data points per agent",
      "Full end-to-end testing",
    ],
    timeline: "2 to 4 weeks",
    supportPeriod: "60 days post-launch support",
  },
  {
    id: "ai-operations",
    name: "AI Operations",
    category: "ai-agents",
    price: 15000,
    description: "Five or more custom AI agents covering multiple departments.",
    deliverables: [
      "5+ custom AI agents as a complete operational layer",
      "AI orchestration layer (routing, queues, agent-to-agent communication, retry logic)",
      "6 external system integrations included",
      "Security & compliance: encrypted env variables, enterprise secrets management, credential isolation, encryption at rest + in transit, RBAC, audit logging, PII handling, data retention policies",
      "Training with 150 data points per agent",
      "Recorded Loom walkthroughs and runbooks",
    ],
    timeline: "4 to 8 weeks",
    supportPeriod: "90 days active monitoring",
  },

  // ─── AI Agent Retainers (Monthly) ───────────────────────────────
  {
    id: "agent-maintenance",
    name: "Agent Maintenance",
    category: "ai-agent-retainers",
    price: 1500,
    recurring: true,
    description: "Live agents that need to stay accurate and online.",
    deliverables: [
      "24/7 monitoring of up to 3 agents",
      "15 training data updates per month",
      "API & integration health checks monthly — all keys stored securely",
      "Monthly performance report",
      "Text/email support, 48hr response, 8 requests/mo (beyond 8: $200/hr)",
    ],
    timeline: "Ongoing monthly (3-month minimum)",
    supportPeriod: "Included",
  },
  {
    id: "agent-growth",
    name: "Agent Growth",
    category: "ai-agent-retainers",
    price: 3500,
    recurring: true,
    description: "Businesses actively expanding AI capabilities.",
    deliverables: [
      "Everything in Agent Maintenance with expanded limits",
      "Monitoring up to 6 agents (4hr resolution)",
      "40 training updates per month",
      "1 new automation workflow per month",
      "Monthly Loom strategy update + 1 optional live call (30 min)",
      "API key security & credential rotation reminders",
      "Priority support: 24hr response, 15 requests/mo",
    ],
    timeline: "Ongoing monthly (6-month minimum)",
    supportPeriod: "Included",
  },
  {
    id: "agent-command-center",
    name: "Agent Command Center",
    category: "ai-agent-retainers",
    price: 7500,
    recurring: true,
    description: "Businesses running AI as core operations.",
    deliverables: [
      "Everything in Agent Growth with expanded limits",
      "Unlimited agent monitoring (2hr resolution)",
      "Unlimited training data updates",
      "3 new automation workflows per month",
      "Monthly strategy meeting (60 min) + weekly Loom updates",
      "Enterprise security: secrets management, credential isolation, audit logging, monthly security review, PII protocols",
      "1 new agent build per month included (additional agents $2,000 each vs $5,000 standalone)",
      "Quarterly AI audit",
    ],
    timeline: "Ongoing monthly (6-month minimum)",
    supportPeriod: "Included",
  },

  // ─── Web & Brand Packages ──────────────────────────────────────

  {
    id: "starter-launch",
    name: "Starter Launch",
    category: "web-brand",
    price: 4500,
    description: "Everything you need to launch your brand online.",
    deliverables: [
      "Custom website (5 pages) — fully custom-designed, mobile-responsive, built in Next.js (Home, About, Services, Contact, +1)",
      "SEO meta titles and descriptions for all 5 pages",
      "SSL and hosting on Vercel included",
      "Brand identity: 2 logo concepts (PNG, SVG, PDF), 1 color palette (5 colors), 1 font pairing",
      "AI chat widget: 1 chatbot, 25 Q&A pairs, lead capture form",
      "CRM setup (GoHighLevel): 1 pipeline with 5 stages, 5 automations, contact import (500 max)",
      "Analytics & tracking: GA4, 1 conversion goal, Google Search Console, CTA event tracking",
      "2 design revision rounds per page within 5 business days",
    ],
    timeline: "4 to 6 weeks",
    supportPeriod: "30 days post-launch monitoring",
  },
  {
    id: "growth-accelerator",
    name: "Growth Accelerator",
    category: "web-brand",
    price: 9500,
    description: "A complete digital presence built for growth and conversions.",
    deliverables: [
      "Custom website (10 pages + CMS) — Next.js with blog/portfolio CMS, 3 custom animations, full on-page SEO",
      "SSL + Vercel hosting",
      "Full brand identity: 3 logo concepts, 10-page brand guidelines PDF, 5 social media templates",
      "AI chatbot: 50 Q&A pairs, appointment booking, lead capture, embedded on 3 pages",
      "AI voice agent: 1 inbound voice agent, 1 call script, 500 voice minutes first month, call recordings in CRM",
      "Workflow automation: 8 GoHighLevel automations, up to 5 steps each",
      "Google Ads setup: 1 campaign, 3 ad groups, 6 ad variations, 1 landing page, conversion tracking (ad spend billed separately)",
      "Real-time client dashboard with 6 widgets",
      "3 design revision rounds per deliverable",
      "Homepage + services page copy included (1,500 words)",
    ],
    timeline: "6 to 8 weeks",
    supportPeriod: "30 days post-launch (ad management, AI monitoring, bug fixes)",
  },
  {
    id: "total-domination",
    name: "Total Domination",
    category: "web-brand",
    price: 18000,
    description: "End-to-end digital ecosystem for maximum market impact.",
    deliverables: [
      "Premium website (15 pages + e-commerce) — Next.js with headless CMS, 6 custom animations, e-commerce (20 products with Shopify/Stripe), full SEO, CDN optimization",
      "Complete brand system: 5 logo concepts, 20-page brand guidelines, stationery design, pitch deck (15 slides), 10 social templates",
      "AI agent ecosystem: 3 interconnected agents with decision tree and CRM integration",
      "Conversational AI suite: chatbot (100 Q&A), voice agent (2 scripts, 1,000 minutes), 5 SMS sequences",
      "Workflow automation: 15 automations, up to 7 steps with conditional logic",
      "Google + Meta Ads full setup: Google (5 ad groups, 10 variations), Meta (3 ad sets), retargeting, 2 landing pages, ad creative (ad spend separate)",
      "AI content system: video-to-clips workflow, blog generation, social scheduling — first month: 4 blogs + 12 social posts",
      "Executive dashboard: 10 widgets, weekly summary email to 3 recipients",
      "3 design revision rounds per deliverable",
      "Full copy for 10 pages + all ad copy included",
    ],
    timeline: "8 to 12 weeks",
    supportPeriod: "45 days post-launch monitoring",
  },

  // ─── Social Setup (One-Time) ────────────────────────────────────

  {
    id: "single-platform-setup",
    name: "Single Platform Setup",
    category: "social-setup",
    price: 1200,
    description: "Start fresh on a single platform with a professional presence.",
    deliverables: [
      "1 platform of choice — profile optimization",
      "Visual identity assets (profile photo + cover image)",
      "3 content templates",
      "Hashtag strategy (3 sets)",
      "4 launch posts",
      "Platform guide PDF",
    ],
    timeline: "3 to 5 days",
    supportPeriod: "Post-delivery: $175/hr",
  },
  {
    id: "multi-platform-launch",
    name: "Multi-Platform Launch",
    category: "social-setup",
    price: 2000,
    description: "Launch or refresh your social presence across 3 platforms.",
    deliverables: [
      "3 platforms — profile optimization on all 3",
      "Cohesive visual identity across platforms",
      "15 content templates (5 per platform)",
      "Hashtag strategy (15 sets)",
      "18 launch posts (6 per platform)",
      "30-day content calendar",
      "3 platform guides",
      "Link-in-bio page",
    ],
    timeline: "1 to 2 weeks",
    supportPeriod: "Post-delivery: $175/hr",
  },
  {
    id: "full-social-rebrand",
    name: "Full Social Rebrand",
    category: "social-setup",
    price: 3500,
    description: "Complete overhaul for established businesses with outdated social presence.",
    deliverables: [
      "5 platforms — full audit and profile overhaul",
      "Complete social brand kit: 50 templates + story templates + IG highlight icons",
      "Hashtag/SEO strategy (50 sets)",
      "40 launch posts + 4 videos",
      "60-day content calendar",
      "Link-in-bio page",
      "YouTube setup if included",
    ],
    timeline: "2 to 3 weeks",
    supportPeriod: "Post-delivery: $175/hr",
  },

  // ─── Social Management (Monthly) ─────────────────────────────────

  {
    id: "social-starter-mgmt",
    name: "Social Starter",
    category: "social-management",
    price: 1500,
    recurring: true,
    description: "Consistent presence on 1-2 channels.",
    deliverables: [
      "2 platforms managed",
      "16 posts per month (8 per platform)",
      "Scheduling and basic engagement (30 min/day M-F)",
      "Monthly performance report",
      "1 revision round",
      "Hashtag strategy (updated quarterly)",
    ],
    timeline: "Ongoing monthly (3-month minimum)",
    supportPeriod: "Included",
  },
  {
    id: "social-growth-mgmt",
    name: "Social Growth",
    category: "social-management",
    price: 2500,
    recurring: true,
    description: "Growing audience and engagement across multiple platforms.",
    deliverables: [
      "4 platforms managed",
      "48 posts + 4 videos per month",
      "Active engagement (1 hr/day M-F)",
      "Monthly report + Loom walkthrough + 1 optional call (30 min)",
      "Video production (4 short-form)",
      "2 revision rounds",
      "Monthly content strategy",
    ],
    timeline: "Ongoing monthly (6-month minimum)",
    supportPeriod: "Included",
  },
  {
    id: "social-domination-mgmt",
    name: "Social Domination",
    category: "social-management",
    price: 4500,
    recurring: true,
    description: "Full social dominance across all channels.",
    deliverables: [
      "6 platforms managed",
      "120 posts + 8 videos per month",
      "YouTube management (2 long-form videos per month)",
      "Full community management (2 hrs/day M-F)",
      "Weekly analytics + monthly deep-dive + Loom + 1 optional call (30 min)",
      "Video production (8 short + 2 long)",
      "2 revision rounds",
      "Quarterly social strategy",
      "Influencer coordination (5 micro-influencers per month)",
    ],
    timeline: "Ongoing monthly (6-month minimum)",
    supportPeriod: "Included",
  },

  // ─── YouTube Management (Monthly) ────────────────────────────────

  {
    id: "youtube-essentials",
    name: "YouTube Essentials",
    category: "youtube",
    price: 1500,
    recurring: true,
    description: "Core YouTube management with video optimization.",
    deliverables: [
      "4 videos per month",
      "Custom thumbnail design",
      "SEO optimization (titles, descriptions, tags)",
      "Monthly analytics report",
      "1 revision round",
    ],
    timeline: "Ongoing monthly",
    supportPeriod: "Included",
  },
  {
    id: "youtube-growth",
    name: "YouTube Growth",
    category: "youtube",
    price: 3000,
    recurring: true,
    description: "Full YouTube growth with Shorts and channel strategy.",
    deliverables: [
      "8 videos + 2 Shorts per month",
      "A/B thumbnail testing",
      "Channel strategy development",
      "Community tab management",
      "Monthly Loom walkthrough",
      "2 revision rounds",
    ],
    timeline: "Ongoing monthly",
    supportPeriod: "Included",
  },

  // ─── Marketing Retainers (Monthly) ────────────────────────────────

  {
    id: "maintain-monitor",
    name: "Maintain & Monitor",
    category: "marketing-retainers",
    price: 1500,
    recurring: true,
    description: "Peace of mind after launch.",
    deliverables: [
      "Website maintenance and updates",
      "AI chatbot monitoring (10 Q&A updates per month)",
      "Monthly performance report",
      "Design updates (2 hrs/mo, roll over to 4 max)",
      "CRM pipeline management (3 automation adjustments per month)",
      "Text/email support (48hr response, 10 requests per month)",
    ],
    timeline: "Ongoing monthly (3-month minimum)",
    supportPeriod: "Included",
  },
  {
    id: "growth-engine",
    name: "Growth Engine",
    category: "marketing-retainers",
    price: 3500,
    recurring: true,
    description: "Actively scaling revenue with ads and AI content.",
    deliverables: [
      "Everything in Maintain & Monitor",
      "Google Ads management (2 campaigns, up to $5K ad spend managed)",
      "Meta Ads management (2 campaigns, 1 creative refresh per month)",
      "AI content production (4 blogs + 12 social posts per month)",
      "AI system optimization (15 Q&A updates, 1 voice script revision per month)",
      "Monthly Loom strategy video + 1 optional live call (30 min)",
      "Design & development (5 hrs/mo, no rollover)",
    ],
    timeline: "Ongoing monthly (6-month minimum)",
    supportPeriod: "Included",
  },
  {
    id: "full-partnership",
    name: "Full Partnership",
    category: "marketing-retainers",
    price: 7500,
    recurring: true,
    description: "Your dedicated digital team for businesses investing $5K+/mo in ads.",
    deliverables: [
      "Everything in Growth Engine",
      "Dedicated strategist (M-F 9-5, 4hr response during business hours)",
      "Unlimited ad campaigns, up to $20K ad spend managed",
      "AI ecosystem management: 5 agents managed, 2 new workflows per month",
      "Content system: 8 blogs, 20 social posts, 4 short-form videos per month",
      "Monthly strategy meeting (60 min) + weekly Loom updates",
      "Design & development (15 hrs/mo, roll over to 30 max)",
      "Quarterly brand refresh (5 new creative assets)",
    ],
    timeline: "Ongoing monthly (6-month minimum)",
    supportPeriod: "Included",
  },

  // ─── Custom Development (One-Time) ─────────────────────────────

  {
    id: "discovery-scoping",
    name: "Discovery & Scoping",
    category: "custom-development",
    price: 2500,
    description: "Define your project scope, architecture, and roadmap.",
    deliverables: [
      "Kickoff questionnaire + recorded Loom workshop",
      "User flow mapping (5 flows)",
      "Technical architecture document",
      "Wireframes (10 screens)",
      "Scope of Work document",
      "Fixed-price build quote",
    ],
    timeline: "1 to 2 weeks",
    supportPeriod: "Discovery fee credited toward build if you proceed within 30 days",
  },
  {
    id: "standard-build",
    name: "Standard Build",
    category: "custom-development",
    price: 25000,
    description: "Full custom application development from concept to launch.",
    deliverables: [
      "Full UI/UX design (15-30 screens)",
      "Frontend development (Next.js/React/TypeScript)",
      "Backend development (Node.js, PostgreSQL/MongoDB)",
      "Core features per Scope of Work",
      "3 third-party integrations",
      "Hosting & deployment (Vercel + Railway/Render/AWS)",
      "Testing & QA",
      "Documentation and handover",
      "Full code ownership transferred",
    ],
    timeline: "6 to 12 weeks",
    supportPeriod: "30 days post-launch bug fixes",
  },
  {
    id: "enterprise-build",
    name: "Enterprise Build",
    category: "custom-development",
    price: 75000,
    description: "Large-scale enterprise application with advanced requirements.",
    deliverables: [
      "Everything in Standard Build expanded (30-60+ screens)",
      "Advanced architecture (microservices, caching, queues)",
      "AI-powered features",
      "Mobile app (React Native, if included)",
      "6 third-party integrations",
      "Advanced security & compliance",
      "Multi-tenant architecture",
      "Phased delivery (3-4 phases)",
      "Weekly status updates, bi-weekly demo videos, 1 optional call per month",
      "Full code ownership transferred",
    ],
    timeline: "12 to 24 weeks",
    supportPeriod: "45 days post-launch bug fixes per phase",
  },

  // ─── Software Retainers (Monthly) ──────────────────────────────

  {
    id: "dev-support",
    name: "Dev Support",
    category: "dev-retainers",
    price: 1500,
    recurring: true,
    description: "Stable apps needing security, monitoring, and patching.",
    deliverables: [
      "24/7 uptime monitoring",
      "Security maintenance: monthly dependency updates, vulnerability scanning, SSL renewal, backup verification",
      "Bug fixes (5 hrs/mo)",
      "Database management",
      "Monthly health report",
      "Email support (24hr response, 8 requests per month)",
    ],
    timeline: "Ongoing monthly (3-month minimum)",
    supportPeriod: "Included",
  },
  {
    id: "hourly-bank",
    name: "Hourly Bank",
    category: "dev-retainers",
    price: 2500,
    recurring: true,
    description: "Pre-purchased development hours at a discounted rate.",
    deliverables: [
      "10 hrs/mo at $250/hr (20 hrs = $4,500 at $225/hr, 30 hrs = $6,000 at $200/hr, 40+ custom)",
      "Tasks via shared board, time tracked and reported weekly",
      "Unused hours do not roll over",
      "Response: acknowledged within 1 business day",
      "Covers: bug fixes, minor features, UI/UX, database, API, integrations, performance, security, consulting",
    ],
    timeline: "Ongoing monthly (month-to-month, no minimum)",
    supportPeriod: "Included",
  },
  {
    id: "active-development",
    name: "Active Development",
    category: "dev-retainers",
    price: 7500,
    recurring: true,
    description: "Growing platforms shipping new features monthly.",
    deliverables: [
      "Everything in Dev Support",
      "Feature development (35 hrs/mo, rollover to 52 max)",
      "Monthly Loom roadmap review + 1 optional call (60 min)",
      "Shared task board",
      "Design included (3 hrs/mo)",
      "Bi-weekly Loom demo videos",
      "Priority support: 4hr response, 15 requests per month",
      "Quarterly performance review",
    ],
    timeline: "Ongoing monthly (6-month minimum)",
    supportPeriod: "Included",
  },
];

// ─── Add-On Packages ─────────────────────────────────────────────────

export const ADDON_PACKAGES: ServicePackage[] = [
  // ─── Individual AI Agents (A La Carte, $5,000 each) ────────────
  {
    id: "voice-agent",
    name: "Voice Agent",
    category: "ai-agents",
    price: 5000,
    description: "Individual voice AI agent.",
    deliverables: ["1 custom voice AI agent", "Training and integration", "Documentation"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "email-agent",
    name: "Email Agent",
    category: "ai-agents",
    price: 5000,
    description: "Individual email AI agent.",
    deliverables: ["1 custom email AI agent", "Training and integration", "Documentation"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "web-scraping-agent",
    name: "Web Scraping Agent",
    category: "ai-agents",
    price: 5000,
    description: "Individual web scraping AI agent.",
    deliverables: ["1 custom web scraping AI agent", "Training and integration", "Documentation"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "pdf-generator-agent",
    name: "PDF Generator Agent",
    category: "ai-agents",
    price: 5000,
    description: "Individual PDF generator AI agent.",
    deliverables: ["1 custom PDF generator AI agent", "Training and integration", "Documentation"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "customer-support-agent",
    name: "Customer Support Agent",
    category: "ai-agents",
    price: 5000,
    description: "Individual customer support AI agent.",
    deliverables: ["1 custom customer support AI agent", "Training and integration", "Documentation"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "lead-qualification-agent",
    name: "Lead Qualification Agent",
    category: "ai-agents",
    price: 5000,
    description: "Individual lead qualification AI agent.",
    deliverables: ["1 custom lead qualification AI agent", "Training and integration", "Documentation"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "appointment-booking-agent",
    name: "Appointment Booking Agent",
    category: "ai-agents",
    price: 5000,
    description: "Individual appointment booking AI agent.",
    deliverables: ["1 custom appointment booking AI agent", "Training and integration", "Documentation"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "data-processing-agent",
    name: "Data Processing Agent",
    category: "ai-agents",
    price: 5000,
    description: "Individual data processing AI agent.",
    deliverables: ["1 custom data processing AI agent", "Training and integration", "Documentation"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "content-generation-agent",
    name: "Content Generation Agent",
    category: "ai-agents",
    price: 5000,
    description: "Individual content generation AI agent.",
    deliverables: ["1 custom content generation AI agent", "Training and integration", "Documentation"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "social-monitoring-agent",
    name: "Social Monitoring Agent",
    category: "ai-agents",
    price: 5000,
    description: "Individual social monitoring AI agent.",
    deliverables: ["1 custom social monitoring AI agent", "Training and integration", "Documentation"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },

  // ─── Social Media Add-Ons (Monthly per platform — retainer pricing) ──
  {
    id: "addon-instagram",
    name: "Instagram Management",
    category: "social-addons",
    price: 600,
    recurring: true,
    description: "Monthly Instagram management add-on ($950 standalone).",
    deliverables: ["Content creation and posting", "Story management", "Engagement and community management", "Monthly analytics"],
    timeline: "Ongoing monthly",
    supportPeriod: "Included",
  },
  {
    id: "addon-tiktok",
    name: "TikTok Management",
    category: "social-addons",
    price: 700,
    recurring: true,
    description: "Monthly TikTok management add-on ($1,100 standalone).",
    deliverables: ["Short-form video content creation", "Trend monitoring and implementation", "Engagement management", "Monthly analytics"],
    timeline: "Ongoing monthly",
    supportPeriod: "Included",
  },
  {
    id: "addon-linkedin",
    name: "LinkedIn Management",
    category: "social-addons",
    price: 650,
    recurring: true,
    description: "Monthly LinkedIn management add-on ($1,050 standalone).",
    deliverables: ["Professional content creation", "Network engagement", "Thought leadership positioning", "Monthly analytics"],
    timeline: "Ongoing monthly",
    supportPeriod: "Included",
  },
  {
    id: "addon-facebook",
    name: "Facebook Management",
    category: "social-addons",
    price: 450,
    recurring: true,
    description: "Monthly Facebook management add-on ($750 standalone).",
    deliverables: ["Content creation and posting", "Community management", "Event and group management", "Monthly analytics"],
    timeline: "Ongoing monthly",
    supportPeriod: "Included",
  },
  {
    id: "addon-twitter",
    name: "X (Twitter) Management",
    category: "social-addons",
    price: 450,
    recurring: true,
    description: "Monthly X (Twitter) management add-on ($750 standalone).",
    deliverables: ["Content creation and posting", "Real-time engagement", "Trend monitoring", "Monthly analytics"],
    timeline: "Ongoing monthly",
    supportPeriod: "Included",
  },
  {
    id: "addon-pinterest",
    name: "Pinterest Management",
    category: "social-addons",
    price: 400,
    recurring: true,
    description: "Monthly Pinterest management add-on ($650 standalone).",
    deliverables: ["Pin design and scheduling", "Board strategy and optimization", "SEO-optimized descriptions", "Monthly analytics"],
    timeline: "Ongoing monthly",
    supportPeriod: "Included",
  },
  {
    id: "addon-youtube-shorts",
    name: "YouTube Shorts Management",
    category: "social-addons",
    price: 450,
    recurring: true,
    description: "Monthly YouTube Shorts management add-on ($750 standalone).",
    deliverables: ["Short-form video creation", "SEO optimization", "Thumbnail design", "Monthly analytics"],
    timeline: "Ongoing monthly",
    supportPeriod: "Included",
  },

  // ─── General Add-Ons ───────────────────────────────────────────
  {
    id: "additional-pages",
    name: "Additional Website Pages",
    category: "general-addons",
    price: 500,
    description: "Additional pages for your website (per page).",
    deliverables: ["1 additional custom page", "Mobile-responsive design", "SEO optimization"],
    timeline: "2 to 3 days per page",
    supportPeriod: "Included in project support",
  },
  {
    id: "ecommerce-addon",
    name: "E-Commerce (Shopify)",
    category: "general-addons",
    price: 3000,
    description: "Full e-commerce functionality via Shopify integration.",
    deliverables: ["Product catalog setup", "Shopping cart and checkout", "Payment processing integration", "Order management system", "Inventory tracking"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "ai-voice-agent-addon",
    name: "AI Voice Agent",
    category: "general-addons",
    price: 1500,
    description: "Add an AI voice agent to your website or app.",
    deliverables: ["AI voice agent setup", "Custom voice training", "Integration with existing systems"],
    timeline: "1 week",
    supportPeriod: "30 days",
  },
  {
    id: "email-sequences-addon",
    name: "Email Sequences",
    category: "general-addons",
    price: 1200,
    description: "Automated email sequence setup.",
    deliverables: ["Email sequence strategy", "Copywriting for sequence", "Platform setup and automation", "A/B testing setup"],
    timeline: "1 week",
    supportPeriod: "14 days",
  },
  {
    id: "brand-video-addon",
    name: "Brand Video (30s)",
    category: "general-addons",
    price: 1800,
    description: "Professional 30-second brand video.",
    deliverables: ["Script development", "Video production", "Professional editing", "Music and graphics"],
    timeline: "1 to 2 weeks",
    supportPeriod: "1 revision round",
  },
  {
    id: "pitch-deck-addon",
    name: "Pitch Deck",
    category: "general-addons",
    price: 1500,
    description: "Professional pitch deck design.",
    deliverables: ["Pitch deck design (up to 15 slides)", "Custom graphics and charts", "Presentation-ready format"],
    timeline: "1 week",
    supportPeriod: "1 revision round",
  },
  {
    id: "landing-page-addon",
    name: "Landing Page",
    category: "general-addons",
    price: 1400,
    description: "High-converting landing page design and build.",
    deliverables: ["Custom landing page design", "Mobile-responsive build", "CTA optimization", "Analytics tracking"],
    timeline: "3 to 5 days",
    supportPeriod: "Included in project support",
  },
  {
    id: "sms-campaign-addon",
    name: "SMS Campaign",
    category: "general-addons",
    price: 1000,
    description: "SMS marketing campaign setup.",
    deliverables: ["SMS campaign strategy", "Message copywriting", "Platform setup and automation", "Compliance setup"],
    timeline: "3 to 5 days",
    supportPeriod: "14 days",
  },
  {
    id: "crm-migration-addon",
    name: "CRM Migration",
    category: "general-addons",
    price: 1800,
    description: "Migrate your data between CRM platforms.",
    deliverables: ["Data mapping and export", "Import to new CRM", "Pipeline and automation recreation", "Data verification"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "strategy-session-addon",
    name: "Strategy Session",
    category: "general-addons",
    price: 500,
    description: "1-hour strategy consultation session.",
    deliverables: ["60-minute strategy session", "Recorded Loom summary", "Action items document"],
    timeline: "Scheduled within 1 week",
    supportPeriod: "N/A",
  },
  {
    id: "copywriting-addon",
    name: "Copywriting",
    category: "general-addons",
    price: 200,
    description: "Professional copywriting per page.",
    deliverables: ["SEO-optimized copy for 1 page", "1 revision round"],
    timeline: "2 to 3 days",
    supportPeriod: "Included",
  },

  // ─── Development Add-Ons ──────────────────────────────────────
  {
    id: "api-integration",
    name: "API Integration",
    category: "dev-addons",
    price: 3000,
    description: "Connect your application to external APIs.",
    deliverables: ["API authentication setup", "Data mapping and transformation", "Error handling and retry logic", "Integration testing"],
    timeline: "3 to 5 days",
    supportPeriod: "30 days",
  },
  {
    id: "payment-processing",
    name: "Payment Processing (Stripe)",
    category: "dev-addons",
    price: 4000,
    description: "Integrate Stripe payment processing into your application.",
    deliverables: ["Stripe integration", "Checkout flow implementation", "Webhook handling", "Invoice generation", "Subscription management"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "auth-system",
    name: "User Auth & Roles",
    category: "dev-addons",
    price: 3000,
    description: "User authentication and role-based authorization system.",
    deliverables: ["User registration and login", "OAuth/SSO integration", "Role-based access control", "Password reset flows", "Session management"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "email-sms-notifications",
    name: "Email/SMS Notifications",
    category: "dev-addons",
    price: 1500,
    description: "Automated email and SMS notification system.",
    deliverables: ["Email notification system", "SMS notification integration", "Template management", "Delivery tracking"],
    timeline: "3 to 5 days",
    supportPeriod: "30 days",
  },
  {
    id: "file-upload-system",
    name: "File Upload System",
    category: "dev-addons",
    price: 2000,
    description: "Secure file upload and management system.",
    deliverables: ["File upload interface", "Cloud storage integration", "File type validation", "Access control"],
    timeline: "3 to 5 days",
    supportPeriod: "30 days",
  },
  {
    id: "search-filtering",
    name: "Search & Filtering",
    category: "dev-addons",
    price: 2500,
    description: "Advanced search and filtering capabilities.",
    deliverables: ["Full-text search implementation", "Faceted filtering", "Sort and pagination", "Search analytics"],
    timeline: "1 week",
    supportPeriod: "30 days",
  },
  {
    id: "analytics-dashboard",
    name: "Analytics Dashboard",
    category: "dev-addons",
    price: 5000,
    description: "Custom analytics and reporting dashboard.",
    deliverables: ["Dashboard design and build", "Data visualization widgets", "Report generation", "Export capabilities"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "ai-chat-agent-addon",
    name: "AI Chat Agent",
    category: "dev-addons",
    price: 5000,
    description: "AI-powered chat agent integrated into your application.",
    deliverables: ["AI chat agent development", "Training and fine-tuning", "Application integration", "Admin panel"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "mobile-app-addon",
    name: "Mobile App (React Native)",
    category: "dev-addons",
    price: 30000,
    description: "Cross-platform mobile application built with React Native.",
    deliverables: ["iOS and Android app", "UI/UX design", "API integration", "App store deployment", "Push notifications"],
    timeline: "8 to 12 weeks",
    supportPeriod: "45 days",
  },
  {
    id: "database-migration",
    name: "Database Migration",
    category: "dev-addons",
    price: 5000,
    description: "Database architecture migration and optimization.",
    deliverables: ["Schema design", "Data migration scripts", "Performance optimization", "Backup and recovery setup", "Zero-downtime migration"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "performance-audit",
    name: "Performance Audit",
    category: "dev-addons",
    price: 2000,
    description: "Application performance profiling and optimization.",
    deliverables: ["Performance profiling", "Frontend optimization (Core Web Vitals)", "Backend optimization (query performance)", "Caching strategy", "Load testing"],
    timeline: "1 week",
    supportPeriod: "30 days",
  },
  {
    id: "security-audit",
    name: "Security Audit",
    category: "dev-addons",
    price: 4000,
    description: "Comprehensive application security audit.",
    deliverables: ["Vulnerability assessment", "Code review for security issues", "OWASP compliance check", "Security recommendations report"],
    timeline: "1 to 2 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "pen-test-coordination",
    name: "Third-Party Pen Test Coordination",
    category: "dev-addons",
    price: 5000,
    description: "Coordinate and manage third-party penetration testing.",
    deliverables: ["Pen test vendor coordination", "Scope definition", "Remediation support", "Final report review"],
    timeline: "2 to 4 weeks",
    supportPeriod: "30 days",
  },
  {
    id: "white-label-multi-tenant",
    name: "White-Label / Multi-Tenant",
    category: "dev-addons",
    price: 15000,
    description: "White-label or multi-tenant architecture implementation.",
    deliverables: ["Multi-tenant data isolation", "Tenant-specific branding", "Admin portal", "Tenant management system"],
    timeline: "4 to 6 weeks",
    supportPeriod: "45 days",
  },
  {
    id: "cicd-pipeline",
    name: "CI/CD Pipeline Setup",
    category: "dev-addons",
    price: 2500,
    description: "Automated deployment pipeline setup.",
    deliverables: ["CI/CD pipeline configuration", "Automated testing integration", "Staging environment setup", "Deployment automation"],
    timeline: "3 to 5 days",
    supportPeriod: "30 days",
  },
  {
    id: "strategy-consulting-dev",
    name: "Strategy / Consulting",
    category: "dev-addons",
    price: 300,
    description: "Technical strategy and consulting (per hour).",
    deliverables: ["1 hour of expert technical consulting", "Written recommendations"],
    timeline: "Scheduled within 1 week",
    supportPeriod: "N/A",
  },
];

export interface PackageCustomization {
  priceOverride?: number;
  excludedDeliverables?: number[];
}

export interface PaymentMilestone {
  label: string;   // "deposit" | "milestone" | "completion"
  percent: number;  // 1–100
}

export function generateContractBody(
  clientName: string,
  companyName: string | null,
  selectedPackages: string[],
  selectedAddons: string[],
  customItems: CustomLineItem[],
  customTerms?: string,
  packageCustomizations?: Record<string, PackageCustomization>,
  paymentSchedule?: PaymentMilestone[]
): string {
  const packages = SERVICE_PACKAGES.filter((p) => selectedPackages.includes(p.id));
  const addons = ADDON_PACKAGES.filter((a) => selectedAddons.includes(a.id));
  const allItems = [...packages, ...addons];

  const getPrice = (item: ServicePackage) => {
    const c = packageCustomizations?.[item.id];
    return c?.priceOverride != null ? c.priceOverride : item.price;
  };

  const getDeliverables = (item: ServicePackage) => {
    const excluded = packageCustomizations?.[item.id]?.excludedDeliverables;
    if (!excluded || excluded.length === 0) return item.deliverables;
    return item.deliverables.filter((_, i) => !excluded.includes(i));
  };

  const today = new Date();
  const dateStr = today.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  let contract = `SERVICE AGREEMENT

This Service Agreement ("Agreement") is entered into as of ${dateStr} by and between Blok Blok Studio ("Provider") and ${clientName}${companyName ? ` / ${companyName}` : ""} ("Client"). Together referred to as the "Parties."

This Agreement outlines the terms and conditions under which the Provider will deliver the services described below. By signing this Agreement, both Parties acknowledge and accept the obligations set forth herein.

`;

  // ─── SECTION 1: Scope of Services ──────────────────────────────

  contract += `SECTION 1. SCOPE OF SERVICES

The Provider agrees to deliver the following services to the Client:

`;

  allItems.forEach((item, idx) => {
    const letter = String.fromCharCode(65 + idx);
    const price = getPrice(item);
    const deliverables = getDeliverables(item);
    const priceStr = item.recurring
      ? `$${price.toLocaleString()} USD/mo`
      : `$${price.toLocaleString()} USD`;

    contract += `${letter}. ${item.name}    ${priceStr}
   ${item.description}

`;

    if (deliverables.length > 0) {
      contract += `What is included:
`;
      deliverables.forEach((d) => {
        contract += `        • ${d}
`;
      });
      contract += `
`;
    }

    if (item.timeline) {
      contract += `   Estimated timeline: ${item.timeline}
`;
    }
    if (item.supportPeriod) {
      contract += `   Post-launch support: ${item.supportPeriod}
`;
    }
    contract += `
`;
  });

  // Custom line items
  if (customItems.length > 0) {
    customItems.forEach((item, idx) => {
      const letter = String.fromCharCode(65 + allItems.length + idx);
      const priceStr = item.recurring
        ? `$${item.price.toLocaleString()} USD/mo`
        : `$${item.price.toLocaleString()} USD`;
      contract += `${letter}. ${item.name}    ${priceStr}
`;
    });
    contract += `
`;
  }

  // ─── SECTION 2: Total Investment ───────────────────────────────

  contract += `SECTION 2. TOTAL INVESTMENT

`;

  // One-time items
  const oneTimeItems = allItems.filter((i) => !i.recurring);
  const oneTimeCustom = customItems.filter((i) => !i.recurring);
  if (oneTimeItems.length > 0 || oneTimeCustom.length > 0) {
    contract += `One-Time Services:
`;
    oneTimeItems.forEach((item) => {
      const price = getPrice(item);
      contract += `   ${item.name}    $${price.toLocaleString()} USD
`;
    });
    oneTimeCustom.forEach((item) => {
      contract += `   ${item.name}    $${item.price.toLocaleString()} USD
`;
    });
    contract += `
`;
  }

  // Recurring items
  const recurringItems = allItems.filter((i) => i.recurring);
  const recurringCustom = customItems.filter((i) => i.recurring);
  if (recurringItems.length > 0 || recurringCustom.length > 0) {
    contract += `Recurring Monthly Services:
`;
    recurringItems.forEach((item) => {
      const price = getPrice(item);
      contract += `   ${item.name}    $${price.toLocaleString()} USD/mo
`;
    });
    recurringCustom.forEach((item) => {
      contract += `   ${item.name}    $${item.price.toLocaleString()} USD/mo
`;
    });
    contract += `
`;
  }

  // Totals
  const oneTimeTotal =
    oneTimeItems.reduce((sum, i) => sum + getPrice(i), 0) +
    oneTimeCustom.reduce((sum, i) => sum + i.price, 0);
  const recurringTotal =
    recurringItems.reduce((sum, i) => sum + getPrice(i), 0) +
    recurringCustom.reduce((sum, i) => sum + i.price, 0);

  if (oneTimeTotal > 0) {
    contract += `Total    $${oneTimeTotal.toLocaleString()} USD
`;
  }
  if (recurringTotal > 0) {
    contract += `Total    $${recurringTotal.toLocaleString()} USD/mo
`;
  }

  // ─── SECTION 3: Payment Terms ──────────────────────────────────

  contract += `

SECTION 3. PAYMENT TERMS

`;

  if (oneTimeTotal > 0) {
    if (paymentSchedule && paymentSchedule.length > 0) {
      contract += `One-time project payments are structured as follows:\n`;
      for (const milestone of paymentSchedule) {
        const amount = Math.round((oneTimeTotal * milestone.percent) / 100);
        const label = milestone.label === "deposit"
          ? "Deposit due upon signing of this Agreement to initiate work"
          : milestone.label === "milestone"
          ? "Milestone payment due upon completion of project milestone"
          : "Final balance due upon project completion (Net 7)";
        contract += `- ${milestone.percent}% ${label}: $${amount.toLocaleString()} USD\n`;
      }
      contract += `\n`;
    } else {
      contract += `One-time project payments are structured as follows:
- 50% deposit due upon signing of this Agreement to initiate work.
- Remaining balance due upon project completion (Net 7).

`;
    }
  }

  if (recurringTotal > 0 && oneTimeTotal === 0) {
    contract += `Monthly services are billed on a recurring basis. The first payment of $${recurringTotal.toLocaleString()} USD is due upon signing of this Agreement. Subsequent invoices will be issued on the 1st of each month and are due within 7 days of receipt (Net 7).

Either party may cancel recurring services with 30 days written notice. Cancellation takes effect at the end of the current billing cycle.

`;
  } else if (recurringTotal > 0) {
    contract += `Recurring services are billed monthly. The first payment is due upon signing of this Agreement. Subsequent invoices will be issued on the 1st of each month and are due within 7 days of receipt (Net 7).

`;
  }

  contract += `Late payments may incur a 1.5% monthly fee on outstanding balances after 14 days.

`;

  // ─── SECTION 4: Revisions & Change Orders ─────────────────────

  contract += `SECTION 4. REVISIONS AND CHANGE ORDERS

Each deliverable includes the revision rounds specified in its scope above. Additional revisions or out-of-scope requests will be handled as change orders at the Provider's standard rate. Change orders require written approval before work begins.

`;

  // ─── SECTION 5: Timeline & Delivery ───────────────────────────

  contract += `SECTION 5. TIMELINE AND DELIVERY

Estimated timelines are provided for each service above. Timelines begin upon receipt of the initial deposit and all required materials from the Client. Delays caused by the Client (including late feedback, missing assets, or scope changes) may extend timelines without additional cost to the Provider.

`;

  // ─── SECTION 6: Client Responsibilities ───────────────────────

  contract += `SECTION 6. CLIENT RESPONSIBILITIES

The Client agrees to:
- Provide all necessary content, assets, and access credentials in a timely manner.
- Respond to requests for feedback or approval within 5 business days.
- Designate a primary point of contact for the duration of this engagement.

Failure to meet these responsibilities may result in project delays and/or additional charges.

`;

  // ─── SECTION 7: Intellectual Property ─────────────────────────

  contract += `SECTION 7. INTELLECTUAL PROPERTY

Upon receipt of final payment, all custom work product created under this Agreement — including code, designs, and content — becomes the sole property of the Client, unless otherwise stated.

The Provider retains the right to display the work in its portfolio and marketing materials unless the Client requests otherwise in writing.

`;

  // ─── SECTION 8: Confidentiality ───────────────────────────────

  contract += `SECTION 8. CONFIDENTIALITY

Both Parties agree to keep confidential any proprietary information shared during the course of this engagement. This includes but is not limited to business strategies, technical architecture, customer data, API credentials, and financial information.

`;

  // ─── SECTION 9: Termination ───────────────────────────────────

  contract += `SECTION 9. TERMINATION

Either Party may terminate this Agreement with 30 days written notice. In the event of termination:
- The Client is responsible for payment for all work completed up to the termination date.
- Any deposits paid for unstarted work will be refunded within 14 business days.
- For recurring services, cancellation takes effect at the end of the current billing period.

`;

  // ─── SECTION 10: Limitation of Liability ──────────────────────

  contract += `SECTION 10. LIMITATION OF LIABILITY

The Provider's total liability under this Agreement shall not exceed the total fees paid by the Client under this Agreement. The Provider shall not be liable for any indirect, incidental, special, or consequential damages.

`;

  // ─── Custom Terms ────────────────────────────────────────────

  if (customTerms) {
    contract += `SECTION 11. ADDITIONAL TERMS

${customTerms}

`;
  }

  contract += `

ACKNOWLEDGMENT AND ACCEPTANCE

By signing below, both Parties acknowledge that they have read this Agreement in its entirety, understand its terms and conditions, and agree to be bound by them. Both Parties confirm that they have the authority to enter into this Agreement and that they do so voluntarily.

PROVIDER:
Name: ____________________
Date: ____________________

CLIENT:
Name: ____________________
Date: ____________________

`;

  return contract;
}
