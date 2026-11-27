'use client';

import { MultiDropdown } from '../ui/dropdowns';
import { OrgPerson, STAKEHOLDERS, StakeholderRole, TEAM_PAGE_SIZE, normaliseName, positionsPresent } from '@/lib/org';
import { RoleBadge } from './reporting-line';
import { useTeamFootfall } from './hooks/use-team-footfall';
import { useTeamLeadStats } from './hooks/use-team-lead-stats';
import { TeamFootfall, TeamLeadStats, TeamQuery } from './types';
import { metricsFor } from './utils';
import { Th } from '../ui';
import { fmtMoney, fmtNum, fmtPct } from '../utils';
import { useEffect, useMemo, useState } from 'react';

const Cell = ({ value, mono = true }: { value: React.ReactNode; mono?: boolean }) => (
  <td className={`px-3 py-2.5 text-right text-[12px] text-gray-700 ${mono ? 'font-mono' : ''}`}>{value}</td>
);

const num = (v: number | null) => (v === null ? <span className="text-gray-300">—</span> : fmtNum(v));
const pct = (v: number | null) => (v === null ? <span className="text-gray-300">—</span> : fmtPct(v));
const money = (v: number | null) => (v === null ? <span className="text-gray-300">—</span> : fmtMoney(v));

const missingStats = (person: OrgPerson, leads: TeamLeadStats) => {
  if (!person.phone) return 'No phone on this login, so no lead stats';
  if (leads.failedPhones.has(person.phone)) return 'Unknown — the stats call failed';
  if (leads.loading) return 'Loading…';
  return 'Unknown — Django sent no figures for this number';
};

export function TeamPerformanceSection({ people, query, selectedPhone, onSelect }: {
  people: OrgPerson[];
  query: TeamQuery;
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

  const footfall = useTeamFootfall(people, query);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const wanted = new Set(positions);
    return people.filter((person) => {
      if (wanted.size > 0 && (!person.stakeholder || !wanted.has(person.stakeholder))) return false;
      if (!needle) return true;
      return person.name.toLowerCase().includes(needle)
        || person.phone.includes(needle)
        || person.branches.some((b) => b.toLowerCase().includes(needle));
    });
  }, [people, positions, q]);

  useEffect(() => { setPage(1); }, [q, positions, people]);

  const pages = Math.max(1, Math.ceil(filtered.length / TEAM_PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * TEAM_PAGE_SIZE;
  const pagePeople = useMemo(() => filtered.slice(start, start + TEAM_PAGE_SIZE), [filtered, start]);

  const leads = useTeamLeadStats(filtered, pagePeople, query);
  const hitFor = (person: OrgPerson) => (footfall.failed ? undefined : footfall.index.byName.get(normaliseName(person.name)));
  const footfallTotal = useMemo(
    () => filtered.reduce((t, person) => t + (footfall.index.byName.get(normaliseName(person.name))?.footfall_users ?? 0), 0),
    [filtered, footfall.index],
  );
  const rows = pagePeople.map((person) => {
    const stats = leads.byPhone[person.phone];
    return { person, metrics: stats ? metricsFor(stats, hitFor(person)) : null };
  });
  const total = leads.totalFailed ? null : leads.total;

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
        {(leads.loading || footfall.loading) && <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />}
      </div>

      <div className="flex flex-wrap gap-3">
        <Tile label="People" value={fmtNum(filtered.length)} />
        <Tile label="Footfall attended" value={footfall.failed ? 'Unknown' : fmtNum(footfallTotal)} />
        <Tile label="Orders" value={total ? fmtNum(total.won.count) : leads.totalFailed ? 'Unknown' : '…'} />
        <Tile label="Sales value closed" value={total ? fmtMoney(total.won.value) : leads.totalFailed ? 'Unknown' : '…'} />
        <Tile label="Live pipeline" value={total ? fmtMoney(total.active.value) : leads.totalFailed ? 'Unknown' : '…'} />
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
                    <td colSpan={9} className="px-3 py-2.5 text-right text-[12px] text-gray-400">{missingStats(person, leads)}</td>
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

      <Notes people={filtered} footfall={footfall} leads={leads} />
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

function Notes({ people, footfall, leads }: { people: OrgPerson[]; footfall: TeamFootfall; leads: TeamLeadStats }) {
  const unmatched = people.filter((p) => !footfall.index.byName.has(normaliseName(p.name))).length;
  const ambiguous = people.filter((p) => footfall.index.ambiguous.has(normaliseName(p.name))).length;
  const shown = people.length;
  return (
    <div className="space-y-1 text-[11px] text-gray-400">
      {(leads.totalFailed || leads.failedPhones.size > 0) && (
        <div className="text-amber-700">Some orders, sales value, pipeline or lost figures did not load — they read Unknown rather than zero.</div>
      )}
      {footfall.failed && (
        <div className="text-amber-700">The footfall funnel did not load, so footfall, carts, cart % and conversion % are Unknown.</div>
      )}
      {!footfall.failed && !footfall.loading && unmatched > 0 && (
        <div>
          {unmatched} of {shown} had no footfall row in this range
          {ambiguous > 0 && <>, {ambiguous} of them because the name is not unique — no row is guessed</>}.
        </div>
      )}
      <div>Cart %, conversion % and footfall come from the footfall funnel; orders, sales value, AOV, pipeline and lost come from lead stats keyed on phone. The tiles read the whole filtered team in one request; the rows read only the page shown. {shown} row{shown === 1 ? '' : 's'} shown.</div>
    </div>
  );
}
