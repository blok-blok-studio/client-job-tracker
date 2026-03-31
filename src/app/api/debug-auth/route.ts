import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";

export async function GET() {
  const hash = process.env.AUTH_PASSWORD_HASH;
  const testPassword = "blokblok2026";

  return NextResponse.json({
    hashExists: !!hash,
    hashLength: hash?.length,
    hashPrefix: hash?.substring(0, 7),
    hashHasQuotes: hash?.startsWith('"') || hash?.startsWith("'"),
    hashFirstChar: hash?.charCodeAt(0),
    hashLastChar: hash?.charCodeAt((hash?.length || 1) - 1),
    compareResult: hash ? bcrypt.compareSync(testPassword, hash) : "no hash",
    // Try trimming
    compareTrimmed: hash ? bcrypt.compareSync(testPassword, hash.trim()) : "no hash",
  });
}
