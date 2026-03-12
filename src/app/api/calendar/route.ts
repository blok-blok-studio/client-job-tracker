import { NextRequest, NextResponse } from "next/server";
import { getBookings, isCalComConfigured } from "@/lib/calcom";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const afterStart = searchParams.get("afterStart") || undefined;
  const beforeEnd = searchParams.get("beforeEnd") || undefined;

  const configured = isCalComConfigured();

  if (!configured) {
    return NextResponse.json({
      success: true,
      data: [],
      configured: false,
    });
  }

  try {
    // Fetch upcoming and recurring bookings
    const [upcoming, recurring] = await Promise.all([
      getBookings({ afterStart, beforeEnd, status: "upcoming" }),
      getBookings({ afterStart, beforeEnd, status: "recurring" }),
    ]);
    const bookings = [...upcoming, ...recurring];

    return NextResponse.json({
      success: true,
      data: bookings,
      configured: true,
    });
  } catch (error) {
    console.error("Calendar API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch calendar data" },
      { status: 500 }
    );
  }
}
