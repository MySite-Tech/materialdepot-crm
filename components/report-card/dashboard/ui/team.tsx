'use client';

import { RankBadge, Th } from '.';
import { OrgPerson, STAKEHOLDERS, StakeholderRole, TEAM_PAGE_SIZE, stakeholderLabel } from '@/lib/org';
import { TeamRankingMatch } from '../types';
import { fmtMoney, fmtNum, fmtPct } from '../utils';
import { useEffect, useMemo, useState } from 'react';

const TIER_STYLE: Record<string, string> = {
  Frontline: 'bg-blue-50 text-blue-600 border-blue-200',
  'Store leadership': 'bg-amber-50 text-amber-700 border-amber-200',
  Central: 'bg-gray-800 text-white border-gray-800',
};

export function RoleBadge({ role, crmRole }: { role: StakeholderRole | null; crmRole?: string }) {
  if (!role) {
    return (
      <span className="inline-flex items-center rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[10px] font-bold text-gray-400">
        {crmRole ? crmRole.replace(/_/g, ' ') : '—'}
      </span>
    );
  }
  const s = STAKEHOLDERS[role];
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${TIER_STYLE[s.tier]}`} title={s.label}>
      {s.code}
    </span>
  );
}

export function ReportingLine({ me, reportCount, viewing, isSelf, onViewSelf }: {
  me: OrgPerson;
  reportCount: number;
  viewing: string;
  isSelf: boolean;
  onViewSelf: () => void;
}) {
  const role = me.stakeholder;
  const checker = role ? STAKEHOLDERS[role].reportsTo : null;
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-2">
          <RoleBadge role={role} crmRole={me.crmRole} />
          <div>
            <div className="text-[13px] font-bold text-gray-900">{me.name || '—'}</div>
            <div className="text-[11px] text-gray-400">{stakeholderLabel(role)}</div>
          </div>
        </div>

        <Fact label="Checked by">
          {checker ? STAKEHOLDERS[checker].label : role === 'central' ? 'Top of the chain' : 'Not defined'}
        </Fact>
        <Fact label="Reports into you">
          {reportCount === 0 ? 'Nobody' : `${reportCount} ${reportCount === 1 ? 'person' : 'people'}`}
        </Fact>
        <Fact label="Now viewing">
          <span className={isSelf ? 'text-green-700' : 'text-gray-800'}>{viewing || '—'}</span>
          {!isSelf && (
            <button onClick={onViewSelf} className="ml-2 text-[11px] font-medium text-blue-600 hover:underline cursor-pointer">
              back to mine
            </button>
          )}
        </Fact>
      </div>
      {role && (
        <div className="mt-2.5 border-t border-gray-50 pt-2 text-[11px] text-gray-400">
          <span className="font-semibold text-gray-500">Owns:</span> {STAKEHOLDERS[role].owns} · <span className="font-semibold text-gray-500">Reviewed:</span> {STAKEHOLDERS[role].reviewedOn}
        </div>
      )}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="text-[12px] font-semibold text-gray-700">{children}</div>
    </div>
  );
}

export function TeamRoster({ people, selectedPhone, onSelect }: {
  people: OrgPerson[];
  selectedPhone: string;
  onSelect: (person: OrgPerson) => void;
}) {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return people;
    return people.filter((p) =>
      p.name.toLowerCase().includes(needle) ||
      p.phone.includes(needle) ||
      p.branches.some((b) => b.toLowerCase().includes(needle)));
  }, [people, q]);

  useEffect(() => { setPage(1); }, [q, people]);

  const pages = Math.max(1, Math.ceil(filtered.length / TEAM_PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * TEAM_PAGE_SIZE;
  const rows = filtered.slice(start, start + TEAM_PAGE_SIZE);

  return (
    <div className="space-y-2">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search your team by name, phone or store…"
        className="w-full max-w-sm rounded-lg border border-gray-200 px-3 py-1.5 text-[12px] text-gray-700 outline-none focus:border-gray-300"
      />
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[620px] border-collapse">
          <thead className="border-b border-gray-100">
            <tr><Th>Role</Th><Th>Name</Th><Th>Phone</Th><Th>Store</Th><Th right>Report card</Th></tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-[12px] text-gray-400">No match</td></tr>
            )}
            {rows.map((p) => {
              const active = p.phone === selectedPhone;
              return (
                <tr key={String(p.id)} className={`border-b border-gray-50 last:border-0 ${active ? 'bg-amber-50/60' : ''}`}>
                  <td className="px-4 py-2.5"><RoleBadge role={p.stakeholder} crmRole={p.crmRole} /></td>
                  <td className={`px-4 py-2.5 text-[13px] font-semibold ${active ? 'text-amber-600' : 'text-gray-800'}`}>{p.name || '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-[12px] text-gray-500">{p.phone || '—'}</td>
                  <td className="px-4 py-2.5 text-[12px] text-gray-400">{p.branches.length ? p.branches.join(', ') : 'All stores'}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      onClick={() => onSelect(p)}
                      disabled={active || !p.phone}
                      className="rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-default disabled:opacity-40 cursor-pointer"
                    >
                      {active ? 'Showing' : 'View'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-[11px] text-gray-400">
        <span>Showing {filtered.length === 0 ? 0 : start + 1}–{start + rows.length} of {filtered.length}</span>
        <span className="flex gap-2">
          <button onClick={() => setPage(safePage - 1)} disabled={safePage <= 1}
            className="rounded border border-gray-200 px-2 py-0.5 disabled:opacity-40 cursor-pointer disabled:cursor-default">Prev</button>
          <button onClick={() => setPage(safePage + 1)} disabled={safePage >= pages}
            className="rounded border border-gray-200 px-2 py-0.5 disabled:opacity-40 cursor-pointer disabled:cursor-default">Next</button>
        </span>
      </div>
    </div>
  );
}

export function TeamRankingTable({ match, teamSize }: { match: TeamRankingMatch; teamSize: number }) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-gray-400">My Team</div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[520px] border-collapse">
          <thead className="border-b border-gray-100">
            <tr>
              <Th>Rank</Th><Th>BM Name</Th><Th>Store</Th>
              <Th right>Walkins</Th><Th right>Conv %</Th><Th right>Cart %</Th><Th right>Sale Value</Th><Th right>FU %</Th>
            </tr>
          </thead>
          <tbody>
            {match.matched.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-6 text-center text-[12px] text-gray-400">Nobody on your team is ranked in this range</td></tr>
            )}
            {match.matched.map((r) => (
              <tr key={`${r.rank}-${r.bm_name}`} className={`border-b border-gray-50 last:border-0 ${r.is_selected ? 'bg-amber-50/60' : ''}`}>
                <td className="px-4 py-2.5"><RankBadge rank={r.rank} /></td>
                <td className={`px-4 py-2.5 text-[13px] font-semibold ${r.is_selected ? 'text-amber-600' : 'text-gray-800'}`}>{r.bm_name}</td>
                <td className="px-4 py-2.5 text-[12px] text-gray-400">{r.store}</td>
                <td className="px-4 py-2.5 text-right font-mono text-[12px] text-gray-700">{fmtNum(r.walkins)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-[12px] text-gray-700">{fmtPct(r.conv_pct)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-[12px] text-gray-700">{fmtPct(r.cart_pct)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-[12px] text-gray-700">{fmtMoney(r.sale_value)}</td>
                <td className="px-4 py-2.5 text-right font-mono text-[12px] text-gray-700">{fmtPct(r.fu_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-1.5 text-[11px] text-gray-400">
        {match.matched.length} of {teamSize} matched to a company-wide ranking row by exact name.
        {match.unranked > 0 && <> {match.unranked} not ranked in this range.</>}
        {match.ambiguous > 0 && <> {match.ambiguous} could not be matched — the name is not unique, so no row is guessed.</>}
      </div>
    </div>
  );
}
