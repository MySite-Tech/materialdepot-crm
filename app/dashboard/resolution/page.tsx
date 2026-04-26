import ResolutionTimelineClient from "@/components/sales-dashboard/ResolutionTimelineClient";

export default function ResolutionPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-[15px] font-semibold text-gray-900">Resolution Timeline</h1>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Time taken from deal creation to resolution update
        </p>
      </div>
      <ResolutionTimelineClient />
    </div>
  );
}
