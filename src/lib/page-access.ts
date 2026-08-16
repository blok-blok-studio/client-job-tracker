/**
 * The tabs a member's access can be limited to.
 *
 * One list, used by the Team page (the toggles) and by the users API (the
 * validation). They used to be maintained separately and drifted: the UI
 * offered Services and Deliverables, the API rejected them, and picking either
 * failed with "Invalid page list". Keep this in step with the sidebar.
 *
 * Keys are the first URL segment — that is what PageGuard and the sidebar
 * filter on. Dashboard ("/") is always allowed; Team, Money, and Contracts are
 * owner-only (finances stay private to Chase) and so are not grantable here.
 */
export const PAGE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: "clients", label: "Clients" },
  { key: "services", label: "Services" },
  { key: "kanban", label: "Kanban" },
  { key: "my-tasks", label: "My Tasks" },
  { key: "calendar", label: "Calendar" },
  { key: "content", label: "Content" },
  { key: "newsletter", label: "Newsletter" },
  { key: "files", label: "Files" },
  { key: "deliverables", label: "Deliverables" },
  { key: "contractors", label: "Contractors" },
  { key: "compliance", label: "Compliance" },
  { key: "automations", label: "Automations" },
  { key: "vault", label: "Vault" },
  { key: "security", label: "Security" },
  { key: "activity", label: "Activity" },
  { key: "reports", label: "Reports" },
  { key: "monthly-reports", label: "Monthly Reports" },
  { key: "support", label: "Support" },
];

/**
 * Owner-only pages: never offered as member toggles, but kept valid so page
 * lists saved before the lockdown still parse. The server-side gates (routes +
 * page layouts) are what actually enforce this — a stale grant is inert.
 */
const LEGACY_OWNER_ONLY_PAGES = ["money", "contracts"];

export const VALID_PAGES: string[] = [...PAGE_OPTIONS.map((p) => p.key), ...LEGACY_OWNER_ONLY_PAGES];

export function isValidPageList(pages: unknown): pages is string[] {
  return Array.isArray(pages) && pages.every((p) => typeof p === "string" && VALID_PAGES.includes(p));
}
