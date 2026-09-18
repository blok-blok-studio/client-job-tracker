import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { listInstagramComments, replyToInstagramComment } from "@/lib/social/comments";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/social/comments?clientId= — comments on recent Instagram posts, read live
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("clientId");
  try {
    const posts = await listInstagramComments(clientId);
    return NextResponse.json({ success: true, data: posts });
  } catch (err) {
    console.error("[comments] list failed:", err);
    return NextResponse.json({ success: false, error: "Couldn't load comments." }, { status: 500 });
  }
}

// POST — reply to a comment as the connected account. Body: { postId, commentId, message }
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request" }, { status: 400 });
  }

  const postId = typeof body.postId === "string" ? body.postId : "";
  const commentId = typeof body.commentId === "string" ? body.commentId : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!postId || !/^\d+$/.test(commentId)) return NextResponse.json({ success: false, error: "Invalid comment" }, { status: 400 });
  if (!message) return NextResponse.json({ success: false, error: "Write a reply first." }, { status: 400 });
  if (message.length > 2200) return NextResponse.json({ success: false, error: "Replies max out at 2,200 characters." }, { status: 400 });

  try {
    const id = await replyToInstagramComment(postId, commentId, message);
    const [session, post] = await Promise.all([getSession(), prisma.contentPost.findUnique({ where: { id: postId }, select: { clientId: true } })]);
    if (post) {
      await prisma.activityLog
        .create({ data: { clientId: post.clientId, actor: session?.name || "team", action: "content_comment_replied", details: `Replied to an Instagram comment: "${message.slice(0, 120)}"` } })
        .catch(() => {});
    }
    return NextResponse.json({ success: true, data: { id } }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't send the reply.";
    return NextResponse.json({ success: false, error: message.slice(0, 300) }, { status: 502 });
  }
}
