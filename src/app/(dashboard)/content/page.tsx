"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  List,
  Plus,
  Clock,
  Trash2,
  Edit3,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import Badge from "@/components/shared/Badge";
import PlatformIcon, { getPlatformLabel, PLATFORM_COLORS } from "@/components/content/PlatformIcon";
import ContentPostModal from "@/components/content/ContentPostModal";
import { cn } from "@/lib/utils";
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  parseISO,
} from "date-fns";

interface ContentPost {
  id: string;
  clientId: string;
  client: { id: string; name: string };
  platform: string;
  status: string;
  title: string | null;
  body: string | null;
  hashtags: string[];
  mediaUrls: string[];
  scheduledAt: string | null;
  publishedAt: string | null;
  publishError: string | null;
  externalUrl: string | null;
  createdAt: string;
}

const statusBadge: Record<string, "gray" | "blue" | "yellow" | "green" | "red"> = {
  DRAFT: "gray",
  SCHEDULED: "blue",
  PUBLISHING: "yellow",
  PUBLISHED: "green",
  FAILED: "red",
};

const PLATFORMS = ["INSTAGRAM", "TIKTOK", "TWITTER", "LINKEDIN", "YOUTUBE", "FACEBOOK"];

export default function ContentPage() {
  const [posts, setPosts] = useState<ContentPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [mode, setMode] = useState<"calendar" | "list">("calendar");
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editPost, setEditPost] = useState<ContentPost | null>(null);

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (platformFilter) params.set("platform", platformFilter);
    const res = await fetch(`/api/content-posts?${params}`);
    const data = await res.json();
    if (data.success) setPosts(data.data);
    setLoading(false);
  }, [platformFilter]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Calendar grid
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getPostsForDay = (day: Date) =>
    posts.filter((p) => p.scheduledAt && isSameDay(parseISO(p.scheduledAt), day));

  const selectedDayPosts = selectedDay ? getPostsForDay(selectedDay) : [];

  const handleSave = async (data: {
    id?: string;
    clientId: string;
    platform: string;
    status?: string;
    title: string;
    body: string;
    hashtags: string[];
    scheduledAt: string;
  }) => {
    const url = data.id ? `/api/content-posts/${data.id}` : "/api/content-posts";
    const method = data.id ? "PATCH" : "POST";
    await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: data.clientId,
        platform: data.platform,
        status: data.status,
        title: data.title,
        body: data.body,
        hashtags: data.hashtags,
        scheduledAt: data.scheduledAt || null,
      }),
    });
    setEditPost(null);
    fetchPosts();
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/content-posts/${id}`, { method: "DELETE" });
    fetchPosts();
  };

  const openEdit = (post: ContentPost) => {
    setEditPost(post);
    setModalOpen(true);
  };

  const openNew = () => {
    setEditPost(null);
    setModalOpen(true);
  };

  // Sort posts for list view
  const sortedPosts = [...posts].sort((a, b) => {
    if (a.scheduledAt && b.scheduledAt) return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    if (a.scheduledAt) return -1;
    if (b.scheduledAt) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <>
      <TopBar title="Content Calendar" subtitle="Schedule and manage social media posts" />

      <div className="p-6 space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex bg-bb-elevated rounded-lg p-0.5 border border-bb-border">
              <button
                onClick={() => setMode("calendar")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  mode === "calendar" ? "bg-bb-orange text-white" : "text-bb-muted hover:text-white"
                )}
              >
                <CalendarIcon size={14} /> Calendar
              </button>
              <button
                onClick={() => setMode("list")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  mode === "list" ? "bg-bb-orange text-white" : "text-bb-muted hover:text-white"
                )}
              >
                <List size={14} /> List
              </button>
            </div>

            {/* Platform filters */}
            <div className="flex items-center gap-1 ml-2">
              <button
                onClick={() => setPlatformFilter(null)}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  !platformFilter ? "bg-bb-orange/10 text-bb-orange border border-bb-orange/30" : "text-bb-muted hover:text-white bg-bb-elevated border border-bb-border"
                )}
              >
                All
              </button>
              {PLATFORMS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPlatformFilter(platformFilter === p ? null : p)}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border",
                    platformFilter === p
                      ? "bg-bb-orange/10 text-bb-orange border-bb-orange/30"
                      : "text-bb-muted hover:text-white bg-bb-elevated border-bb-border"
                  )}
                >
                  <PlatformIcon platform={p} size={12} />
                  <span className="hidden sm:inline">{getPlatformLabel(p)}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={openNew}
            className="flex items-center gap-2 px-4 py-2 bg-bb-orange text-white rounded-lg text-sm font-medium hover:bg-bb-orange/90 transition-colors"
          >
            <Plus size={16} /> New Post
          </button>
        </div>

        {loading ? (
          <div className="text-center text-bb-muted py-20">Loading...</div>
        ) : mode === "calendar" ? (
          /* ========== CALENDAR VIEW ========== */
          <div className="flex gap-6">
            <div className="flex-1">
              {/* Month nav */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  className="p-2 rounded-lg hover:bg-bb-elevated text-bb-muted hover:text-white transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="flex items-center gap-3">
                  <h2 className="text-lg font-semibold text-white">
                    {format(currentMonth, "MMMM yyyy")}
                  </h2>
                  <button
                    onClick={() => {
                      setCurrentMonth(new Date());
                      setSelectedDay(new Date());
                    }}
                    className="px-2.5 py-1 rounded-md text-xs bg-bb-elevated text-bb-muted hover:text-white border border-bb-border"
                  >
                    Today
                  </button>
                </div>
                <button
                  onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  className="p-2 rounded-lg hover:bg-bb-elevated text-bb-muted hover:text-white transition-colors"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div key={d} className="text-center text-xs font-medium text-bb-dim py-2">
                    {d}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
              <div className="grid grid-cols-7 gap-px bg-bb-border rounded-lg overflow-hidden">
                {calendarDays.map((day) => {
                  const dayPosts = getPostsForDay(day);
                  const isSelected = selectedDay && isSameDay(day, selectedDay);
                  return (
                    <button
                      key={day.toISOString()}
                      onClick={() => setSelectedDay(day)}
                      className={cn(
                        "bg-bb-surface min-h-[80px] p-1.5 text-left transition-colors hover:bg-bb-elevated",
                        !isSameMonth(day, currentMonth) && "opacity-40",
                        isSelected && "ring-1 ring-bb-orange bg-bb-elevated"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs",
                          isToday(day) ? "bg-bb-orange text-white font-bold" : "text-bb-muted"
                        )}
                      >
                        {format(day, "d")}
                      </span>
                      <div className="flex flex-wrap gap-0.5 mt-1">
                        {dayPosts.slice(0, 4).map((p) => (
                          <span
                            key={p.id}
                            className={cn("w-2 h-2 rounded-full", PLATFORM_COLORS[p.platform] || "bg-bb-dim")}
                            title={`${getPlatformLabel(p.platform)}: ${p.title || "(untitled)"}`}
                          />
                        ))}
                        {dayPosts.length > 4 && (
                          <span className="text-[9px] text-bb-dim">+{dayPosts.length - 4}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Side panel */}
            <div className="w-80 shrink-0">
              <div className="bg-bb-surface border border-bb-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-white mb-3">
                  {selectedDay ? format(selectedDay, "EEEE, MMM d") : "Select a day"}
                </h3>
                {selectedDay && selectedDayPosts.length === 0 && (
                  <p className="text-sm text-bb-dim">No posts scheduled</p>
                )}
                <div className="space-y-3">
                  {selectedDayPosts.map((post) => (
                    <div
                      key={post.id}
                      className="bg-bb-elevated border border-bb-border rounded-lg p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <PlatformIcon platform={post.platform} size={14} />
                          <span className="text-sm text-white truncate">
                            {post.title || post.body?.slice(0, 40) || "(untitled)"}
                          </span>
                        </div>
                        <Badge variant={statusBadge[post.status] || "gray"} size="sm">
                          {post.status}
                        </Badge>
                      </div>
                      <div className="mt-2 flex items-center gap-2 text-xs text-bb-dim">
                        <span>{post.client.name}</span>
                        {post.scheduledAt && (
                          <>
                            <span>&middot;</span>
                            <Clock size={10} />
                            <span>{format(parseISO(post.scheduledAt), "h:mm a")}</span>
                          </>
                        )}
                      </div>
                      <div className="mt-2 flex gap-1">
                        <button
                          onClick={() => openEdit(post)}
                          className="p-1 rounded text-bb-dim hover:text-white transition-colors"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button
                          onClick={() => handleDelete(post.id)}
                          className="p-1 rounded text-bb-dim hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ========== LIST VIEW ========== */
          <div className="bg-bb-surface border border-bb-border rounded-xl overflow-hidden">
            {sortedPosts.length === 0 ? (
              <div className="text-center text-bb-muted py-20">
                No content posts yet. Click &quot;New Post&quot; to get started.
              </div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-bb-border text-left">
                    <th className="px-4 py-3 text-xs font-medium text-bb-dim uppercase">Platform</th>
                    <th className="px-4 py-3 text-xs font-medium text-bb-dim uppercase">Title</th>
                    <th className="px-4 py-3 text-xs font-medium text-bb-dim uppercase">Client</th>
                    <th className="px-4 py-3 text-xs font-medium text-bb-dim uppercase">Scheduled</th>
                    <th className="px-4 py-3 text-xs font-medium text-bb-dim uppercase">Status</th>
                    <th className="px-4 py-3 text-xs font-medium text-bb-dim uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPosts.map((post) => (
                    <tr
                      key={post.id}
                      className="border-b border-bb-border/50 hover:bg-bb-elevated/50 transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <PlatformIcon platform={post.platform} size={16} />
                          <span className="text-sm text-bb-muted">{getPlatformLabel(post.platform)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-white">
                          {post.title || post.body?.slice(0, 50) || "(untitled)"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-bb-muted">{post.client.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-bb-muted">
                          {post.scheduledAt
                            ? format(parseISO(post.scheduledAt), "MMM d, h:mm a")
                            : "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={statusBadge[post.status] || "gray"} size="sm">
                          {post.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <button
                            onClick={() => openEdit(post)}
                            className="p-1.5 rounded text-bb-dim hover:text-white transition-colors"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(post.id)}
                            className="p-1.5 rounded text-bb-dim hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <ContentPostModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditPost(null);
        }}
        onSave={handleSave}
        initialData={
          editPost
            ? {
                id: editPost.id,
                clientId: editPost.clientId,
                platform: editPost.platform,
                status: editPost.status,
                title: editPost.title || "",
                body: editPost.body || "",
                hashtags: editPost.hashtags,
                scheduledAt: editPost.scheduledAt
                  ? format(parseISO(editPost.scheduledAt), "yyyy-MM-dd'T'HH:mm")
                  : "",
              }
            : null
        }
      />
    </>
  );
}
