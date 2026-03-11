import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded bg-bb-elevated", className)} />;
}

export function CardSkeleton() {
  return (
    <div className="bg-bb-surface border border-bb-border rounded-lg p-5 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  );
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 border-b border-bb-border">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === 0 ? "w-1/4" : "w-1/6"}`} />
      ))}
    </div>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-bb-surface border border-bb-border rounded-lg divide-y divide-bb-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="px-5 py-4 space-y-2">
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="h-3 w-3/5" />
        </div>
      ))}
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-bb-surface border border-bb-border rounded-lg p-5 space-y-2">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        ))}
      </div>
      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3">
          <ListSkeleton rows={5} />
        </div>
        <div className="lg:col-span-2">
          <ListSkeleton rows={4} />
        </div>
      </div>
    </div>
  );
}
