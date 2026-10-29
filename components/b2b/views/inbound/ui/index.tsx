'use client';

export function EnqIdChip({ id }: { id?: string }) {
  if (!String(id || '').trim()) {
    return <span className="text-[10px] font-semibold text-amber-600">No Enq ID</span>;
  }
  return (
    <span className="text-[10px] font-mono font-semibold text-gray-600 bg-gray-100 rounded px-1.5 py-0.5">
      {id}
    </span>
  );
}
