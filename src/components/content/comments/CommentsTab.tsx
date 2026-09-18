"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Heart, Loader2, MessageCircle, RefreshCw, Send } from "lucide-react";
import { useToast } from "@/components/shared/Toast";
import { readJson } from "@/lib/fetch-json";
import { cn } from "@/lib/utils";

interface Reply {
  id: string;
  text: string;
  username: string;
  timestamp: string;
  own: boolean;
}

interface Comment extends Reply {
  likeCount: number;
  replies: Reply[];
  answered: boolean;
}

interface InboxPost {
  postId: string;
  clientId: string;
  clientName: string;
  account: string | null;
  caption: string;
  publishedAt: string | null;
  externalUrl: string | null;
  comments: Comment[];
  error?: string;
}

const field =
  "w-full bg-bb-elevated border border-bb-border rounded-lg px-3 py-2.5 sm:py-2 text-base sm:text-sm text-white placeholder:text-bb-dim focus:outline-none focus:border-bb-orange";

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / (60 * 24))}d`;
}

export default function CommentsTab({ clients }: { clients: { id: string; name: string }[] }) {
  const { toast } = useToast();
  const [clientId, setClientId] = useState("");
  const [posts, setPosts] = useState<InboxPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/social/comments${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ""}`);
      const result = await readJson<{ data: InboxPost[] }>(res, "Couldn't load comments.");
      if (result.ok && result.data) setPosts(result.data.data);
      else toast(result.error || "Couldn't load comments.", "error");
    } catch {
      toast("Couldn't load comments.", "error");
    } finally {
      setLoading(false);
    }
  }, [clientId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const reply = async (post: InboxPost, comment: Comment) => {
    const message = (drafts[comment.id] || "").trim();
    if (!message || sending) return;
    setSending(comment.id);
    try {
      const res = await fetch("/api/social/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.postId, commentId: comment.id, message }),
      });
      const result = await readJson<{ data: { id: string } }>(res, "Couldn't send the reply.");
      if (!result.ok || !result.data) {
        toast(result.error || "Couldn't send the reply.", "error");
        return;
      }
      const added: Reply = { id: result.data.data.id || `local-${Date.now()}`, text: message, username: post.account || "you", timestamp: new Date().toISOString(), own: true };
      setPosts((list) =>
        list.map((p) =>
          p.postId !== post.postId ? p : { ...p, comments: p.comments.map((c) => (c.id === comment.id ? { ...c, answered: true, replies: [...c.replies, added] } : c)) }
        )
      );
      setDrafts((d) => ({ ...d, [comment.id]: "" }));
    } finally {
      setSending(null);
    }
  };

  const openCount = posts.reduce((n, p) => n + p.comments.filter((c) => !c.answered).length, 0);
  const visible = posts
    .map((p) => ({ ...p, comments: onlyOpen ? p.comments.filter((c) => !c.answered) : p.comments }))
    .filter((p) => p.comments.length > 0 || (p.error && !onlyOpen));
  const failed = posts.filter((p) => p.error).length;

  return (
    <div className="space-y-4">
      <section className="bg-bb-surface border border-bb-border rounded-xl p-4 space-y-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-medium text-white">
            <MessageCircle size={15} className="text-bb-orange" /> Instagram comments
          </h2>
          <p className="text-xs text-bb-dim mt-1 max-w-xl">
            Comments on Instagram posts the scheduler published in the last 45 days (the newest 20 posts), read live from Instagram. Replies go out as the client&apos;s
            account. Posts marked as posted by hand aren&apos;t covered, and TikTok doesn&apos;t share comments with outside apps.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} aria-label="Client" className={cn(field, "sm:w-56")}>
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <div className="flex gap-1.5">
            {[
              { value: true, label: `Needs a reply${loading ? "" : ` (${openCount})`}` },
              { value: false, label: "All" },
            ].map((o) => (
              <button
                key={o.label}
                type="button"
                onClick={() => setOnlyOpen(o.value)}
                className={cn(
                  "px-3 py-2 sm:py-1.5 rounded-full border text-xs transition-colors cursor-pointer",
                  onlyOpen === o.value ? "border-bb-orange/60 bg-bb-orange/10 text-white" : "border-bb-border text-bb-muted hover:text-white"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={load} disabled={loading} className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 sm:py-1.5 rounded-lg border border-bb-border text-xs text-bb-muted hover:text-white transition-colors cursor-pointer disabled:opacity-50">
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
          </button>
        </div>
        {failed > 0 && !loading && (
          <p className="text-xs text-amber-300">
            {failed} post{failed === 1 ? "" : "s"} couldn&apos;t be read. Switch to All to see why; a connection may need a reconnect.
          </p>
        )}
      </section>

      {loading ? (
        <div className="flex justify-center py-16 text-bb-dim">
          <Loader2 size={20} className="animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-bb-surface border border-bb-border rounded-xl p-8 text-center">
          <CheckCircle2 size={22} className="text-emerald-400 mx-auto mb-2" />
          <p className="text-sm text-white">{posts.length === 0 ? "No Instagram posts published through the scheduler in the last 45 days." : onlyOpen ? "Every comment has a reply." : "No comments yet."}</p>
        </div>
      ) : (
        visible.map((post) => (
          <section key={post.postId} className="bg-bb-surface border border-bb-border rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-bb-dim">
                  {post.clientName}
                  {post.account ? ` · @${post.account}` : ""}
                  {post.publishedAt ? ` · ${new Date(post.publishedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : ""}
                </p>
                <p className="text-sm text-white truncate">{post.caption || "(no caption)"}</p>
              </div>
              {post.externalUrl && (
                <a href={post.externalUrl} target="_blank" rel="noopener noreferrer" aria-label="Open the post" title="Open the post" className="p-2 -m-1 text-bb-muted hover:text-bb-orange transition-colors shrink-0">
                  <ExternalLink size={15} />
                </a>
              )}
            </div>
            {post.error && <p className="text-xs text-red-300 break-words">{post.error}</p>}

            <ul className="space-y-3">
              {post.comments.map((c) => (
                <li key={c.id} className="rounded-lg border border-bb-border bg-bb-elevated/40 p-3 space-y-2">
                  <div>
                    <p className="text-xs text-bb-dim">
                      <span className="text-bb-muted font-medium">@{c.username}</span> · {ago(c.timestamp)}
                      {c.likeCount > 0 && (
                        <span className="inline-flex items-center gap-0.5 ml-2">
                          <Heart size={10} /> {c.likeCount}
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-white whitespace-pre-wrap break-words">{c.text}</p>
                  </div>
                  {c.replies.length > 0 && (
                    <ul className="pl-3 border-l border-bb-border space-y-1.5">
                      {c.replies.map((r) => (
                        <li key={r.id}>
                          <p className="text-[11px] text-bb-dim">
                            <span className={r.own ? "text-bb-orange" : "text-bb-muted"}>@{r.username}</span> · {ago(r.timestamp)}
                          </p>
                          <p className="text-xs text-bb-muted whitespace-pre-wrap break-words">{r.text}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={drafts[c.id] || ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                      onKeyDown={(e) => e.key === "Enter" && reply(post, c)}
                      placeholder={`Reply as ${post.account ? `@${post.account}` : "the account"}`}
                      aria-label={`Reply to ${c.username}`}
                      maxLength={2200}
                      className={cn(field, "flex-1 min-w-0")}
                    />
                    <button
                      type="button"
                      onClick={() => reply(post, c)}
                      disabled={!(drafts[c.id] || "").trim() || sending !== null}
                      aria-label="Send reply"
                      className="shrink-0 inline-flex items-center justify-center w-11 sm:w-10 rounded-lg bg-bb-orange text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {sending === c.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
