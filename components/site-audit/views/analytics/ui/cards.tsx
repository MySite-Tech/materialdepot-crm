'use client';

export type TileProps = (key: string | undefined, base: string) => Record<string, unknown>;

const pc = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);
const pcColorClass = (p: number | null) => (p === null ? 'text-gray-400' : p >= 80 ? 'text-green-600' : p >= 50 ? 'text-amber-600' : 'text-red-600');
const pcBarClass = (p: number | null) => (p === null ? 'bg-gray-300' : p >= 80 ? 'bg-green-600' : p >= 50 ? 'bg-amber-600' : 'bg-red-600');

import { NPS_BAND_LABELS } from '../../../shared/format';

export function PctCard({ label, n, d, sub, note, drill, tileProps }: { label: string; n: number; d: number; sub?: string; note?: string; drill?: string; tileProps: TileProps }) {
  const p = pc(n, d);
  return (
    <div {...tileProps(drill, 'rounded-lg border border-gray-200 bg-white p-4')}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`mt-1 font-mono text-[22px] font-bold ${pcColorClass(p)}`}>{p !== null ? p + '%' : '—'}</div>
      {p !== null ? (
        <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mt-2">
          <div className={`h-full rounded-full ${pcBarClass(p)}`} style={{ width: p + '%' }}></div>
        </div>
      ) : null}
      <div className="text-[11px] text-gray-400 mt-1">{d > 0 ? n + ' of ' + d : 'No data'}</div>
      {sub ? <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div> : null}
      {note ? <div className="text-[11px] text-amber-600 mt-0.5">{note}</div> : null}
    </div>
  );
}
export function RatingCard({ label, avg, cnt, drill, tileProps }: { label: string; avg: number | null; cnt: number; drill?: string; tileProps: TileProps }) {
  if (avg === null)
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
        <div className="mt-1 font-mono text-[22px] font-bold text-gray-400">—</div>
        <div className="text-[11px] text-gray-400 mt-1">No ratings yet</div>
      </div>
    );
  const c = avg >= 8 ? 'text-green-600' : avg >= 6 ? 'text-amber-600' : 'text-red-600';
  const s = Math.min(5, Math.round(avg / 2));
  return (
    <div {...tileProps(drill, 'rounded-lg border border-gray-200 bg-white p-4')}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`mt-1 font-mono text-[22px] font-bold ${c}`}>
        {avg}
        <span className="text-sm text-gray-400">/10</span>
      </div>
      <div className="text-amber-500 text-sm mt-0.5">{'★'.repeat(s) + '☆'.repeat(5 - s)}</div>
      <div className="text-[11px] text-gray-400 mt-1">
        {cnt} rating{cnt !== 1 ? 's' : ''} · in range
      </div>
    </div>
  );
}
export function NpsCard({ label, nps, prom, det, total, drill, tileProps }: { label: string; nps: number | null; prom: number; det: number; total: number; drill?: string; tileProps: TileProps }) {
  if (nps === null)
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
        <div className="mt-1 font-mono text-[22px] font-bold text-gray-400">—</div>
        <div className="text-[11px] text-gray-400 mt-1">No ratings yet</div>
      </div>
    );
  const c = nps >= 50 ? 'text-green-600' : nps >= 0 ? 'text-amber-600' : 'text-red-600';
  const pass = total - prom - det;
  return (
    <div {...tileProps(drill, 'rounded-lg border border-gray-200 bg-white p-4')}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`mt-1 font-mono text-[22px] font-bold ${c}`}>
        {nps >= 0 ? '+' : ''}
        {nps}
      </div>
      <div className="flex flex-col gap-0.5 mt-1.5 text-[11px]">
        <span className="text-green-600">▲ {total ? Math.round((prom / total) * 100) : 0}% {NPS_BAND_LABELS.promoter}</span>
        <span className="text-gray-500">● {total ? Math.round((pass / total) * 100) : 0}% {NPS_BAND_LABELS.neutral}</span>
        <span className="text-red-600">▼ {total ? Math.round((det / total) * 100) : 0}% {NPS_BAND_LABELS.detractor}</span>
      </div>
      <div className="text-[11px] text-gray-400 mt-1">
        {total} rating{total !== 1 ? 's' : ''} · in range
      </div>
    </div>
  );
}
export function ArrCell({ onTime, late }: { onTime: number; late: number }) {
  const tot = onTime + late;
  if (!tot) return <td className="px-3 py-2.5 text-[13px] border-t border-gray-100 text-gray-400 text-[11px]">N/T</td>;
  const p = Math.round((onTime / tot) * 100);
  const c = pcColorClass(p);
  return (
    <td className={`px-3 py-2.5 text-[13px] border-t border-gray-100 font-bold ${c}`}>
      {p}%<span className="text-[10px] text-gray-400 font-normal"> ({tot})</span>
    </td>
  );
}
export function RatingCell({ arr }: { arr: number[] }) {
  if (!arr || !arr.length) return <td className="px-3 py-2.5 text-[13px] border-t border-gray-100 text-gray-400">—</td>;
  const avg = +(arr.reduce((s, v) => s + v, 0) / arr.length).toFixed(1);
  const c = avg >= 8 ? 'text-green-600' : avg >= 6 ? 'text-amber-600' : 'text-red-600';
  return <td className={`px-3 py-2.5 text-[13px] border-t border-gray-100 font-bold ${c}`}>{avg}</td>;
}
