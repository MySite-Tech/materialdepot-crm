'use client';

import { MultiDropdown } from '../ui/dropdowns';
import { OrgPerson, STAKEHOLDERS, StakeholderRole, TEAM_PAGE_SIZE, positionsPresent } from '@/lib/org';
import { RoleBadge } from './reporting-line';
import { TeamPerformance } from './types';
import { Th } from '../ui';
import { fmtMoney, fmtNum, fmtPct } from '../utils';
import { useEffect, useMemo, useState } from 'react';

const Cell = ({ value, mono = true }: { value: React.ReactNode; mono?: boolean }) => (
  <td className={`px-3 py-2.5 text-right text-[12px] text-gray-700 ${mono ? 'font-mono' : ''}`}>{value}</td>
);

const num = (v: number | null) => (v === null ? <span className="text-gray-300">—</span> : fmtNum(v));
const pct = (v: number | null) => (v === null ? <span className="text-gray-300">—</span> : fmtPct(v));
const money = (v: number | null) => (v === null ? <span className="text-gray-300">—</span> : fmtMoney(v));

export function TeamPerformanceSection({ people, performance, selectedPhone, onSelect }: {
  people: OrgPerson[];
  performance: TeamPerformance;
  selectedPhone: string;
  onSelect: (person: OrgPerson) => void;
}) {
  const [positions, setPositions] = useState<StakeholderRole[]>([]);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const options = useMemo(
    () => positionsPresent(people).map((role) => ({ label: STAKEHOLDERS[role].label, value: role })),
    [people],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const wanted = new Set(positions);
    return performance.rows.filter(({ person }) => {
      if (wanted.size > 0 && (!person.stakeholder || !wanted.has(person.stakeholder))) return false;
      if (!needle) return true;
      return person.name.toLowerCase().includes(needle)
        || person.phone.includes(needle)
        || person.branches.some((b) => b.toLowerCase().includes(needle));
    });
  }, [performance.rows, positions, q]);

  useEffect(() => { setPage(1); }, [q, positions, performance.rows]);

  const totals = useMemo(() => filtered.reduce((acc, { metrics }) => {
    if (!metrics) return acc;
    return {
      people: acc.people + 1,
      footfall: acc.footfall + (metrics.footfall ?? 0),
      orders: acc.orders + metrics.orders,
      salesValue: acc.salesValue + metrics.salesValue,
      pipelineValue: acc.pipelineValue + metrics.pipelineValue,
    };
  }, { people: 0, footfall: 0, orders: 0, salesValue: 0, pipelineValue: 0 }), [filtered]);

  const pages = Math.max(1, Math.ceil(filtered.length / TEAM_PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * TEAM_PAGE_SIZE;
  const rows = filtered.slice(start, start + TEAM_PAGE_SIZE);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <MultiDropdown values={positions} placeholder="All Positions" searchable
          onChange={(v) => setPositions(v as StakeholderRole[])} options={options} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, phone or store…"
          className="flex-1 min-w-[220px] max-w-sm rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] text-gray-700 outline-none focus:border-gray-300"
        />
        {performance.loading && <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />}
      </div>

      <div className="flex flex-wrap gap-3">
        <Tile label="People" value={fmtNum(filtered.length)} />
        <Tile label="Footfall attended" value={performance.footfallFailed ? 'Unknown' : fmtNum(totals.footfall)} />
        <Tile label="Orders" value={performance.leadsFailed ? 'Unknown' : fmtNum(totals.orders)} />
        <Tile label="Sales value closed" value={performance.leadsFailed ? 'Unknown' : fmtMoney(totals.salesValue)} />
        <Tile label="Live pipeline" value={performance.leadsFailed ? 'Unknown' : fmtMoney(totals.pipelineValue)} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[1040px] border-collapse">
          <thead className="border-b border-gray-100">
            <tr>
              <Th>Position</Th><Th>Name</Th><Th>Store</Th>
              <Th right>Footfall</Th><Th right>Carts</Th><Th right>Cart %</Th>
              <Th right>Orders</Th><Th right>Conv %</Th><Th right>Sales Value</Th><Th right>AOV</Th>
              <Th right>Pipeline</Th><Th right>Lost</Th><Th right>Card</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={13} className="px-4 py-6 text-center text-[12px] text-gray-400">No match</td></tr>
            )}
            {rows.map(({ person, metrics }) => {
              const active = person.phone === selectedPhone;
              return (
                <tr key={String(person.id)} className={`border-b border-gray-50 last:border-0 ${active ? 'bg-amber-50/60' : ''}`}>
                  <td className="px-3 py-2.5"><RoleBadge role={person.stakeholder} crmRole={person.crmRole} /></td>
                  <td className={`px-3 py-2.5 text-[13px] font-semibold ${active ? 'text-amber-600' : 'text-gray-800'}`}>{person.name || '—'}</td>
                  <td className="px-3 py-2.5 text-[12px] text-gray-400">{person.branches.length ? person.branches.join(', ') : 'All stores'}</td>
                  {metrics === null ? (
                    <td colSpan={9} className="px-3 py-2.5 text-right text-[12px] text-gray-400">Unknown — the stats call failed</td>
                  ) : (
                    <>
                      <Cell value={num(metrics.footfall)} />
                      <Cell value={num(metrics.carts)} />
                      <Cell value={pct(metrics.cartPct)} />
                      <Cell value={fmtNum(metrics.orders)} />
                      <Cell value={pct(metrics.convPct)} />
                      <Cell value={fmtMoney(metrics.salesValue)} />
                      <Cell value={money(metrics.aov)} />
                      <Cell value={<span title={`${metrics.pipelineCount} open carts`}>{fmtMoney(metrics.pipelineValue)}</span>} />
                      <Cell value={fmtNum(metrics.lostCount)} />
                    </>
                  )}
                  <td className="px-3 py-2.5 text-right">
                    <button
                      onClick={() => onSelect(person)}
                      disabled={active || !person.phone}
                      className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-default disabled:opacity-40 cursor-pointer"
                    >
                      {active ? 'Showing' : 'Open'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-4 text-[11px] text-gray-400">
        <span>Showing {filtered.length === 0 ? 0 : start + 1}–{start + rows.length} of {filtered.length}</span>
        <span className="flex gap-2">
          <button onClick={() => setPage(safePage - 1)} disabled={safePage <= 1}
            className="rounded border border-gray-200 px-2 py-0.5 disabled:opacity-40 cursor-pointer disabled:cursor-default">Prev</button>
          <button onClick={() => setPage(safePage + 1)} disabled={safePage >= pages}
            className="rounded border border-gray-200 px-2 py-0.5 disabled:opacity-40 cursor-pointer disabled:cursor-default">Next</button>
        </span>
      </div>

      <Notes performance={performance} shown={filtered.length} />
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-2.5 min-w-[140px]">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="mt-0.5 font-mono text-[15px] font-bold text-gray-900">{value}</div>
    </div>
  );
}

function Notes({ performance, shown }: { performance: TeamPerformance; shown: number }) {
  const unmatched = performance.rows.filter((r) => !r.footfallMatched).length;
  return (
    <div className="space-y-1 text-[11px] text-gray-400">
      {performance.leadsFailed && (
        <div className="text-amber-700">Orders, sales value, pipeline and lost counts did not load — they read Unknown rather than zero.</div>
      )}
      {performance.footfallFailed && (
        <div className="text-amber-700">The footfall funnel did not load, so footfall, carts, cart % and conversion % are Unknown.</div>
      )}
      {!performance.footfallFailed && unmatched > 0 && (
        <div>
          {unmatched} of {performance.rows.length} had no footfall row in this range
          {performance.footfallAmbiguous > 0 && <>, {performance.footfallAmbiguous} of them because the name is not unique — no row is guessed</>}.
        </div>
      )}
      <div>Cart %, conversion % and footfall come from the footfall funnel; orders, sales value, AOV, pipeline and lost come from lead stats keyed on phone. {shown} row{shown === 1 ? '' : 's'} shown.</div>
    </div>
  );
}
