import { VALID_PAGES } from "@/lib/page-access";

/**
 * What each person actually does here, and the tabs that job needs.
 *
 * Picking a role applies its `pages` as the member's allowed tabs — a starting
 * point, not a cage: the per-tab toggles still win, so you can hand someone one
 * extra tab without inventing a new role. An empty `pages` array means full
 * access (that's how the tab system already reads "no restrictions").
 */
export interface TeamRole {
  key: string;
  label: string;
  /** Tabs this role gets by default; [] = everything */
  pages: string[];
  blurb: string;
}

export const TEAM_ROLES: TeamRole[] = [
  {
    key: "owner-operator",
    label: "Owner / Operator",
    pages: [],
    blurb: "Runs the studio — every tab, no restrictions.",
  },
  {
    key: "marketing-strategist",
    label: "Marketing Strategist",
    pages: [
      "clients",
      "content",
      "newsletter",
      "calendar",
      "kanban",
      "my-tasks",
      "files",
      "reports",
      "monthly-reports",
    ],
    blurb: "Campaigns, content calendar, newsletter, and the reporting that proves it worked.",
  },
  {
    key: "full-stack-dev",
    label: "Full Stack Developer",
    pages: [
      "clients",
      "kanban",
      "my-tasks",
      "calendar",
      "files",
      "deliverables",
      "vault",
      "support",
    ],
    blurb: "Builds and ships. Vault is included — deploys need client credentials.",
  },
  {
    key: "creative-director",
    label: "Creative Director",
    pages: [
      "clients",
      "content",
      "files",
      "deliverables",
      "kanban",
      "my-tasks",
      "calendar",
    ],
    blurb: "Design and brand work, from concept through client review.",
  },
  {
    key: "producer",
    label: "Producer / PM",
    pages: [
      "clients",
      "kanban",
      "my-tasks",
      "calendar",
      "deliverables",
      "files",
      "content",
      "reports",
      "support",
      "contractors",
    ],
    blurb: "Keeps work moving: schedules, deliverables, contractors, client comms.",
  },
  {
    key: "bookkeeper",
    label: "Bookkeeper / Finance",
    // No Money tab: finances are owner-only. A bookkeeper works the contractor
    // and compliance queues; dollar figures stay with the owner.
    pages: ["clients", "contractors", "compliance", "reports", "monthly-reports"],
    blurb: "Contractor queue, compliance calendar, and reports (amounts stay owner-only).",
  },
  {
    key: "other",
    label: "Other / Custom",
    pages: [],
    blurb: "No preset — set their tabs by hand.",
  },
];

export const TEAM_ROLE_KEYS = TEAM_ROLES.map((r) => r.key);

export function getTeamRole(key: string | null | undefined): TeamRole | null {
  if (!key) return null;
  return TEAM_ROLES.find((r) => r.key === key) || null;
}

export function teamRoleLabel(key: string | null | undefined): string | null {
  return getTeamRole(key)?.label ?? null;
}

/**
 * Tabs to grant for a role. Unknown pages are dropped rather than trusted, so a
 * preset can never widen access past what the page list allows.
 */
export function pagesForRole(key: string | null | undefined): string[] {
  const role = getTeamRole(key);
  if (!role) return [];
  return role.pages.filter((p) => VALID_PAGES.includes(p));
}
