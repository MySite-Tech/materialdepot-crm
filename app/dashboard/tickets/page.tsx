import StatCard from "@/components/sales-dashboard/StatCard";
import TicketsTable from "@/components/sales-dashboard/TicketsTable";
import { mockTickets } from "@/lib/mock-data";
import type { TicketStatus, TicketPriority } from "@/lib/types";

// Swap for real API once KYLAS_API_KEY is set:
// import { getTickets } from "@/lib/kylas";

export default async function TicketsPage() {
  // const tickets = await getTickets();
  const tickets = mockTickets;

  const byStatus = (status: TicketStatus) =>
    tickets.filter((t) => t.status === status).length;

  const byPriority = (priority: TicketPriority) =>
    tickets.filter((t) => t.priority === priority).length;

  const overdue = tickets.filter(
    (t) =>
      t.dueDate &&
      new Date(t.dueDate) < new Date() &&
      t.status !== "Resolved" &&
      t.status !== "Closed"
  ).length;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Tickets</h1>
        <p className="text-sm text-gray-500 mt-1">
          Support tickets from your Kylas CRM
        </p>
      </div>

      {/* Status stats */}
      <div className="mb-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          By Status
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          <StatCard title="Total" value={tickets.length} color="indigo" />
          <StatCard title="Open" value={byStatus("Open")} color="blue" />
          <StatCard title="In Progress" value={byStatus("In Progress")} color="yellow" />
          <StatCard title="Pending" value={byStatus("Pending")} color="yellow" />
          <StatCard title="Resolved" value={byStatus("Resolved")} color="green" />
        </div>
      </div>

      {/* Priority stats */}
      <div className="mb-8">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
          By Priority
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Urgent" value={byPriority("Urgent")} color="red" />
          <StatCard title="High" value={byPriority("High")} color="red" />
          <StatCard title="Medium" value={byPriority("Medium")} color="yellow" />
          <StatCard title="Overdue" value={overdue} color="red" />
        </div>
      </div>

      {/* Table */}
      <TicketsTable tickets={tickets} />
    </div>
  );
}
