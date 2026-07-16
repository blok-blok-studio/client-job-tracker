"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Columns3,
  CalendarDays,
  Lock,
  FolderOpen,
  Receipt,
  MessageCircle,
  Activity,
  PenSquare,
  Zap,
  UsersRound,
  ListTodo,
  BarChart3,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./SidebarContext";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/kanban", label: "Kanban", icon: Columns3 },
  { href: "/my-tasks", label: "My Tasks", icon: ListTodo },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/content", label: "Content", icon: PenSquare },
  { href: "/automation", label: "Automations", icon: Zap },
  { href: "/files", label: "Files", icon: FolderOpen },
  { href: "/vault", label: "Vault", icon: Lock },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/support", label: "Support", icon: MessageCircle },
];

interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "MEMBER";
  color?: string | null;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggle: toggleCollapsed } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const colorSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.user && setCurrentUser(d.user))
      .catch(() => {});
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile drawer is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const items =
    currentUser?.role === "OWNER"
      ? [...navItems, { href: "/team", label: "Team", icon: UsersRound }]
      : navItems;

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className="p-4 flex items-center justify-between border-b border-bb-border">
        {!collapsed && (
          <Image
            src="/bb_logo_wordmark_subhead_WHT_PNG.png"
            alt="Blok Blok"
            width={240}
            height={129}
            className="h-16 w-auto"
          />
        )}
        {/* Desktop collapse button */}
        <button
          onClick={toggleCollapsed}
          className="hidden lg:block p-1.5 rounded-md hover:bg-bb-elevated text-bb-muted hover:text-white transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
        {/* Mobile close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 rounded-md hover:bg-bb-elevated text-bb-muted hover:text-white transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {items.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-bb-orange/10 text-bb-orange shadow-[inset_2px_0_0_#FF6B00]"
                  : "text-bb-muted hover:text-white hover:bg-bb-elevated"
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={20} className="shrink-0" />
              {(!collapsed || mobileOpen) && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer — Signed-in user + Logout */}
      <div className="border-t border-bb-border p-4 space-y-3">
        {currentUser && (!collapsed || mobileOpen) && (
          <div className="flex items-center gap-2 min-w-0">
            {/* Avatar doubles as the profile-color picker */}
            <label
              className="relative w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 cursor-pointer ring-1 ring-white/10 hover:ring-bb-orange/60 transition-shadow"
              style={{ backgroundColor: currentUser.color || "#1E1E1E" }}
              title="Click to pick your profile color"
            >
              <span className={currentUser.color ? "text-black/80" : "text-white"}>
                {currentUser.name.charAt(0).toUpperCase()}
              </span>
              <input
                type="color"
                value={currentUser.color || "#FF6B00"}
                onChange={(e) => {
                  const color = e.target.value;
                  setCurrentUser((prev) => (prev ? { ...prev, color } : prev));
                  // Color pickers fire continuously while dragging — save once settled
                  if (colorSaveTimer.current) clearTimeout(colorSaveTimer.current);
                  colorSaveTimer.current = setTimeout(() => {
                    fetch(`/api/users/${currentUser.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ color }),
                    }).catch(() => {});
                  }, 500);
                }}
                className="absolute inset-0 opacity-0 cursor-pointer"
                aria-label="Profile color"
              />
            </label>
            <div className="min-w-0">
              <p className="text-xs font-medium text-white truncate">{currentUser.name}</p>
              <p className="text-[10px] text-bb-dim truncate capitalize">
                {currentUser.role.toLowerCase()}
              </p>
            </div>
          </div>
        )}
        <button
          onClick={handleLogout}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-bb-muted hover:text-red-400 hover:bg-bb-elevated transition-colors w-full",
            collapsed && !mobileOpen && "justify-center px-0"
          )}
        >
          <LogOut size={18} />
          {(!collapsed || mobileOpen) && <span>Logout</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-bb-surface border border-bb-border text-bb-muted hover:text-white transition-colors"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 z-50"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <aside
        className={cn(
          "lg:hidden fixed top-0 left-0 h-screen w-[280px] bg-bb-surface border-r border-bb-border flex flex-col z-50 transition-transform duration-200",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex fixed top-0 left-0 h-screen bg-bb-surface border-r border-bb-border flex-col transition-all duration-200 z-50",
          collapsed ? "w-[72px]" : "w-[260px]"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
