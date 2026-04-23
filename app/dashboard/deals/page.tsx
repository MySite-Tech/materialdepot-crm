import EscalationClient from "@/components/sales-dashboard/EscalationClient";

export default function EscalationsPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Escalation Visibility</h1>
        <p className="text-sm text-gray-500 mt-1">
          Live view of all deals in the Escalation Pipeline
        </p>
      </div>
      <EscalationClient />
    </div>
  );
}
