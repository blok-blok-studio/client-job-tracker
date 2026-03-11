import TopBar from "@/components/layout/TopBar";
import KanbanBoard from "@/components/kanban/KanbanBoard";

export default function KanbanPage() {
  return (
    <div>
      <TopBar title="Kanban Board" subtitle="Drag and drop task management" />
      <div className="px-6">
        <KanbanBoard />
      </div>
    </div>
  );
}
