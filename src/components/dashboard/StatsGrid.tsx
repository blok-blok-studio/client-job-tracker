import { Users, CheckSquare, AlertTriangle } from "lucide-react";

interface StatsGridProps {
  activeClients: number;
  openTasks: number;
  overdueItems: number;
}

export default function StatsGrid({
  activeClients,
  openTasks,
  overdueItems,
}: StatsGridProps) {
  const stats = [
    {
      label: "Active Clients",
      value: activeClients,
      icon: Users,
      color: "text-bb-orange",
      formatted: String(activeClients),
    },
    {
      label: "Open Tasks",
      value: openTasks,
      icon: CheckSquare,
      color: "text-blue-400",
      formatted: String(openTasks),
    },
    {
      label: "Overdue Items",
      value: overdueItems,
      icon: AlertTriangle,
      color: overdueItems > 0 ? "text-red-400" : "text-bb-dim",
      formatted: String(overdueItems),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="bg-bb-surface border border-bb-border rounded-lg p-5"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-bb-muted">{stat.label}</span>
            <stat.icon size={18} className="text-bb-dim" />
          </div>
          <p className={`text-2xl font-display font-bold ${stat.color}`}>
            {stat.formatted}
          </p>
        </div>
      ))}
    </div>
  );
}
