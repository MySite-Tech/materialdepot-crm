import EscalationStatsClient from "@/components/sales-dashboard/EscalationStatsClient";

export default function StatsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Today&apos;s Stats</h1>
        <p className="text-sm text-gray-500 mt-1">
          Snapshot of escalations raised today
        </p>
      </div>
      <EscalationStatsClient />
    </div>
  );
}
