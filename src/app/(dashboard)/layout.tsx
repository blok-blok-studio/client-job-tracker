import Sidebar from "@/components/layout/Sidebar";
import { ToastProvider } from "@/components/shared/Toast";
import { SidebarProvider } from "@/components/layout/SidebarContext";
import DashboardContent from "@/components/layout/DashboardContent";
import GlobalDragPrevention from "@/components/shared/GlobalDragPrevention";
import CommandPalette from "@/components/shared/CommandPalette";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ToastProvider>
      <SidebarProvider>
        <GlobalDragPrevention />
        <CommandPalette />
        <div className="min-h-screen bg-bb-black">
          <Sidebar />
          <DashboardContent>
            <main className="flex-1">{children}</main>
          </DashboardContent>
        </div>
      </SidebarProvider>
    </ToastProvider>
  );
}
