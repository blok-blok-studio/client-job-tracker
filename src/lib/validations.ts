import { z } from "zod";

// Accepts ISO 8601 date strings or rejects invalid formats
const dateString = z.string().refine(
  (val) => !isNaN(Date.parse(val)),
  { message: "Invalid date format" }
);

export const clientSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  phone: z.string().optional().or(z.literal("")),
  company: z.string().optional().or(z.literal("")),
  type: z.enum(["PROSPECT", "ACTIVE", "PAST", "ARCHIVED"]).optional(),
  tier: z.enum(["VIP", "STANDARD", "TRIAL"]).optional(),
  source: z.string().optional().or(z.literal("")),
  industry: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  monthlyRetainer: z.number().min(0).nullable().optional(),
  contractStart: dateString.nullable().optional(),
  contractEnd: dateString.nullable().optional(),
  timezone: z.string().optional(),
});

export const contactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  role: z.string().optional().or(z.literal("")),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  isPrimary: z.boolean().optional(),
  notes: z.string().optional().or(z.literal("")),
});

export const taskSchema = z.object({
  clientId: z.string().optional().nullable(),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().or(z.literal("")),
  status: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED"]).optional(),
  priority: z.enum(["URGENT", "HIGH", "MEDIUM", "LOW"]).optional(),
  category: z
    .enum([
      "GENERAL", "CONTENT_CREATION", "SOCIAL_MEDIA", "CLIENT_COMMS",
      "REPORTING", "STRATEGY", "INVOICING", "ONBOARDING",
      "OFFBOARDING", "DEVELOPMENT", "DESIGN",
    ])
    .optional(),
  dueDate: dateString.nullable().optional(),
  assignedTo: z.string().optional(),
  isRecurring: z.boolean().optional(),
  recurPattern: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export const credentialSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  platform: z.string().min(1, "Platform is required"),
  label: z.string().optional().or(z.literal("")),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  url: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

export const SOCIAL_PLATFORMS = ["INSTAGRAM", "TIKTOK", "TWITTER", "LINKEDIN", "YOUTUBE", "FACEBOOK"] as const;
export const CONTENT_POST_STATUSES = ["DRAFT", "SCHEDULED", "PUBLISHING", "PUBLISHED", "FAILED"] as const;

export const contentPostSchema = z.object({
  clientId: z.string().min(1, "Client is required"),
  credentialId: z.string().nullable().optional(),
  platform: z.enum(SOCIAL_PLATFORMS),
  status: z.enum(CONTENT_POST_STATUSES).optional(),
  title: z.string().optional().or(z.literal("")),
  body: z.string().optional().or(z.literal("")),
  hashtags: z.array(z.string()).optional().default([]),
  mediaUrls: z.array(z.string()).optional().default([]),
  scheduledAt: dateString.nullable().optional(),

  // Location
  location: z.string().nullable().optional(),
  locationLat: z.number().nullable().optional(),
  locationLng: z.number().nullable().optional(),

  // People & Collaboration
  taggedUsers: z.array(z.string()).optional().default([]),
  collaborators: z.array(z.string()).optional().default([]),

  // Media enhancements
  altText: z.string().nullable().optional(),
  coverImageUrl: z.string().nullable().optional(),
  thumbnailUrl: z.string().nullable().optional(),

  // First comment
  firstComment: z.string().nullable().optional(),

  // Platform settings
  platformSettings: z.record(z.string(), z.unknown()).nullable().optional(),

  // Content management
  visibility: z.string().nullable().optional(),
  enableComments: z.boolean().optional().default(true),
});

export const reorderSchema = z.object({
  updates: z.array(
    z.object({
      id: z.string(),
      sortOrder: z.number(),
      status: z.enum(["BACKLOG", "TODO", "IN_PROGRESS", "IN_REVIEW", "DONE", "BLOCKED"]),
    })
  ),
});
