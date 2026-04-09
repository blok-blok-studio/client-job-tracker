import { NextResponse } from "next/server";
import { put, del } from "@vercel/blob";
import heicConvert from "heic-convert";
import prisma from "@/lib/prisma";
import crypto from "crypto";

/**
 * One-time migration: convert all existing HEIC/HEIF files to JPEG.
 * Updates references in ContentPost.mediaUrls and ClientMedia.url.
 *
 * Hit GET /api/migrate-heic to run.
 */
export async function GET() {
  const results: string[] = [];

  try {
    // 1. Find all ContentPosts with HEIC URLs in mediaUrls
    const posts = await prisma.contentPost.findMany({
      where: {
        NOT: { mediaUrls: { equals: [] } },
      },
      select: { id: true, mediaUrls: true },
    });

    // Filter to posts that actually have .heic/.heif URLs
    const heicPosts = posts.filter((p) =>
      p.mediaUrls.some((url) => /\.heic|\.heif/i.test(url))
    );

    for (const post of heicPosts) {
      const newUrls: string[] = [];
      let changed = false;

      for (const url of post.mediaUrls) {
        if (/\.heic|\.heif/i.test(url)) {
          try {
            const converted = await convertHeicUrl(url);
            newUrls.push(converted.newUrl);
            changed = true;
            results.push(`ContentPost ${post.id}: ${url} -> ${converted.newUrl}`);
            // Delete old blob
            await del(url).catch(() => {});
          } catch (err) {
            results.push(`ContentPost ${post.id}: FAILED ${url} - ${err}`);
            newUrls.push(url); // keep original on failure
          }
        } else {
          newUrls.push(url);
        }
      }

      if (changed) {
        await prisma.contentPost.update({
          where: { id: post.id },
          data: { mediaUrls: newUrls },
        });
      }
    }

    // 2. Find all ClientMedia with HEIC URLs
    const heicMedia = await prisma.clientMedia.findMany({
      where: {
        OR: [
          { mimeType: "image/heic" },
          { mimeType: "image/heif" },
          { url: { contains: ".heic" } },
          { url: { contains: ".heif" } },
        ],
      },
      select: { id: true, url: true, filename: true },
    });

    for (const media of heicMedia) {
      try {
        const converted = await convertHeicUrl(media.url);
        await prisma.clientMedia.update({
          where: { id: media.id },
          data: {
            url: converted.newUrl,
            mimeType: "image/jpeg",
            filename: media.filename.replace(/\.heic|\.heif/gi, ".jpg"),
          },
        });
        results.push(`ClientMedia ${media.id}: ${media.url} -> ${converted.newUrl}`);
        // Delete old blob
        await del(media.url).catch(() => {});
      } catch (err) {
        results.push(`ClientMedia ${media.id}: FAILED ${media.url} - ${err}`);
      }
    }

    return NextResponse.json({
      success: true,
      converted: results.length,
      details: results,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: String(err), details: results },
      { status: 500 }
    );
  }
}

async function convertHeicUrl(url: string): Promise<{ newUrl: string }> {
  // Download the HEIC file
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  // Convert to JPEG
  const converted = await heicConvert({ buffer, format: "JPEG", quality: 0.9 });
  const jpegBuffer = Buffer.from(converted);

  // Upload as JPEG
  const id = crypto.randomUUID();
  const filename = `media/${id}.jpg`;
  const blob = await put(filename, jpegBuffer, {
    access: "public",
    contentType: "image/jpeg",
  });

  return { newUrl: blob.url };
}
