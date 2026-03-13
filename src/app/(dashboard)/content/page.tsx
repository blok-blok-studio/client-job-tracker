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
  X,
  Image as ImageIcon,
  Film,
  Upload,
} from "lucide-react";
import TopBar from "@/components/layout/TopBar";
import Badge from "@/components/shared/Badge";
import PlatformIcon, { getPlatformLabel, PLATFORM_COLORS } from "@/components/content/PlatformIcon";
import ContentPostModal from "@/components/content/ContentPostModal";
import BulkImportModal from "@/components/content/BulkImportModal";
import BestTimes from "@/components/content/BestTimes";
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
  const [mode, setMode] = useState<"calendar" | "list">("list");
  const [platformFilter, setPlatformFilter] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editPost, setEditPost] = useState<ContentPost | null>(null);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

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
    mediaUrls: string[];
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
        mediaUrls: data.mediaUrls,
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

  const selectDay = (day: Date) => {
    setSelectedDay(day);
    // Open mobile panel when a day is tapped on mobile
    if (window.innerWidth < 1024) {
      setMobilePanelOpen(true);
    }
  };

  // Sort posts for list view
  const sortedPosts = [...posts].sort((a, b) => {
    if (a.scheduledAt && b.scheduledAt) return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime();
    if (a.scheduledAt) return -1;
    if (b.scheduledAt) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const isVideo = (url: string) => /\.(mp4|mov|webm)$/i.test(url);

  // Render a post card (reused in calendar panel and list view on mobile)
  const renderPostCard = (post: ContentPost) => (
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
      {post.mediaUrls.length > 0 && (
        <div className="mt-2 flex gap-1.5 overflow-x-auto">
          {post.mediaUrls.slice(0, 4).map((url) => (
            <div
              key={url}
              className="w-14 h-14 rounded-md overflow-hidden border border-bb-border bg-bb-surface shrink-0"
            >
              {isVideo(url) ? (
                <div className="w-full h-full flex items-center justify-center">
                  <Film size={16} className="text-bb-muted" />
                </div>
              ) : (
                <img src={url} alt="" className="w-full h-full object-cover" />
              )}
            </div>
          ))}
          {post.mediaUrls.length > 4 && (
            <div className="w-14 h-14 rounded-md border border-bb-border bg-bb-surface shrink-0 flex items-center justify-center text-xs text-bb-dim">
              +{post.mediaUrls.length - 4}
            </div>
          )}
        </div>
      )}
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
      <div className="mt-2 flex gap-2">
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
    </div>
  );

  return (
    <>
      <TopBar title="Content Calendar" subtitle="Schedule and manage social media posts" />

      <div className="p-4 lg:p-6 space-y-4 lg:space-y-6">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            {/* View toggle */}
            <div className="flex bg-bb-elevated rounded-lg p-0.5 border border-bb-border">
              <button
                onClick={() => setMode("calendar")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex-1 justify-center sm:flex-initial",
                  mode === "calendar" ? "bg-bb-orange text-white" : "text-bb-muted hover:text-white"
                )}
              >
                <CalendarIcon size={14} /> Calendar
              </button>
              <button
                onClick={() => setMode("list")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex-1 justify-center sm:flex-initial",
                  mode === "list" ? "bg-bb-orange text-white" : "text-bb-muted hover:text-white"
                )}
              >
                <List size={14} /> List
              </button>
            </div>

            {/* Platform filters - horizontal scroll on mobile */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 -mb-1 sm:ml-2 scrollbar-hide">
              <button
                onClick={() => setPlatformFilter(null)}
                className={cn(
                  "px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0",
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
                    "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border whitespace-nowrap shrink-0",
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

          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => setBulkModalOpen(true)}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-bb-elevated border border-bb-border text-bb-muted rounded-lg text-sm font-medium hover:text-white transition-colors flex-1 sm:flex-initial"
            >
              <Upload size={14} /> CSV Import
            </button>
            <button
              onClick={openNew}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-bb-orange text-white rounded-lg text-sm font-medium hover:bg-bb-orange/90 transition-colors flex-1 sm:flex-initial"
            >
              <Plus size={16} /> New Post
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center text-bb-muted py-20">Loading...</div>
        ) : mode === "calendar" ? (
          /* ========== CALENDAR VIEW ========== */
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
            <div className="flex-1 min-w-0">
              {/* Month nav */}
              <div className="flex items-center justify-between mb-4">
                <button
                  onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  className="p-2 rounded-lg hover:bg-bb-elevated text-bb-muted hover:text-white transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                <div className="flex items-center gap-3">
                  <h2 className="text-base lg:text-lg font-semibold text-white">
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
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => (
                  <div key={d} className="text-center text-xs font-medium text-bb-dim py-2">
                    <span className="hidden sm:inline">{d}</span>
                    <span className="sm:hidden">{["M", "T", "W", "T", "F", "S", "S"][i]}</span>
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
                      onClick={() => selectDay(day)}
                      className={cn(
                        "bg-bb-surface min-h-[48px] sm:min-h-[64px] lg:min-h-[80px] p-1 sm:p-1.5 text-left transition-colors hover:bg-bb-elevated",
                        !isSameMonth(day, currentMonth) && "opacity-40",
                        isSelected && "ring-1 ring-bb-orange bg-bb-elevated"
                      )}
                    >
                      <span
                        className={cn(
                          "inline-flex items-center justify-center w-5 h-5 sm:w-6 sm:h-6 rounded-full text-[10px] sm:text-xs",
                          isToday(day) ? "bg-bb-orange text-white font-bold" : "text-bb-muted"
                        )}
                      >
                        {format(day, "d")}
                      </span>
                      <div className="flex flex-wrap gap-0.5 mt-0.5 sm:mt-1">
                        {dayPosts.slice(0, 3).map((p) => (
                          <span
                            key={p.id}
                            className={cn("w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full", PLATFORM_COLORS[p.platform] || "bg-bb-dim")}
                          />
                        ))}
                        {dayPosts.length > 3 && (
                          <span className="text-[8px] sm:text-[9px] text-bb-dim">+{dayPosts.length - 3}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Side panel - hidden on mobile, shown as overlay */}
            <div className="hidden lg:block w-80 shrink-0">
              <div className="bg-bb-surface border border-bb-border rounded-xl p-4 sticky top-4">
                <h3 className="text-sm font-semibold text-white mb-3">
                  {selectedDay ? format(selectedDay, "EEEE, MMM d") : "Select a day"}
                </h3>
                {selectedDay && selectedDayPosts.length === 0 && (
                  <p className="text-sm text-bb-dim">No posts scheduled</p>
                )}
                <div className="space-y-3">
                  {selectedDayPosts.map(renderPostCard)}
                </div>
              </div>
            </div>

            {/* Mobile bottom sheet for selected day */}
            {mobilePanelOpen && selectedDay && (
              <div className="lg:hidden fixed inset-0 z-50">
                {/* Backdrop */}
                <div
                  className="absolute inset-0 bg-black/60"
                  onClick={() => setMobilePanelOpen(false)}
                />
                {/* Sheet */}
                <div className="absolute bottom-0 left-0 right-0 bg-bb-surface border-t border-bb-border rounded-t-2xl max-h-[70vh] overflow-y-auto">
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-base font-semibold text-white">
                        {format(selectedDay, "EEEE, MMM d")}
                      </h3>
                      <button
                        onClick={() => setMobilePanelOpen(false)}
                        className="p-1.5 rounded-lg bg-bb-elevated text-bb-muted"
                      >
                        <X size={16} />
                      </button>
                    </div>
                    {selectedDayPosts.length === 0 ? (
                      <p className="text-sm text-bb-dim py-4 text-center">No posts scheduled</p>
                    ) : (
                      <div className="space-y-3">
                        {selectedDayPosts.map(renderPostCard)}
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setMobilePanelOpen(false);
                        openNew();
                      }}
                      className="w-full mt-4 flex items-center justify-center gap-2 px-4 py-2.5 bg-bb-orange text-white rounded-lg text-sm font-medium"
                    >
                      <Plus size={16} /> Add Post for This Day
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ========== LIST VIEW ========== */
          <>
            {/* Mobile: Card layout */}
            <div className="lg:hidden space-y-3">
              {sortedPosts.length === 0 ? (
                <div className="text-center text-bb-muted py-20 bg-bb-surface border border-bb-border rounded-xl">
                  No content posts yet. Tap &quot;New Post&quot; to get started.
                </div>
              ) : (
                sortedPosts.map((post) => (
                  <div
                    key={post.id}
                    className="bg-bb-surface border border-bb-border rounded-xl p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <PlatformIcon platform={post.platform} size={18} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {post.title || post.body?.slice(0, 50) || "(untitled)"}
                          </p>
                          <p className="text-xs text-bb-dim mt-0.5">{post.client.name}</p>
                        </div>
                      </div>
                      <Badge variant={statusBadge[post.status] || "gray"} size="sm">
                        {post.status}
                      </Badge>
                    </div>
                    {post.mediaUrls.length > 0 && (
                      <div className="mt-2 flex gap-1.5 overflow-x-auto">
                        {post.mediaUrls.slice(0, 4).map((url) => (
                          <div
                            key={url}
                            className="w-16 h-16 rounded-md overflow-hidden border border-bb-border bg-bb-surface shrink-0"
                          >
                            {isVideo(url) ? (
                              <div className="w-full h-full flex items-center justify-center">
                                <Film size={18} className="text-bb-muted" />
                              </div>
                            ) : (
                              <img src={url} alt="" className="w-full h-full object-cover" />
                            )}
                          </div>
                        ))}
                        {post.mediaUrls.length > 4 && (
                          <div className="w-16 h-16 rounded-md border border-bb-border bg-bb-surface shrink-0 flex items-center justify-center text-xs text-bb-dim">
                            +{post.mediaUrls.length - 4}
                          </div>
                        )}
                      </div>
                    )}
                    {post.body && (
                      <p className="text-xs text-bb-muted mt-2 line-clamp-2">{post.body}</p>
                    )}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-bb-border/50">
                      <div className="flex items-center gap-1.5 text-xs text-bb-dim">
                        <Clock size={11} />
                        <span>
                          {post.scheduledAt
                            ? format(parseISO(post.scheduledAt), "MMM d, h:mm a")
                            : "Not scheduled"}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(post)}
                          className="p-2 rounded-lg text-bb-dim hover:text-white hover:bg-bb-elevated transition-colors"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(post.id)}
                          className="p-2 rounded-lg text-bb-dim hover:text-red-400 hover:bg-bb-elevated transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop: Table layout */}
            <div className="hidden lg:block bg-bb-surface border border-bb-border rounded-xl overflow-hidden">
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
                      <th className="px-4 py-3 text-xs font-medium text-bb-dim uppercase">Media</th>
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
                          {post.mediaUrls.length > 0 ? (
                            <div className="flex items-center gap-1.5">
                              {post.mediaUrls.slice(0, 3).map((url) => (
                                <div
                                  key={url}
                                  className="w-8 h-8 rounded overflow-hidden border border-bb-border bg-bb-surface shrink-0"
                                >
                                  {isVideo(url) ? (
                                    <div className="w-full h-full flex items-center justify-center">
                                      <Film size={12} className="text-bb-muted" />
                                    </div>
                                  ) : (
                                    <img src={url} alt="" className="w-full h-full object-cover" />
                                  )}
                                </div>
                              ))}
                              {post.mediaUrls.length > 3 && (
                                <span className="text-xs text-bb-dim">+{post.mediaUrls.length - 3}</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-bb-dim">&mdash;</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-bb-muted">{post.client.name}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-bb-muted">
                            {post.scheduledAt
                              ? format(parseISO(post.scheduledAt), "MMM d, h:mm a")
                              : "\u2014"}
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
          </>
        )}

        {/* Best Times to Post */}
        {!loading && (
          <BestTimes platform={platformFilter} />
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
                mediaUrls: editPost.mediaUrls || [],
                scheduledAt: editPost.scheduledAt
                  ? format(parseISO(editPost.scheduledAt), "yyyy-MM-dd'T'HH:mm")
                  : "",
              }
            : null
        }
      />

      <BulkImportModal
        open={bulkModalOpen}
        onClose={() => setBulkModalOpen(false)}
        onComplete={fetchPosts}
      />
    </>
  );
}
