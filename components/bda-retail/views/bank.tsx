'use client';

import { useMemo, useState } from 'react';
import { Spinner, inputCls } from '../../b2b/ui/inbound-chips';
import { LensTileGroup, LensTiles } from '../../b2b/ui/lens-tiles';
import { COHORTS, PRIORITIES } from '@/lib/bda-retail/constants';
import type { BdaPerson, LeadStage, LeadView, Priority } from '@/lib/bda-retail/types';
import { BankLens, COHORT_GROUPS, bankLensMatches, rupees } from '@/lib/bda-retail/utils';
import { PRIORITY_COLOR, PageHead, labelCls, selectCls } from '../ui/chips';
import { AssignBar } from '../ui/assign-bar';
import { LeadTable } from '../ui/lead-table';

const STAGES: Array<[LeadStage, string]> = [
  ['new', 'Not called'], ['attempting', 'Trying'], ['follow_up', 'Follow-up'], ['unreachable', 'Unreachable'], ['closed', 'Closed'],
];

export interface BankFilters {
  lens: BankLens;
  month: string;
}

export function BankView({ views, loading, months, filters, setFilters, onOpen, fetchButton, bdas, onAssign }: {
  views: LeadView[];
  loading: boolean;
  months: string[];
  filters: BankFilters;
  setFilters: (f: BankFilters) => void;
  onOpen: (l: LeadView) => void;
  fetchButton: React.ReactNode;
  bdas: BdaPerson[];
  onAssign: (assignments: Array<{ key: string; phone: string }>, step: (s: string) => void) => Promise<number>;
}) {
  const { lens, month } = filters;
  const [search, setSearch] = useState('');
  const [priority, setPriority] = useState<'' | Priority>('');
  const [stage, setStage] = useState<'' | LeadStage>('');
  const [branch, setBranch] = useState('');
  const [bda, setBda] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const toggle = (keys: string[], on: boolean) => {
    const next = new Set(picked);
    for (const k of keys) {
      if (on) next.add(k);
      else next.delete(k);
    }
    setPicked(next);
  };

  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    return views.filter((l) =>
      (!month || l.month === month)
      && (!priority || l.priority === priority)
      && (!stage || l.stage === stage)
      && (!branch || l.branch === branch)
      && (!bda || (bda === '-' ? !l.claim : l.claim?.by === bda))
      && (!q || [l.name, l.phone, l.ref, l.bm].join(' ').toLowerCase().includes(q)));
  }, [views, month, priority, stage, branch, bda, search]);

  const shown = useMemo(
    () => base.filter((l) => bankLensMatches(lens, l)).sort((a, b) => b.enteredOn.localeCompare(a.enteredOn) || b.value - a.value),
    [base, lens],
  );

  const branches = useMemo(() => [...new Set(views.map((l) => l.branch).filter(Boolean))].sort(), [views]);
  const workedBy = useMemo(() => [...new Set(views.map((l) => l.claim?.by).filter((x): x is string => !!x))].sort(), [views]);

  const groups: LensTileGroup<BankLens>[] = useMemo(() => COHORT_GROUPS.map((g) => {
    const head: BankLens = `group:${g}`;
    return {
      title: g,
      head: { key: head, label: `${g} · ${base.filter((l) => bankLensMatches(head, l)).length}`, rule: `Every lead in ${g}` },
      tiles: COHORTS.filter((c) => c.group === g).map((c) => {
        const rows = base.filter((l) => bankLensMatches(c.key, l));
        const open = rows.filter((l) => l.stage === 'new').length;
        return {
          key: c.key,
          title: `${c.priority} · ${c.label}`,
          rule: c.rule,
          accent: PRIORITY_COLOR[c.priority],
          value: rows.length.toLocaleString('en-IN'),
          sub: `${open.toLocaleString('en-IN')} not called`,
          muted: rows.length === 0,
        };
      }),
    };
  }), [base]);

  const totals = useMemo(() => ({
    value: shown.reduce((s, l) => s + l.value, 0),
    open: shown.filter((l) => l.stage === 'new').length,
    followUp: shown.filter((l) => l.stage === 'follow_up').length,
    closed: shown.filter((l) => l.stage === 'closed').length,
  }), [shown]);

  const active = [lens !== 'all', !!priority, !!stage, !!branch, !!bda, !!search.trim()].filter(Boolean).length;
  const clear = () => {
    setFilters({ lens: 'all', month });
    setPriority(''); setStage(''); setBranch(''); setBda(''); setSearch('');
  };

  return (
    <div className="p-4 sm:p-6">
      <PageHead title="Lead bank" sub={`Every lead the cohorts found, by the month it qualified${loading ? ' · loading…' : ` · ${shown.length.toLocaleString('en-IN')} shown`}`}>
        {fetchButton}
      </PageHead>

      <div className="bg-white rounded-lg border border-gray-200 p-3 mb-3">
        <div className="flex items-end gap-2.5 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <label className={labelCls}>Search</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, phone, enquiry ID, BM…" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Month</label>
            <select value={month} onChange={(e) => setFilters({ lens, month: e.target.value })} className={selectCls}>
              <option value="">Every month</option>
              {months.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Priority</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as '' | Priority)} className={selectCls}>
              <option value="">All priorities</option>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Stage</label>
            <select value={stage} onChange={(e) => setStage(e.target.value as '' | LeadStage)} className={selectCls}>
              <option value="">All stages</option>
              {STAGES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Branch</label>
            <select value={branch} onChange={(e) => setBranch(e.target.value)} className={selectCls}>
              <option value="">All branches</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>BDA</label>
            <select value={bda} onChange={(e) => setBda(e.target.value)} className={selectCls}>
              <option value="">Anyone</option>
              <option value="-">Nobody yet</option>
              {workedBy.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          {active > 0 && (
            <button onClick={clear} className="px-3 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white text-gray-500 whitespace-nowrap">Clear {active}</button>
          )}
        </div>
      </div>

      <LensTiles groups={groups} active={lens} onPick={(k) => setFilters({ lens: lens === k ? 'all' : k, month })} />

      {loading && views.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 py-16"><Spinner label="Loading the lead bank…" /></div>
      ) : (
        <LeadTable
          leads={shown}
          onOpen={onOpen}
          showOwner
          empty={views.length ? 'No leads match these filters.' : 'The bank is empty. Fetch new leads to fill it.'}
          resetKey={`${lens}|${month}|${priority}|${stage}|${branch}|${bda}|${search}`}
          picked={picked}
          onToggle={toggle}
          head={(
            <>
            <AssignBar bdas={bdas} shown={shown} views={views} picked={picked} setPicked={setPicked} onAssign={onAssign} />
            <div className="flex items-baseline gap-3 px-4 py-2.5 border-b border-gray-100 flex-wrap">
              <span className="text-[11.5px] text-gray-600"><strong>{shown.length.toLocaleString('en-IN')}</strong> leads</span>
              <span className="text-[11.5px] text-gray-500">{totals.open.toLocaleString('en-IN')} not called</span>
              <span className="text-[11.5px] text-gray-500">{totals.followUp} in follow-up</span>
              <span className="text-[11.5px] text-gray-500">{totals.closed} closed</span>
              <span className="text-[11.5px] text-gray-700 font-mono">{rupees(totals.value)} cart and order value</span>
            </div>
            </>
          )}
        />
      )}
    </div>
  );
}
