/**
 * Cal.com API v2 integration for fetching bookings and event types.
 */

const CAL_API_BASE = "https://api.cal.com/v2";
const CAL_API_VERSION = "2024-08-13";

function getApiKey(): string | null {
  return process.env.CALCOM_API_KEY || null;
}

function getHeaders(): Record<string, string> {
  const apiKey = getApiKey();
  if (!apiKey) throw new Error("CALCOM_API_KEY is not configured");
  return {
    Authorization: `Bearer ${apiKey}`,
    "cal-api-version": CAL_API_VERSION,
    "Content-Type": "application/json",
  };
}

export interface CalBooking {
  id: number;
  uid: string;
  title: string;
  description: string | null;
  start: string;
  end: string;
  duration: number; // minutes
  status: string;
  attendees: Array<{
    name: string;
    email: string;
    timeZone: string;
  }>;
  hosts: Array<{
    name: string;
    email: string;
  }>;
  location: string | null;
  meetingUrl: string | null;
  eventTypeId: number;
  eventType?: {
    id: number;
    slug: string;
  };
}

export interface CalEventType {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  length: number; // in minutes
  locations: Array<{ type: string }>;
}

/**
 * Fetch bookings from Cal.com, optionally filtered by date range.
 */
export async function getBookings(options?: {
  afterStart?: string;
  beforeEnd?: string;
  status?: string;
}): Promise<CalBooking[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  const params = new URLSearchParams();
  if (options?.afterStart) params.set("afterStart", options.afterStart);
  if (options?.beforeEnd) params.set("beforeEnd", options.beforeEnd);
  if (options?.status) params.set("status", options.status);

  const url = `${CAL_API_BASE}/bookings${params.toString() ? `?${params}` : ""}`;

  try {
    const res = await fetch(url, {
      headers: getHeaders(),
      next: { revalidate: 300 }, // cache for 5 minutes
    });

    if (!res.ok) {
      console.error(`Cal.com API error: ${res.status} ${res.statusText}`);
      return [];
    }

    const json = await res.json();
    return json.data || [];
  } catch (error) {
    console.error("Failed to fetch Cal.com bookings:", error);
    return [];
  }
}

/**
 * Fetch event types from Cal.com.
 */
export async function getEventTypes(): Promise<CalEventType[]> {
  const apiKey = getApiKey();
  if (!apiKey) return [];

  try {
    const res = await fetch(`${CAL_API_BASE}/event-types`, {
      headers: getHeaders(),
      next: { revalidate: 3600 }, // cache for 1 hour
    });

    if (!res.ok) {
      console.error(`Cal.com API error: ${res.status} ${res.statusText}`);
      return [];
    }

    const json = await res.json();
    return json.data || [];
  } catch (error) {
    console.error("Failed to fetch Cal.com event types:", error);
    return [];
  }
}

/**
 * Check if Cal.com is configured.
 */
export function isCalComConfigured(): boolean {
  return !!getApiKey();
}
