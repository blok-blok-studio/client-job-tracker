import AnalyticsView from "@/components/analytics/AnalyticsView";

// Read-only numbers for one website, opened by a client through a link the team switched on.
export default async function SharedStatsPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <AnalyticsView share={token} />;
}
