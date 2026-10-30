import Sidebar from "@/components/Sidebar";
import { AssistantChat } from "@/components/AssistantChat";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const unreadCount = await prisma.reply.count({
    where: { readAt: null },
  });

  return (
    <div className="app-shell flex min-h-screen">
      <Sidebar unreadCount={unreadCount} />
      <main className="relative flex-1 overflow-auto">
        <div className="pointer-events-none absolute inset-0 grain opacity-[0.035]" />
        <div className="relative mx-auto max-w-7xl animate-fade-up px-6 py-8 md:px-10 md:py-10">
          {children}
        </div>
      </main>
      <AssistantChat />
    </div>
  );
}
