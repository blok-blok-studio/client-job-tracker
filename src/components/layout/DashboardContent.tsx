"use client";

import { useSidebar } from "./SidebarContext";

export default function DashboardContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <div
      className="flex flex-col min-h-screen transition-[margin] duration-200 max-lg:!ml-0"
      style={{ marginLeft: collapsed ? 72 : 260 }}
    >
      {children}
    </div>
  );
}
