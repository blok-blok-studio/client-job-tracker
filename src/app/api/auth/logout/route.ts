import { NextResponse } from "next/server";
import { getLogoutCookieConfig } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.set(getLogoutCookieConfig());
  return response;
}
