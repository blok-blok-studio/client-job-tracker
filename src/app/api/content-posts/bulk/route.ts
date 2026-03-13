import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

/**
 * Bulk import content posts from CSV data.
 *
 * Expected CSV columns (header row required):
 *   clientId, platform, title, body, hashtags, scheduledAt, mediaUrls
 *
 * - hashtags: semicolon-separated (e.g. "tag1;tag2;tag3")
 * - mediaUrls: semicolon-separated
 * - scheduledAt: ISO 8601 or "YYYY-MM-DD HH:mm" format
 * - platform: INSTAGRAM, TIKTOK, TWITTER, LINKEDIN, YOUTUBE, FACEBOOK
 */

const VALID_PLATFORMS = new Set(["INSTAGRAM", "TIKTOK", "TWITTER", "LINKEDIN", "YOUTUBE", "FACEBOOK"]);
const MAX_ROWS = 200;

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Parse header
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length && i <= MAX_ROWS; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] || "").trim();
    });
    rows.push(row);
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);

  return values.map((v) => v.replace(/^"|"$/g, "").trim());
}

export async function POST(request: NextRequest) {
  // Rate limit: 5 bulk imports per minute
  const ip = getClientIp(request);
  const rl = rateLimit(ip, { max: 5, windowMs: 60_000, prefix: "bulk-import" });
  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Rate limit exceeded for bulk imports" },
      { status: 429 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    let csvText: string;

    if (file) {
      csvText = await file.text();
    } else {
      // Try JSON body with CSV text
      const body = await request.text();
      try {
        const json = JSON.parse(body);
        csvText = json.csv;
      } catch {
        csvText = body;
      }
    }

    if (!csvText?.trim()) {
      return NextResponse.json(
        { success: false, error: "No CSV data provided" },
        { status: 400 }
      );
    }

    const rows = parseCSV(csvText);
    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: "CSV has no data rows (header row required)" },
        { status: 400 }
      );
    }

    // Validate client IDs exist
    const clientIds = [...new Set(rows.map((r) => r.clientId).filter(Boolean))];
    const existingClients = await prisma.client.findMany({
      where: { id: { in: clientIds } },
      select: { id: true },
    });
    const validClientIds = new Set(existingClients.map((c) => c.id));

    const results: { row: number; status: "created" | "error"; error?: string; postId?: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed + header

      if (!row.clientId || !validClientIds.has(row.clientId)) {
        results.push({ row: rowNum, status: "error", error: `Invalid clientId: ${row.clientId || "(empty)"}` });
        continue;
      }

      const platform = (row.platform || "").toUpperCase();
      if (!VALID_PLATFORMS.has(platform)) {
        results.push({ row: rowNum, status: "error", error: `Invalid platform: ${row.platform || "(empty)"}` });
        continue;
      }

      const hashtags = (row.hashtags || "")
        .split(";")
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean);

      const mediaUrls = (row.mediaUrls || "")
        .split(";")
        .map((u) => u.trim())
        .filter(Boolean);

      let scheduledAt: Date | null = null;
      if (row.scheduledAt) {
        const parsed = new Date(row.scheduledAt);
        if (isNaN(parsed.getTime())) {
          results.push({ row: rowNum, status: "error", error: `Invalid date: ${row.scheduledAt}` });
          continue;
        }
        scheduledAt = parsed;
      }

      try {
        const post = await prisma.contentPost.create({
          data: {
            clientId: row.clientId,
            platform: platform as "INSTAGRAM" | "TIKTOK" | "TWITTER" | "LINKEDIN" | "YOUTUBE" | "FACEBOOK",
            status: scheduledAt ? "SCHEDULED" : "DRAFT",
            title: row.title || null,
            body: row.body || null,
            hashtags,
            mediaUrls,
            scheduledAt,
          },
        });
        results.push({ row: rowNum, status: "created", postId: post.id });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        results.push({ row: rowNum, status: "error", error: msg });
      }
    }

    const created = results.filter((r) => r.status === "created").length;
    const errors = results.filter((r) => r.status === "error").length;

    await prisma.activityLog.create({
      data: {
        actor: "chase",
        action: "bulk_import",
        details: `Bulk imported ${created} posts (${errors} errors) from CSV`,
      },
    });

    return NextResponse.json({
      success: true,
      imported: created,
      errors,
      total: rows.length,
      results,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Bulk import failed";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
