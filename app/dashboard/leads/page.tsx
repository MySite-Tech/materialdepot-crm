
import LeadsTable from "@/components/sales-dashboard/LeadsTable";
import StatCard from "@/components/sales-dashboard/StatCard";
import { mockLeads } from "@/lib/mock-data";
import type { LeadStatus } from "@/lib/types";

// Swap for real API once KYLAS_API_KEY is set:
// import { getLeads } from "@/lib/kylas";

export default async function LeadsPage() {
  // const leads = await getLeads();
  const leads = mockLeads;

  const byStatus = (status: LeadStatus) =>
    leads.filter((l) => l.status === status).length;

  const totalValue = leads
    .filter((l) => l.status === "Won")
    .reduce((sum, l) => sum + l.value, 0);

  const formattedValue = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(totalValue);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
        <p className="text-sm text-gray-500 mt-1">
          All leads from your Kylas CRM pipeline
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <StatCard title="Total" value={leads.length} color="indigo" />
        <StatCard title="New" value={byStatus("New")} color="blue" />
        <StatCard title="Contacted" value={byStatus("Contacted")} color="indigo" />
        <StatCard title="Qualified" value={byStatus("Qualified")} color="yellow" />
        <StatCard title="Won" value={byStatus("Won")} color="green" />
        <StatCard
          title="Won Value"
          value={formattedValue}
          subtitle="closed revenue"
          color="green"
        />
      </div>

      {/* Table */}
      <LeadsTable leads={leads} />
    </div>
  );
}
