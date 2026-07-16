import TopBar from "@/components/layout/TopBar";
import KanbanBoard from "@/components/kanban/KanbanBoard";

export default function KanbanPage() {
  return (
    <div>
      <TopBar title="Kanban Board" subtitle="Board and calendar views — log updates per client as you work" />
      <div className="px-4 lg:px-6">
        <KanbanBoard />
      </div>
    </div>
  );
}
