import Sidebar from "@/components/layout/Sidebar";
import AgentStatusBar from "@/components/layout/AgentStatusBar";
import { ToastProvider } from "@/components/shared/Toast";
import { SidebarProvider } from "@/components/layout/SidebarContext";
import DashboardContent from "@/components/layout/DashboardContent";
import GlobalDragPrevention from "@/components/shared/GlobalDragPrevention";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <SidebarProvider>
        <GlobalDragPrevention />
        <div className="min-h-screen bg-bb-black">
          <Sidebar />
          <DashboardContent>
            <AgentStatusBar />
            <main className="flex-1">{children}</main>
          </DashboardContent>
        </div>
      </SidebarProvider>
    </ToastProvider>
  );
}
