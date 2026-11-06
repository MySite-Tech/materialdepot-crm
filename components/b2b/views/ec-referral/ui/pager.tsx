'use client';

export const PAGE_SIZE = 25;

export function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  if (total <= PAGE_SIZE) return null;
  const last = Math.ceil(total / PAGE_SIZE);
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 text-[12px] text-gray-500">
      <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
      <div className="flex gap-2">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="px-3 py-1 rounded-md border border-gray-300 bg-white disabled:opacity-40">← Prev</button>
        <button disabled={page >= last} onClick={() => onPage(page + 1)} className="px-3 py-1 rounded-md border border-gray-300 bg-white disabled:opacity-40">Next →</button>
      </div>
    </div>
  );
}
