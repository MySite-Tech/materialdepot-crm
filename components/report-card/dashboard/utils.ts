'use client';

import { MONTH_SHORT } from './constants';
import { OrgPerson, normaliseName } from '@/lib/org';
import { RankingRow } from '@/lib/api';
import { TeamRankingMatch } from './types';

export const fmtMoney = (n: number) =>
  n >= 10000000
    ? `₹${(n / 10000000).toFixed(2)} Cr`
    : n >= 100000
    ? `₹${(n / 100000).toFixed(1)} L`
    : `₹${Math.round(n).toLocaleString('en-IN')}`;

export const fmtPct = (n: number) => `${(n ?? 0).toFixed(1)}%`;

export const fmtNum = (n: number) => (n ?? 0).toLocaleString('en-IN');

export const fmtDate = (iso: string) => {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTH_SHORT[m - 1]} ${y}`;
};

export const fmtDateShort = (iso: string) => {
  if (!iso) return '—';
  const [, m, d] = iso.split('-').map(Number);
  if (!m || !d) return iso;
  return `${MONTH_SHORT[m - 1]} ${String(d).padStart(2, '0')}`;
};

export const monthStartISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
};

export const monthEndISO = () => {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
};

export const countByName = (names: string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const raw of names) {
    const key = normaliseName(raw);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

export const matchTeamRankings = (rows: RankingRow[], team: OrgPerson[]): TeamRankingMatch => {
  const inTeam = countByName(team.map((p) => p.name));
  const inRows = countByName(rows.map((r) => r.bm_name));
  const resolvable = new Set([...inTeam].filter(([name, n]) => n === 1 && inRows.get(name) === 1).map(([name]) => name));
  const matched = rows.filter((r) => resolvable.has(normaliseName(r.bm_name)));
  const ambiguous = [...inTeam].filter(([name, n]) => n > 1 || (inRows.get(name) ?? 0) > 1).length;
  return { matched, ambiguous, unranked: inTeam.size - resolvable.size - ambiguous };
};
