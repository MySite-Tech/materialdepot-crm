import type { LeadStatus, TicketStatus, TicketPriority } from "@/lib/types";

type BadgeValue = LeadStatus | TicketStatus | TicketPriority;

const badgeStyles: Record<string, string> = {
  // Lead statuses
  New: "bg-blue-100 text-blue-700",
  Contacted: "bg-purple-100 text-purple-700",
  Qualified: "bg-indigo-100 text-indigo-700",
  "Proposal Sent": "bg-yellow-100 text-yellow-700",
  Won: "bg-green-100 text-green-700",
  Lost: "bg-red-100 text-red-700",
  // Ticket statuses
  Open: "bg-blue-100 text-blue-700",
  "In Progress": "bg-yellow-100 text-yellow-700",
  Pending: "bg-orange-100 text-orange-700",
  Resolved: "bg-green-100 text-green-700",
  Closed: "bg-gray-100 text-gray-600",
  // Priorities
  Low: "bg-gray-100 text-gray-600",
  Medium: "bg-yellow-100 text-yellow-700",
  High: "bg-orange-100 text-orange-700",
  Urgent: "bg-red-100 text-red-700",
};

export default function StatusBadge({ value }: { value: BadgeValue }) {
  const style = badgeStyles[value] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${style}`}>
      {value}
    </span>
  );
}
