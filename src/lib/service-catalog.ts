// 2026 service catalog for the Services tracker — mirrors the published
// rate card (blokblok-pricing-2026-eur.pdf). Prices in EUR, excl. VAT.
// One-time packages have recurring: false; retainers are recurring.
// `unit` overrides the price suffix for per-page/per-video/per-hour items.

export interface CatalogService {
  id: string;
  name: string;
  category: ServiceCategory;
  price: number;
  recurring?: boolean;
  /** e.g. "page", "video", "hour" — shown as €X/page instead of a flat price */
  unit?: string;
  /** "from" pricing — the listed price is a starting point */
  fromPrice?: boolean;
}

export type ServiceCategory =
  | "website"
  | "care"
  | "social-video"
  | "outreach"
  | "addons";

export const SERVICE_CATEGORIES: { id: ServiceCategory; label: string }[] = [
  { id: "website", label: "Website" },
  { id: "care", label: "Care Retainers" },
  { id: "social-video", label: "Social Video" },
  { id: "outreach", label: "Social Outreach" },
  { id: "addons", label: "Add-Ons" },
];

export const SERVICE_CATALOG: CatalogService[] = [
  // ─── Website Packages (one-time) ───
  { id: "web-launch", name: "Launch — Single Page Site", category: "website", price: 5000 },
  { id: "web-essential", name: "Essential — 4-5 Page Site", category: "website", price: 10000 },
  { id: "web-growth", name: "Growth — 10-15 Page Site", category: "website", price: 16000 },
  { id: "web-scale", name: "Scale — 40+ Page Site", category: "website", price: 25000, fromPrice: true },

  // ─── Monthly Retainers ───
  { id: "care-plan", name: "Care Plan", category: "care", price: 200, recurring: true },
  { id: "care-plus", name: "Care Plus", category: "care", price: 500, recurring: true },
  { id: "care-pro", name: "Care Pro", category: "care", price: 1000, recurring: true },

  // ─── Social Video Packs (one-time; many clients run them monthly — tick
  // "Monthly recurring" on the service when they do) ───
  { id: "video-starter", name: "Video Pack Starter — 6 Videos", category: "social-video", price: 500 },
  { id: "video-creator", name: "Video Pack Creator — 12 Videos", category: "social-video", price: 900 },
  { id: "video-momentum", name: "Video Pack Momentum — 20 Videos", category: "social-video", price: 1400 },
  { id: "video-authority", name: "Video Pack Authority — 30 Videos", category: "social-video", price: 1900 },
  { id: "video-dominate", name: "Video Pack Dominate — 45 Videos", category: "social-video", price: 2600 },
  { id: "video-studio", name: "Video Pack Studio — 60 Videos", category: "social-video", price: 3000 },
  { id: "video-custom", name: "Custom Videos", category: "social-video", price: 100, unit: "video" },

  // ─── Social Outreach (monthly) ───
  { id: "outreach-starter", name: "Outreach Starter", category: "outreach", price: 500, recurring: true },
  { id: "outreach-pro", name: "Outreach Pro", category: "outreach", price: 1000, recurring: true },
  { id: "outreach-engine", name: "Outreach Engine", category: "outreach", price: 2000, recurring: true },

  // ─── Add-Ons ───
  { id: "brand-design", name: "Brand & Design Package", category: "addons", price: 1000 },
  { id: "copywriting", name: "Copywriting", category: "addons", price: 200, unit: "page" },
  { id: "seo-boost", name: "SEO Boost", category: "addons", price: 2000, fromPrice: true },
  { id: "sales-funnel", name: "Sales Funnel", category: "addons", price: 2000 },
  { id: "extra-pages", name: "Extra Pages", category: "addons", price: 750, unit: "page" },
  { id: "custom-cms", name: "Custom CMS", category: "addons", price: 3000, fromPrice: true },
  { id: "custom-software", name: "Custom Web Software", category: "addons", price: 12000, fromPrice: true },
  { id: "hourly", name: "Hourly Work (outside retainer)", category: "addons", price: 125, unit: "hour" },
];

export const serviceCategoryLabel = (id: string | null) =>
  SERVICE_CATEGORIES.find((c) => c.id === id)?.label || null;

/** €1,400 · €200/mo · €750/page · from €2,000 */
export const catalogPriceLabel = (s: CatalogService) => {
  const base = `€${s.price.toLocaleString()}`;
  const suffix = s.unit ? `/${s.unit}` : s.recurring ? "/mo" : "";
  return `${s.fromPrice ? "from " : ""}${base}${suffix}`;
};
