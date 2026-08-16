import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import {
  getSession,
  hashPassword,
  createSessionToken,
  getSessionCookieConfig,
} from "@/lib/auth";
import { isAllowedBlobUrl } from "@/lib/blob-fetch";
import { requestMeta } from "@/lib/request-meta";

// Self-service account settings for the signed-in user (any role).
//
// action "update"   → name / color / avatarUrl — cosmetic, no password gate
// action "email"    → change login email (password-gated, unique check)
// action "password" → change password (current password required)
//
// The session JWT embeds name + email, so those changes re-issue the cookie in
// the same response — otherwise the stale token would keep showing old values
// (and Slack/@-mention lookups would drift) until the next login.

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, name: true, email: true, role: true, color: true, avatarUrl: true, jobRole: true },
  });
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  return NextResponse.json({ success: true, data: user });
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { action } = body as { action?: string };

  const user = await prisma.user.findUnique({ where: { id: session.id } });
  if (!user || !user.isActive)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const meta = requestMeta(request);

  if (action === "update") {
    const { name, color, avatarUrl } = body as {
      name?: string;
      color?: string | null;
      avatarUrl?: string | null;
    };
    const data: { name?: string; color?: string | null; avatarUrl?: string | null } = {};

    if (name !== undefined) {
      const trimmed = typeof name === "string" ? name.trim() : "";
      if (!trimmed || trimmed.length > 80)
        return NextResponse.json({ error: "Name must be 1-80 characters" }, { status: 400 });
      data.name = trimmed;
    }

    if (color !== undefined) {
      const c = typeof color === "string" ? color.trim() : "";
      if (c && !/^#[0-9a-fA-F]{6}$/.test(c))
        return NextResponse.json({ error: "Color must be a hex value like #FF6B00" }, { status: 400 });
      data.color = c || null;
    }

    if (avatarUrl !== undefined) {
      const url = typeof avatarUrl === "string" ? avatarUrl.trim() : "";
      if (url && !isAllowedBlobUrl(url))
        return NextResponse.json({ error: "Unsupported file location" }, { status: 400 });
      data.avatarUrl = url || null;
    }

    if (Object.keys(data).length === 0)
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
      select: { id: true, name: true, email: true, role: true, color: true, avatarUrl: true },
    });

    const response = NextResponse.json({ success: true, data: updated });
    if (data.name && data.name !== user.name) {
      response.cookies.set(
        getSessionCookieConfig(
          createSessionToken({ id: updated.id, email: updated.email, name: updated.name, role: updated.role })
        )
      );
    }
    return response;
  }

  if (action === "email") {
    const { password, email } = body as { password?: string; email?: string };
    if (!password || typeof password !== "string" || !bcrypt.compareSync(password, user.passwordHash))
      return NextResponse.json({ error: "Incorrect password." }, { status: 403 });

    const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))
      return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
    if (normalized === user.email)
      return NextResponse.json({ error: "That is already your email" }, { status: 400 });

    const taken = await prisma.user.findUnique({ where: { email: normalized } });
    if (taken)
      return NextResponse.json({ error: "That email is already in use" }, { status: 400 });

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { email: normalized },
      select: { id: true, name: true, email: true, role: true },
    });

    await prisma.activityLog.create({
      data: {
        actor: user.name,
        action: "account_email_changed",
        details: `${user.name} changed their login email from ${user.email} to ${normalized}${meta.ipAddress ? ` (IP: ${meta.ipAddress})` : ""}`,
      },
    });

    const response = NextResponse.json({ success: true, data: updated });
    response.cookies.set(
      getSessionCookieConfig(
        createSessionToken({ id: updated.id, email: updated.email, name: updated.name, role: updated.role })
      )
    );
    return response;
  }

  if (action === "password") {
    const { currentPassword, newPassword } = body as {
      currentPassword?: string;
      newPassword?: string;
    };
    if (
      !currentPassword ||
      typeof currentPassword !== "string" ||
      !bcrypt.compareSync(currentPassword, user.passwordHash)
    )
      return NextResponse.json({ error: "Incorrect current password." }, { status: 403 });

    if (typeof newPassword !== "string" || newPassword.length < 8)
      return NextResponse.json({ error: "New password must be at least 8 characters" }, { status: 400 });
    if (newPassword === currentPassword)
      return NextResponse.json({ error: "New password must be different" }, { status: 400 });

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(newPassword) },
    });

    await prisma.activityLog.create({
      data: {
        actor: user.name,
        action: "account_password_changed",
        details: `${user.name} changed their password${meta.ipAddress ? ` (IP: ${meta.ipAddress})` : ""}`,
      },
    });

    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
