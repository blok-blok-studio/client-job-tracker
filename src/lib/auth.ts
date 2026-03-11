import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

const SESSION_COOKIE = "bb_session";
const SESSION_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

export function verifyPassword(plaintext: string): boolean {
  const hash = process.env.AUTH_PASSWORD_HASH;
  if (!hash) throw new Error("AUTH_PASSWORD_HASH is not set");
  return bcrypt.compareSync(plaintext, hash);
}

export function createSessionToken(): string {
  return jwt.sign(
    { user: "chase", iat: Math.floor(Date.now() / 1000) },
    getAuthSecret(),
    { expiresIn: SESSION_EXPIRY }
  );
}

export function verifySessionToken(token: string): { user: string } | null {
  try {
    const payload = jwt.verify(token, getAuthSecret()) as { user: string };
    return payload;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<{ user: string } | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export function getSessionCookieConfig(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: SESSION_EXPIRY,
    path: "/",
  };
}

export function getLogoutCookieConfig() {
  return {
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: 0,
    path: "/",
  };
}

// Rate limiting for login attempts
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000; // 1 minute

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= MAX_ATTEMPTS) return false;

  entry.count++;
  return true;
}
