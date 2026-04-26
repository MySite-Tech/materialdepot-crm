import EscalationStatsClient from "@/components/sales-dashboard/EscalationStatsClient";

export default function StatsPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[15px] font-semibold text-gray-900">Today&apos;s Stats</h1>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Snapshot of escalations raised today
        </p>
      </div>
      <EscalationStatsClient />
    </div>
  );
}
