import type { Lead } from "@/lib/types";
import StatusBadge from "./StatusBadge";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function LeadsTable({ leads }: { leads: Lead[] }) {
  if (leads.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400 text-sm">No leads found.</div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Company</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Source</th>
            <th className="px-4 py-3">Assigned To</th>
            <th className="px-4 py-3">Value</th>
            <th className="px-4 py-3">Created</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {leads.map((lead) => (
            <tr key={lead.id} className="hover:bg-gray-50 transition-colors">
              <td className="px-4 py-3">
                <div className="font-medium text-gray-900">{lead.name}</div>
                <div className="text-xs text-gray-400">{lead.email}</div>
              </td>
              <td className="px-4 py-3 text-gray-700">{lead.company}</td>
              <td className="px-4 py-3">
                <StatusBadge value={lead.status} />
              </td>
              <td className="px-4 py-3 text-gray-600">{lead.source}</td>
              <td className="px-4 py-3 text-gray-600">{lead.assignedTo}</td>
              <td className="px-4 py-3 font-medium text-gray-900">
                {formatCurrency(lead.value)}
              </td>
              <td className="px-4 py-3 text-gray-500">{formatDate(lead.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
