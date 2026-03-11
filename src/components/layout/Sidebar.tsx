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
  Bot,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/kanban", label: "Kanban", icon: Columns3 },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/vault", label: "Vault", icon: Lock },
  { href: "/agent", label: "Agent", icon: Bot },
  { href: "/agent/config", label: "Settings", icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside
      className={cn(
        "fixed top-0 left-0 h-screen bg-bb-surface border-r border-bb-border flex flex-col transition-all duration-200 z-50",
        collapsed ? "w-[72px]" : "w-[260px]"
      )}
    >
      {/* Logo */}
      <div className="p-4 flex items-center justify-between border-b border-bb-border">
        {!collapsed && (
          <Image
            src="/bb_logo_wordmark_subhead_WHT_PNG.png"
            alt="Blok Blok"
            width={140}
            height={32}
            className="h-8 w-auto"
          />
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md hover:bg-bb-elevated text-bb-muted hover:text-white transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        {navItems.map((item) => {
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
                  ? "bg-bb-orange/10 text-bb-orange"
                  : "text-bb-muted hover:text-white hover:bg-bb-elevated"
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={20} className="shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer — Agent Status + Logout */}
      <div className="border-t border-bb-border p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse shrink-0" />
          {!collapsed && (
            <span className="text-xs text-bb-muted">Agent: Active</span>
          )}
        </div>
        <button
          onClick={handleLogout}
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-bb-muted hover:text-red-400 hover:bg-bb-elevated transition-colors w-full",
            collapsed && "justify-center px-0"
          )}
        >
          <LogOut size={18} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
}
