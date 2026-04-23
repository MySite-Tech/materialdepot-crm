import ResolutionTimelineClient from "@/components/sales-dashboard/ResolutionTimelineClient";

export default function ResolutionPage() {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Resolution Timeline</h1>
        <p className="text-sm text-gray-500 mt-1">
          Time taken from deal creation to resolution update
        </p>
      </div>
      <ResolutionTimelineClient />
    </div>
  );
}
