import { NextResponse } from "next/server";

// Cache exchange rate for 1 hour in memory
let cached: { rate: number; fetchedAt: number } | null = null;
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function getUsdToEurRate(): Promise<number> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.rate;
  }

  // frankfurter.app — free, open source, no API key, powered by ECB data
  const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR", {
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    // Fallback to last cached value or a reasonable default
    if (cached) return cached.rate;
    return 0.92; // fallback
  }

  const data = await res.json();
  const rate = data.rates?.EUR;

  if (typeof rate === "number") {
    cached = { rate, fetchedAt: Date.now() };
    return rate;
  }

  return cached?.rate ?? 0.92;
}

export async function GET() {
  try {
    const rate = await getUsdToEurRate();
    return NextResponse.json({
      success: true,
      rate,
      from: "USD",
      to: "EUR",
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
      },
    });
  } catch {
    return NextResponse.json({
      success: true,
      rate: cached?.rate ?? 0.92,
      from: "USD",
      to: "EUR",
    });
  }
}
