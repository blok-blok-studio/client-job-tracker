// Re-export Prisma types once schema is generated
// These are supplementary types used across the application

export type ClientType = "PROSPECT" | "ACTIVE" | "PAST" | "ARCHIVED";
export type ClientTier = "VIP" | "STANDARD" | "TRIAL";
export type TaskStatus = "BACKLOG" | "TODO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "BLOCKED";
export type Priority = "URGENT" | "HIGH" | "MEDIUM" | "LOW";
export type TaskCategory =
  | "GENERAL"
  | "CONTENT_CREATION"
  | "SOCIAL_MEDIA"
  | "CLIENT_COMMS"
  | "REPORTING"
  | "STRATEGY"
  | "INVOICING"
  | "ONBOARDING"
  | "OFFBOARDING"
  | "DEVELOPMENT"
  | "DESIGN";
export type InvoiceStatus = "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";

export interface ActionResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export interface AgentAction {
  action: string;
  [key: string]: unknown;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface TaskReorderUpdate {
  id: string;
  sortOrder: number;
  status: TaskStatus;
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  URGENT: "#EF4444",
  HIGH: "#FF6B00",
  MEDIUM: "#3B82F6",
  LOW: "#666666",
};

export const STATUS_COLUMNS: { key: TaskStatus; label: string }[] = [
  { key: "BACKLOG", label: "Backlog" },
  { key: "TODO", label: "To Do" },
  { key: "IN_PROGRESS", label: "In Progress" },
  { key: "IN_REVIEW", label: "In Review" },
  { key: "DONE", label: "Done" },
  { key: "BLOCKED", label: "Blocked" },
];

export const TASK_CATEGORIES: { key: TaskCategory; label: string }[] = [
  { key: "GENERAL", label: "General" },
  { key: "CONTENT_CREATION", label: "Content Creation" },
  { key: "SOCIAL_MEDIA", label: "Social Media" },
  { key: "CLIENT_COMMS", label: "Client Comms" },
  { key: "REPORTING", label: "Reporting" },
  { key: "STRATEGY", label: "Strategy" },
  { key: "INVOICING", label: "Invoicing" },
  { key: "ONBOARDING", label: "Onboarding" },
  { key: "OFFBOARDING", label: "Offboarding" },
  { key: "DEVELOPMENT", label: "Development" },
  { key: "DESIGN", label: "Design" },
];

export const PLATFORM_OPTIONS = [
  "Instagram",
  "LinkedIn",
  "Meta Business",
  "TikTok",
  "Canva",
  "Google",
  "Twitter/X",
  "YouTube",
  "Shopify",
  "WordPress",
  "GitHub",
  "Figma",
  "Slack",
  "Other",
];
