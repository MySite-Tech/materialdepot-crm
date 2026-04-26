import EscalationClient from "@/components/sales-dashboard/EscalationClient";

export default function EscalationsPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[15px] font-semibold text-gray-900">Escalation Visibility</h1>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Live view of all deals in the Escalation Pipeline
        </p>
      </div>
      <EscalationClient />
    </div>
  );
}
