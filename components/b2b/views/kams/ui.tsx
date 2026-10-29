'use client';

export function Field({ label, children, hint, className = '' }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-gray-400 mt-0.5 leading-tight">{hint}</span>}
    </label>
  );
}

export function Pager({ total, page, pages, size, setPage }: {
  total: number; page: number; pages: number; size: number; setPage: (p: number) => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100">
      <span className="text-[11px] text-gray-400">Showing {page * size + 1}–{Math.min(total, (page + 1) * size)} of {total}</span>
      {total > size && (
        <div className="flex items-center gap-2">
          <button onClick={() => setPage(page - 1)} disabled={page === 0}
            className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">← Prev</button>
          <button onClick={() => setPage(page + 1)} disabled={page >= pages - 1}
            className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-600 disabled:opacity-40">Next →</button>
        </div>
      )}
    </div>
  );
}
