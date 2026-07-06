import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import type { UserRole } from "@prisma/client";

const SESSION_COOKIE = "bb_session";
const SESSION_EXPIRY = 7 * 24 * 60 * 60; // 7 days in seconds
const BCRYPT_ROUNDS = 12;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

export function hashPassword(plaintext: string): string {
  return bcrypt.hashSync(plaintext, BCRYPT_ROUNDS);
}

/**
 * Authenticate a team member by email + password.
 *
 * Bootstrap: while no users exist yet, the legacy single-password env var
 * (AUTH_PASSWORD_HASH) still works. The first successful bootstrap login
 * provisions the owner account in the database, after which env-based login
 * is disabled and all logins are per-user.
 */
export async function authenticateUser(
  email: string,
  password: string
): Promise<SessionUser | null> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) return null;

  const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

  if (user) {
    if (!user.isActive) return null;
    if (!bcrypt.compareSync(password, user.passwordHash)) return null;

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return { id: user.id, email: user.email, name: user.name, role: user.role };
  }

  // No matching user — allow one-time bootstrap from the legacy env password.
  const bootstrap = await maybeBootstrapOwner(normalizedEmail, password);
  return bootstrap;
}

async function maybeBootstrapOwner(
  email: string,
  password: string
): Promise<SessionUser | null> {
  const legacyHash = process.env.AUTH_PASSWORD_HASH;
  if (!legacyHash) return null;

  // Only bootstrap when the database has no users at all.
  const userCount = await prisma.user.count();
  if (userCount > 0) return null;

  if (!bcrypt.compareSync(password, legacyHash)) return null;

  const ownerEmail = (process.env.OWNER_EMAIL || email).trim().toLowerCase();
  const ownerName = process.env.OWNER_NAME || "Owner";

  const owner = await prisma.user.create({
    data: {
      email: ownerEmail,
      name: ownerName,
      passwordHash: legacyHash,
      role: "OWNER",
      lastLoginAt: new Date(),
    },
  });

  return { id: owner.id, email: owner.email, name: owner.name, role: owner.role };
}

export function createSessionToken(user: SessionUser): string {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
    },
    getAuthSecret(),
    { expiresIn: SESSION_EXPIRY }
  );
}

export function verifySessionToken(token: string): SessionUser | null {
  try {
    const payload = jwt.verify(token, getAuthSecret()) as {
      sub: string;
      email: string;
      name: string;
      role: UserRole;
    };
    if (!payload?.sub) return null;
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
  } catch {
    return null;
  }
}

export async function getSession(): Promise<SessionUser | null> {
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
    sameSite: "lax" as const,
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
    sameSite: "lax" as const,
    maxAge: 0,
    path: "/",
  };
}

// Rate limiting for login attempts — strict to prevent brute force
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  // Periodic cleanup
  if (loginAttempts.size > 1000) {
    for (const [key, val] of loginAttempts) {
      if (now > val.resetAt) loginAttempts.delete(key);
    }
  }

  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true };
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count++;
  return { allowed: true };
}
