// Service catalog for the Services tracker — simple labels only, no prices
// (prices shift; the tracker just answers "which client is on what").
// Names can also be typed free-form for anything not listed here.

export interface CatalogService {
  id: string;
  name: string;
  category: ServiceCategory;
}

export type ServiceCategory =
  | "website"
  | "care"
  | "social-video"
  | "outreach"
  | "addons";

export const SERVICE_CATEGORIES: { id: ServiceCategory; label: string }[] = [
  { id: "website", label: "Website" },
  { id: "care", label: "Care / Maintenance" },
  { id: "social-video", label: "Social Video" },
  { id: "outreach", label: "Social Outreach" },
  { id: "addons", label: "Add-Ons" },
];

export const SERVICE_CATALOG: CatalogService[] = [
  { id: "website-design", name: "Website Design", category: "website" },
  { id: "website-care", name: "Website Care / Maintenance", category: "care" },
  { id: "social-videos", name: "Social Media Videos / Carousels", category: "social-video" },
  { id: "social-outreach", name: "Social Outreach", category: "outreach" },
  { id: "seo", name: "SEO", category: "addons" },
  { id: "brand-design", name: "Brand & Design", category: "addons" },
  { id: "copywriting", name: "Copywriting", category: "addons" },
  { id: "sales-funnel", name: "Sales Funnel", category: "addons" },
  { id: "custom-software", name: "Custom Web Software", category: "addons" },
  { id: "hourly", name: "Hourly Work", category: "addons" },
];

export const serviceCategoryLabel = (id: string | null) =>
  SERVICE_CATEGORIES.find((c) => c.id === id)?.label || null;
