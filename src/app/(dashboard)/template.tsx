"use client";

// Remounts on every route change inside the dashboard, giving each page a
// subtle 300ms fade-up entrance. Disabled automatically for users with
// prefers-reduced-motion (see globals.css).
export default function DashboardTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-fade-in-up">{children}</div>;
}
