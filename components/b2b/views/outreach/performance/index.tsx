'use client';

import { OutreachLead } from '../../../models/mock-data';
import { WaitlistSignup } from '../../../models/outreach';
import { sameRep } from '../../../models/outreach/handover';
import { Rep } from '../../../models/outreach/intake';
import { KpiValue, OUTREACH_KPIS, OutreachKpiDef, kpiTarget, outreachKpis } from '../../../models/outreach/kpis';
import { normalisePhone } from '@/lib/org/utils';
import { useMemo } from 'react';

const fmtValue = (def: OutreachKpiDef, v: number | null): string => {
  if (v === null) return def.key === 'waitlist' ? 'Unknown' : '—';
  if (def.unit === '%') return `${v}%`;
  if (def.unit === 'L') return `₹${v}L`;
  return String(v);
};

const fmtTarget = (def: OutreachKpiDef, t: number): string =>
  def.unit === '%' ? `${t}%` : def.unit === 'L' ? `₹${t}L` : String(t);

const tone = (v: number | null, t: number) => {
  if (v === null) return { bar: '#D1D5DB', text: 'text-gray-400' };
  const r = v / t;
  if (r >= 1) return { bar: '#16A34A', text: 'text-green-700' };
  if (r >= 0.6) return { bar: '#F59E0B', text: 'text-amber-700' };
  return { bar: '#EF4444', text: 'text-red-600' };
};

export const repOwns = (rep: Rep) => (l: OutreachLead): boolean => {
  const p = normalisePhone(l.bmPhone);
  return p.length === 10 && rep.phone ? p === normalisePhone(rep.phone) : sameRep(l.bm, rep.name);
};

function KpiTile({ def, k, heads }: { def: OutreachKpiDef; k: KpiValue; heads: number }) {
  const target = kpiTarget(def, heads);
  const t = tone(k.value, target);
  const w = k.value === null ? 0 : Math.min(100, Math.round((k.value / target) * 100));
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-3 py-2.5 min-w-0" title={def.rule}>
      <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 truncate">{def.label}</div>
      <div className="flex items-baseline gap-1 mt-0.5">
        <span className={`text-[20px] font-bold leading-tight ${t.text}`}>{fmtValue(def, k.value)}</span>
        <span className="text-[11px] text-gray-400">/ {fmtTarget(def, target)}</span>
      </div>
      <div className="h-1 rounded bg-gray-100 mt-1.5 overflow-hidden">
        <div className="h-full rounded" style={{ width: `${w}%`, background: t.bar }} />
      </div>
      {k.sub && <div className="text-[10px] text-gray-400 mt-1 leading-snug line-clamp-2">{k.sub}</div>}
    </div>
  );
}

export function monthOptions(today: string, n = 6): string[] {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    return d.toISOString().slice(0, 7);
  });
}

export const monthLabel = (ym: string): string =>
  new Date(`${ym}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });

export function KpiStrip({ leads, month, waitlist, heads, title }: {
  leads: OutreachLead[]; month: string; waitlist: Map<string, WaitlistSignup> | null; heads: number; title: string;
}) {
  const k = useMemo(() => outreachKpis(leads, month, waitlist), [leads, month, waitlist]);
  return (
    <div className="mb-4">
      <div className="flex items-baseline gap-2 mb-1.5">
        <h2 className="text-[12px] font-bold text-gray-800">{title}</h2>
        <span className="text-[10.5px] text-gray-400">
          {monthLabel(month)} · targets {heads > 1 ? `for ${heads} BMs` : 'per head'} from the Studio Team KPI sheet · hover a tile for its rule
        </span>
      </div>
      {(['Effort', 'Output'] as const).map((kind) => (
        <div key={kind} className="grid grid-cols-[52px_1fr] gap-2 mb-2 items-stretch">
          <div className="text-[9px] font-bold uppercase tracking-wider text-gray-400 pt-3">{kind}</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {OUTREACH_KPIS.filter((d) => d.kind === kind).map((d) => <KpiTile key={d.key} def={d} k={k[d.key]} heads={heads} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TeamTable({ leads, reps, month, waitlist, onPick }: {
  leads: OutreachLead[]; reps: Rep[]; month: string; waitlist: Map<string, WaitlistSignup> | null; onPick: (rep: Rep) => void;
}) {
  const rows = useMemo(() => reps.map((rep) => ({ rep, k: outreachKpis(leads.filter(repOwns(rep)), month, waitlist) })), [leads, reps, month, waitlist]);
  const orphans = useMemo(() => leads.filter((l) => !reps.some((r) => repOwns(r)(l))), [leads, reps]);
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-baseline gap-2">
        <h3 className="text-[12px] font-bold text-gray-800">Per BM · {monthLabel(month)}</h3>
        <span className="text-[10px] text-gray-400">Each cell is against that person&apos;s own target. Click a row to see their leads.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60">
              <th className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left">BM</th>
              {OUTREACH_KPIS.map((d) => (
                <th key={d.key} title={d.rule} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-right whitespace-nowrap">
                  {d.label}<span className="block font-semibold normal-case tracking-normal text-gray-300">/ {fmtTarget(d, d.target)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ rep, k }) => (
              <tr key={rep.phone || rep.name} onClick={() => onPick(rep)} className="border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                <td className="px-3 py-2 font-semibold text-gray-900 whitespace-nowrap">{rep.name}</td>
                {OUTREACH_KPIS.map((d) => (
                  <td key={d.key} title={k[d.key].sub} className={`px-3 py-2 text-right font-mono whitespace-nowrap ${tone(k[d.key].value, d.target).text}`}>
                    {fmtValue(d, k[d.key].value)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {orphans.length > 0 && (
        <p className="px-4 py-2.5 border-t border-gray-100 text-[11px] text-amber-700 leading-snug">
          {`${orphans.length} lead(s) belong to a BM who is not on the Outreach team (${[...new Set(orphans.map((l) => l.bm || 'no BM'))].slice(0, 5).join(', ')}) and count in the team totals only. Reassign them, or add that person under B2B → Team.`}
        </p>
      )}
    </div>
  );
}
