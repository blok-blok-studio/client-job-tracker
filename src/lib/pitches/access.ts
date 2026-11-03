import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getSession, type SessionUser } from "@/lib/auth";
import prisma from "@/lib/prisma";

export interface PitchUser extends SessionUser { isOwner: boolean; email: string }

/** Signed in, active, and either the owner or a member who has the Pitches tab. */
export async function requirePitchUser(): Promise<{ user: PitchUser; denied: null } | { user: null; denied: NextResponse }> {
  const no = (status: number, error: string) => ({ user: null, denied: NextResponse.json({ success: false, error }, { status }) });
  const session = await getSession();
  if (!session) return no(401, "Sign in again");
  const u = await prisma.user.findUnique({ where: { id: session.id }, select: { role: true, isActive: true, allowedPages: true, name: true, email: true } });
  if (!u || !u.isActive) return no(401, "Sign in again");
  const isOwner = u.role === "OWNER";
  if (!isOwner && u.allowedPages.length > 0 && !u.allowedPages.includes("pitches")) return no(403, "You don't have the Pitches tab");
  return { user: { ...session, name: u.name, email: u.email, isOwner }, denied: null };
}

export function canEdit(user: PitchUser, pitch: { authorId: string }) {
  return user.isOwner || pitch.authorId === user.id;
}

export function pitchError(err: unknown, fallback: string) {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    const where = first?.path?.length ? `${first.path.join(".")}: ` : "";
    return NextResponse.json({ success: false, error: `${where}${first?.message || "Invalid input"}` }, { status: 400 });
  }
  console.error(`[pitches] ${fallback}:`, err);
  return NextResponse.json({ success: false, error: fallback }, { status: 500 });
}

export const notFound = () => NextResponse.json({ success: false, error: "Pitch not found" }, { status: 404 });
export const notYours = () => NextResponse.json({ success: false, error: "Only the author or Chase can change this pitch" }, { status: 403 });
