import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * Suggests hashtags based on post content and historical usage.
 * Uses keyword extraction + trending hashtags from previously published posts.
 * No external API dependency — works entirely from local data.
 */

// Common stop words to exclude from keyword extraction
const STOP_WORDS = new Set([
  "the", "be", "to", "of", "and", "a", "in", "that", "have", "i",
  "it", "for", "not", "on", "with", "he", "as", "you", "do", "at",
  "this", "but", "his", "by", "from", "they", "we", "say", "her",
  "she", "or", "an", "will", "my", "one", "all", "would", "there",
  "their", "what", "so", "up", "out", "if", "about", "who", "get",
  "which", "go", "me", "when", "make", "can", "like", "time", "no",
  "just", "him", "know", "take", "people", "into", "year", "your",
  "good", "some", "could", "them", "see", "other", "than", "then",
  "now", "look", "only", "come", "its", "over", "think", "also",
  "back", "after", "use", "two", "how", "our", "work", "first",
  "well", "way", "even", "new", "want", "because", "any", "these",
  "give", "day", "most", "us", "is", "are", "was", "were", "been",
  "has", "had", "did", "does", "am", "being", "very", "really",
  "more", "here", "still", "too", "much", "where", "should",
]);

// Platform-specific popular hashtag suggestions by niche keywords
const PLATFORM_HASHTAGS: Record<string, Record<string, string[]>> = {
  INSTAGRAM: {
    business: ["entrepreneur", "smallbusiness", "hustle", "startup", "businessowner"],
    marketing: ["digitalmarketing", "socialmedia", "contentcreator", "branding", "marketingtips"],
    design: ["graphicdesign", "uidesign", "creative", "designinspiration", "art"],
    food: ["foodie", "foodphotography", "instafood", "recipe", "cooking"],
    fitness: ["fitnessmotivation", "workout", "gym", "healthylifestyle", "fitlife"],
    travel: ["travelgram", "wanderlust", "explore", "adventure", "instatravel"],
    tech: ["technology", "coding", "developer", "innovation", "ai"],
    photo: ["photography", "photooftheday", "instagood", "picoftheday", "instadaily"],
  },
  TWITTER: {
    business: ["startup", "entrepreneurship", "business", "growth"],
    marketing: ["marketing", "socialmedia", "digital", "SEO"],
    tech: ["tech", "AI", "coding", "webdev", "opensource"],
  },
  LINKEDIN: {
    business: ["leadership", "innovation", "networking", "careers", "professionaldevelopment"],
    marketing: ["contentmarketing", "B2B", "digitalstrategy", "thoughtleadership"],
    tech: ["artificialintelligence", "machinelearning", "cloudcomputing", "cybersecurity"],
  },
  TIKTOK: {
    general: ["fyp", "foryou", "foryoupage", "viral", "trending"],
    business: ["smallbusinesscheck", "entrepreneurlife", "businesstiktok"],
  },
};

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
}

function matchNiche(keywords: string[], platform: string): string[] {
  const platformTags = PLATFORM_HASHTAGS[platform] || PLATFORM_HASHTAGS.INSTAGRAM;
  const matched: string[] = [];

  for (const [niche, tags] of Object.entries(platformTags)) {
    const nicheKeywords = niche.split(/[\s_]+/);
    const hasOverlap = nicheKeywords.some((nk) =>
      keywords.some((k) => k.includes(nk) || nk.includes(k))
    );
    if (hasOverlap) {
      matched.push(...tags);
    }
  }

  // Also match keywords that look like they'd be good hashtags
  for (const keyword of keywords) {
    if (keyword.length >= 4 && keyword.length <= 20) {
      matched.push(keyword);
    }
  }

  return [...new Set(matched)];
}

export async function POST(request: NextRequest) {
  try {
    const { platform, title, body, existingHashtags = [] } = await request.json();

    if (!platform) {
      return NextResponse.json({ success: false, error: "Platform is required" }, { status: 400 });
    }

    const combinedText = [title, body].filter(Boolean).join(" ");
    if (!combinedText.trim()) {
      return NextResponse.json({ success: true, hashtags: [] });
    }

    const keywords = extractKeywords(combinedText);

    // Get niche-matched suggestions
    const nicheTags = matchNiche(keywords, platform);

    // Get historically successful hashtags from the same platform
    const recentPosts = await prisma.contentPost.findMany({
      where: {
        platform,
        status: "PUBLISHED",
        hashtags: { isEmpty: false },
      },
      select: { hashtags: true },
      orderBy: { publishedAt: "desc" },
      take: 50,
    });

    // Count hashtag frequency in historical data
    const tagFrequency: Record<string, number> = {};
    for (const post of recentPosts) {
      for (const tag of post.hashtags) {
        const lower = tag.toLowerCase().replace(/^#/, "");
        tagFrequency[lower] = (tagFrequency[lower] || 0) + 1;
      }
    }

    // Sort historical tags by popularity
    const popularTags = Object.entries(tagFrequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag]) => tag);

    // Combine and deduplicate, excluding already-used tags
    const existingSet = new Set(existingHashtags.map((t: string) => t.toLowerCase().replace(/^#/, "")));
    const allSuggestions = [...new Set([...nicheTags, ...popularTags])]
      .filter((t) => !existingSet.has(t))
      .slice(0, 15);

    return NextResponse.json({ success: true, hashtags: allSuggestions });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to suggest hashtags";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
