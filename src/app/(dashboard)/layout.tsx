import Sidebar from "@/components/layout/Sidebar";
import { ToastProvider } from "@/components/shared/Toast";
import { SidebarProvider } from "@/components/layout/SidebarContext";
import DashboardContent from "@/components/layout/DashboardContent";
import GlobalDragPrevention from "@/components/shared/GlobalDragPrevention";
import CommandPalette from "@/components/shared/CommandPalette";
import PageGuard from "@/components/shared/PageGuard";
import MandatoryMfaEnroll from "@/components/security/MandatoryMfaEnroll";
import { getSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Two-factor is mandatory: any signed-in member who hasn't set up an
  // authenticator is held on the enrollment screen and can't reach the app.
  // (Middleware already redirected unauthenticated requests to /login.)
  const session = await getSession();
  if (session) {
    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { totpEnabled: true },
    });
    if (!user?.totpEnabled) {
      return (
        <ToastProvider>
          <MandatoryMfaEnroll email={session.email} />
        </ToastProvider>
      );
    }
  }

  return (
    <ToastProvider>
      <SidebarProvider>
        <GlobalDragPrevention />
        <CommandPalette />
        <PageGuard />
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
