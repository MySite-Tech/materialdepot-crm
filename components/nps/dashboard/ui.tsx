'use client';

import { BUCKET_STYLE } from '../constants/nps';
import { KpiTileProps } from '../types/nps';
import { bucketOf, daysSince } from '../utils/nps';

export function ResultPill({ score }: { score: number | null }) {
  if (score == null) return <span className="text-gray-300 text-[13px]">--</span>;
  const b = bucketOf(score);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold ${BUCKET_STYLE[b]}`}>
      <span>{score}</span>
      <span className="opacity-50">·</span>
      <span>{b}</span>
    </span>
  );
}

export function WaitChip({ visitDate }: { visitDate: string }) {
  const d = daysSince(visitDate);
  const cls = d >= 3 ? 'bg-red-50 text-red-700' : d >= 1 ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600';
  const label = d <= 0 ? 'Today' : d === 1 ? '1 day' : `${d} days`;
  return <span className={`inline-block px-2.5 py-1 rounded-full text-[12px] font-semibold ${cls}`}>{label}</span>;
}

export function Delta({ cur, prev, unit = '', dir = 1, dec = 0 }: { cur: number | null; prev: number | null; unit?: string; dir?: number; dec?: number }) {
  if (cur == null || prev == null) return <div className="text-[12px] text-gray-400 mt-1.5">no prior period</div>;
  const diff = cur - prev;
  const eps = dec ? 0.05 : 0.5;
  if (Math.abs(diff) < eps) return <div className="text-[12px] text-gray-400 mt-1.5">no change vs prev</div>;
  const good = diff > 0 ? dir > 0 : dir < 0;
  const mag = dec ? Math.abs(diff).toFixed(dec) : String(Math.round(Math.abs(diff)));
  return (
    <div className={`text-[12px] mt-1.5 flex items-center gap-1 font-medium ${good ? 'text-green-600' : 'text-red-600'}`}>
      {diff > 0 ? '▲' : '▼'} {mag}{unit}
      <span className="text-gray-400 font-normal">vs prev</span>
    </div>
  );
}

export function KpiTile({ label, value, accent, valueClass = '', delta }: KpiTileProps) {
  return (
    <div className="relative bg-white rounded-xl border border-gray-200 px-5 py-4 overflow-hidden">
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: accent }} />
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`text-[30px] leading-none font-bold mt-3 tabular-nums ${valueClass || 'text-gray-900'}`}>{value}</div>
      {delta}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { val: T; label: string }[] }) {
  return (
    <div className="inline-flex bg-white border border-gray-300 rounded-full p-0.5 gap-0.5">
      {options.map(o => (
        <button
          key={o.val}
          onClick={() => onChange(o.val)}
          className={`px-3 py-1 rounded-full text-[12.5px] font-semibold cursor-pointer transition-colors ${value === o.val ? 'bg-gray-900 text-white' : 'text-gray-600 hover:text-gray-900'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ChartCard({ title, caption, children }: { title: string; caption?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="text-[14px] font-bold text-gray-900">{title}</h3>
      {caption && <p className="text-[12px] text-gray-400 mt-0.5 mb-3">{caption}</p>}
      <div className={caption ? '' : 'mt-3'}>{children}</div>
    </div>
  );
}

export function EmptyChart({ msg }: { msg: string }) {
  return <div className="text-[13px] text-gray-400 text-center py-12">{msg}</div>;
}
