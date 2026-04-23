import type { Ticket } from "@/lib/types";
import StatusBadge from "./StatusBadge";

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function isOverdue(dueDate: string | null, status: string) {
  if (!dueDate || status === "Resolved" || status === "Closed") return false;
  return new Date(dueDate) < new Date();
}

export default function TicketsTable({ tickets }: { tickets: Ticket[] }) {
  if (tickets.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">No tickets found.</div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-3">ID</th>
            <th className="px-4 py-3">Subject</th>
            <th className="px-4 py-3">Contact</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Priority</th>
            <th className="px-4 py-3">Assigned To</th>
            <th className="px-4 py-3">Due Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {tickets.map((ticket) => (
            <tr key={ticket.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3 text-gray-400 font-mono text-xs">#{ticket.id}</td>
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900 max-w-xs truncate">
                  {ticket.subject}
                </p>
              </td>
              <td className="px-4 py-3">
                <div className="font-medium text-gray-700">{ticket.contactName}</div>
                <div className="text-xs text-gray-400">{ticket.contactEmail}</div>
              </td>
              <td className="px-4 py-3">
                <StatusBadge value={ticket.status} />
              </td>
              <td className="px-4 py-3">
                <StatusBadge value={ticket.priority} />
              </td>
              <td className="px-4 py-3 text-gray-600">{ticket.assignedTo}</td>
              <td className="px-4 py-3">
                <span
                  className={
                    isOverdue(ticket.dueDate, ticket.status)
                      ? "text-red-600 font-medium"
                      : "text-gray-500"
                  }
                >
                  {formatDate(ticket.dueDate)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
