// Branded skeleton shown while any dashboard route loads.
// Mirrors the common page shape (top bar + stat row + content cards) so the
// real page paints into reserved space with minimal layout shift.
export default function DashboardLoading() {
  return (
    <div className="px-4 lg:px-6 py-4 space-y-6" aria-busy="true" aria-label="Loading">
      {/* Top bar */}
      <div className="flex items-center justify-between py-2">
        <div className="space-y-2">
          <div className="skeleton h-6 w-44" />
          <div className="skeleton h-3 w-64" />
        </div>
        <div className="skeleton h-9 w-28 rounded-md" />
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-bb-surface border border-bb-border rounded-lg p-4 space-y-3">
            <div className="skeleton h-3 w-20" />
            <div className="skeleton h-7 w-14" />
          </div>
        ))}
      </div>

      {/* Content cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-bb-surface border border-bb-border rounded-lg p-4 space-y-3">
            <div className="skeleton h-4 w-36" />
            <div className="skeleton h-3 w-full" />
            <div className="skeleton h-3 w-5/6" />
            <div className="skeleton h-3 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
