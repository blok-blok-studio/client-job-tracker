import Sidebar from "@/components/layout/Sidebar";
import AgentStatusBar from "@/components/layout/AgentStatusBar";
import { ToastProvider } from "@/components/shared/Toast";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-bb-black">
        <Sidebar />
        <div className="lg:ml-[260px] flex flex-col min-h-screen">
          <AgentStatusBar />
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
