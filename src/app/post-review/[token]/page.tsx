"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { Check, CheckCheck, Loader2, Pencil, ThumbsUp } from "lucide-react";
import PostReviewCard, { type Draft, type ReviewPost } from "@/components/post-review/PostReviewCard";
import { safeTimeZone } from "@/components/content/handoff/zoned-time";

interface ReviewData {
  clientName: string;
  company: string | null;
  timezone: string | null;
  title: string | null;
  message: string | null;
  status: string;
  respondedAt: string | null;
  posts: ReviewPost[];
}

export default function PostReviewPage() {
  const { token } = useParams<{ token: string }>();
  const [review, setReview] = useState<ReviewData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/post-review/${token}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "This review link isn't available.");
      setReview(data.data);
    } catch (err) {
      setLoadError((err as Error).message);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError) {
    return (
      <div className="min-h-screen bg-bb-black flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <Image src="/bb_logo_wordmark_subhead_WHT_PNG.png" alt="Blok Blok Studio" width={180} height={60} className="mx-auto mb-6" />
          <p className="text-bb-muted text-sm">{loadError}</p>
        </div>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="min-h-screen bg-bb-black flex items-center justify-center">
        <Loader2 className="animate-spin text-bb-orange" size={28} />
      </div>
    );
  }

  const tz = safeTimeZone(review.timezone);
  const firstName = review.clientName.split(" ")[0];
  const open = review.posts.filter((p) => p.decision === "PENDING" && !p.published);
  const decidedHere = open.filter((p) => drafts[p.id]).length;
  const changes = open.filter((p) => drafts[p.id]?.decision === "CHANGES_REQUESTED");
  const missingNotes = changes.filter((p) => !drafts[p.id].note.trim()).length;
  const allDone = open.length === 0;
  const approvedCount = review.posts.filter((p) => p.decision === "APPROVED").length;
  const changesCount = review.posts.filter((p) => p.decision === "CHANGES_REQUESTED").length;

  const approveAll = () => {
    setDrafts((d) => {
      const next = { ...d };
      for (const p of open) if (!next[p.id]) next[p.id] = { decision: "APPROVED", note: "" };
      return next;
    });
  };

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/post-review/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || undefined,
          decisions: open
            .filter((p) => drafts[p.id])
            .map((p) => ({
              postId: p.id,
              decision: drafts[p.id].decision,
              note: drafts[p.id].note.trim() || undefined,
            })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) throw new Error(data.error || "Something went wrong. Please try again.");
      setDrafts({});
      setJustSubmitted(true);
      await load();
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-bb-black">
      <div className="max-w-xl mx-auto px-4 py-8 sm:py-12">
        <div className="text-center mb-8">
          <Image
            src="/bb_logo_wordmark_subhead_WHT_PNG.png"
            alt="Blok Blok Studio"
            width={200}
            height={67}
            className="mx-auto mb-8"
          />
          <h1 className="text-2xl font-display font-semibold text-white">
            {review.title || "Your upcoming posts"}
          </h1>
          {!allDone && (
            <p className="text-bb-muted mt-2 text-sm sm:text-base">
              Hi {firstName}, here {open.length === 1 ? "is the post" : `are ${open.length} posts`} we have planned. Approve each one or tell us what to change, then send your review at the bottom.
            </p>
          )}
          {!tz && review.posts.some((p) => p.scheduledAt) && (
            <p className="text-bb-dim text-xs mt-2">Times are shown in your device&apos;s time zone.</p>
          )}
        </div>

        {(allDone || justSubmitted) && (
          <div
            className={`border rounded-xl p-6 mb-8 text-center space-y-3 ${
              changesCount > 0 ? "bg-bb-orange/5 border-bb-orange/30" : "bg-emerald-500/5 border-emerald-500/30"
            }`}
          >
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${
                changesCount > 0 ? "bg-bb-orange/10" : "bg-emerald-500/10"
              }`}
            >
              {changesCount > 0 ? <Pencil className="text-bb-orange" size={24} /> : <Check className="text-emerald-400" size={28} />}
            </div>
            <h2 className="text-xl font-display font-semibold text-white">Thanks, we got your review</h2>
            <p className="text-bb-muted text-sm max-w-md mx-auto">
              {changesCount > 0
                ? `${approvedCount > 0 ? `${approvedCount} approved. ` : ""}We'll make the changes you asked for on ${changesCount} post${changesCount === 1 ? "" : "s"} and hold ${changesCount === 1 ? "it" : "them"} until ${changesCount === 1 ? "it's" : "they're"} right.`
                : "Everything is approved. We'll post on schedule."}
            </p>
            {!allDone && <p className="text-bb-dim text-xs">There are still posts below waiting on you.</p>}
          </div>
        )}

        {review.message && (
          <div className="bg-bb-surface border border-bb-border rounded-xl p-5 mb-6">
            <p className="text-xs font-medium text-bb-dim uppercase tracking-wide mb-2">A note from Blok Blok Studio</p>
            <p className="text-sm text-bb-muted leading-relaxed whitespace-pre-wrap">{review.message}</p>
          </div>
        )}

        {open.length > 1 && (
          <div className="sticky top-3 z-10 mb-6">
            <div className="bg-bb-surface/95 backdrop-blur border border-bb-border rounded-full pl-4 pr-2 py-1.5 flex items-center justify-between gap-3 shadow-lg">
              <span className="text-xs text-bb-muted">
                {decidedHere} of {open.length} marked
                {changes.length > 0 && <span className="text-bb-orange"> · {changes.length} for changes</span>}
              </span>
              <button
                type="button"
                onClick={approveAll}
                disabled={decidedHere === open.length}
                className="flex items-center gap-1 text-xs text-bb-muted hover:text-emerald-400 disabled:opacity-40 px-2 py-1 transition-colors"
              >
                <CheckCheck size={13} /> Approve the rest
              </button>
            </div>
          </div>
        )}

        <div className="space-y-6 mb-8">
          {review.posts.map((post) => (
            <PostReviewCard
              key={post.id}
              post={post}
              timeZone={tz}
              draft={drafts[post.id]}
              locked={post.decision !== "PENDING" || post.published}
              onChange={(draft) =>
                setDrafts((d) => {
                  const next = { ...d };
                  if (draft) next[post.id] = draft;
                  else delete next[post.id];
                  return next;
                })
              }
            />
          ))}
        </div>

        {!allDone && (
          <div className="bg-bb-surface border border-bb-orange/30 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-display font-semibold text-white">Send your review</h2>
            <p className="text-sm text-bb-muted">
              {decidedHere === 0
                ? "Mark at least one post above, then send."
                : missingNotes > 0
                  ? `Add a note to the ${missingNotes} post${missingNotes === 1 ? "" : "s"} that need${missingNotes === 1 ? "s" : ""} changes.`
                  : decidedHere < open.length
                    ? `You've marked ${decidedHere} of ${open.length}. You can send these now and come back for the rest.`
                    : changes.length > 0
                      ? "We'll hold the posts you want changed and get to work."
                      : "Everything's approved. Send it and we'll post on schedule."}
            </p>
            <div>
              <label className="block text-sm text-bb-muted mb-1.5 font-medium">
                Your name <span className="text-bb-dim font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`e.g. ${firstName}`}
                className="w-full px-4 py-3 bg-bb-black border border-bb-border rounded-lg text-white placeholder:text-bb-dim focus:outline-none focus:border-bb-orange text-sm"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="button"
              onClick={submit}
              disabled={submitting || decidedHere === 0 || missingNotes > 0}
              className={`w-full flex items-center justify-center gap-2 py-3 font-semibold rounded-xl transition-colors disabled:opacity-50 text-sm sm:text-base text-white ${
                changes.length > 0 ? "bg-bb-orange hover:bg-bb-orange-light" : "bg-emerald-600 hover:bg-emerald-500"
              }`}
            >
              {submitting ? <Loader2 className="animate-spin" size={18} /> : changes.length > 0 ? <Pencil size={16} /> : <ThumbsUp size={18} />}
              Send review
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
