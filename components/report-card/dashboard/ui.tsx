'use client';

import { ClosureStage } from '@/lib/mockApi';

export function Section({ n, title, hint, children }: { n: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex items-center justify-center text-[10px] font-bold text-gray-500 bg-gray-100 rounded px-1.5 py-0.5 tracking-widest">{n}</span>
          <h3 className="text-[15px] font-bold text-gray-800">{title}</h3>
        </div>
        {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

export const Th = ({ children, right }: { children: React.ReactNode; right?: boolean }) => (
  <th className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 ${right ? 'text-right' : 'text-left'}`}>{children}</th>
);

export const stagePill: Record<ClosureStage, string> = {
  HOT: 'bg-red-50 text-red-600',
  WARM: 'bg-amber-50 text-amber-600',
  COLD: 'bg-blue-50 text-blue-600',
  DEAD: 'bg-gray-100 text-gray-500',
};

export function PhoneCell({ phone }: { phone: string }) {
  return (
    <span className="font-mono text-[12px] text-gray-600">{phone || '—'}</span>
  );
}

export function RankBadge({ rank }: { rank: number }) {
  const color = rank === 1 ? 'bg-yellow-100 text-yellow-700 border-yellow-300'
    : rank === 2 ? 'bg-gray-100 text-gray-600 border-gray-300'
    : rank === 3 ? 'bg-orange-50 text-orange-600 border-orange-200'
    : 'bg-white text-gray-400 border-gray-200';
  return <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-[11px] font-bold ${color}`}>{rank}</span>;
}
