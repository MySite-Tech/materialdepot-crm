'use client';

export function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-3">
      <h2 className="text-[15px] font-bold text-gray-900">{title}</h2>
      {sub && <span className="text-[11px] text-gray-400">{sub}</span>}
    </div>
  );
}
