'use client';

import { STATUS } from '../../shared';

export function Chip({ st }: { st: string }) {
  const s = STATUS[st] || { l: st, badge: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${s.badge}`}>{s.l}</span>;
}

export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="mb-5 border-b border-gray-100 pb-5 last:border-b-0">
      <h3 className="mb-2.5 text-[11px] font-extrabold uppercase tracking-wider text-gray-700">
        {title}{subtitle ? <span className="font-medium normal-case tracking-normal text-gray-400"> {subtitle}</span> : null}
      </h3>
      {children}
    </div>
  );
}

export function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex gap-3 py-1 text-[13px]"><span className="w-32 shrink-0 text-gray-400">{k}</span><span className="min-w-0 text-gray-900">{v}</span></div>;
}

export function Note({ tone, children }: { tone: 'blue' | 'red' | 'amber' | 'green'; children: React.ReactNode }) {
  const cls = tone === 'red' ? 'border-red-400 bg-red-50 text-red-700'
    : tone === 'amber' ? 'border-amber-500 bg-amber-50 text-amber-800'
      : tone === 'green' ? 'border-green-500 bg-green-50 text-green-700'
        : 'border-blue-400 bg-blue-50 text-[#1F3A5F]';
  return <div className={`my-2 rounded-md border-l-4 px-3 py-2.5 text-[12px] ${cls}`}>{children}</div>;
}

export function DateTime({ date, time, min, onDate, onTime }: { date: string; time: string; min: string; onDate: (v: string) => void; onTime: (v: string) => void }) {
  return (
    <div className="mb-2 grid grid-cols-2 gap-2">
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-gray-500">Audit date</label>
        <input type="date" value={date} min={min} onChange={(e) => onDate(e.target.value)} className="w-full rounded-md border border-gray-200 px-2.5 py-2 text-[13.5px]" />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-semibold text-gray-500">Visit time</label>
        <input type="time" value={time} onChange={(e) => onTime(e.target.value)} className="w-full rounded-md border border-gray-200 px-2.5 py-2 text-[13.5px] font-bold text-[#1F3A5F]" />
      </div>
    </div>
  );
}
