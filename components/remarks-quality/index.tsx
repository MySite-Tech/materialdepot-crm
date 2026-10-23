'use client';

import { ReactNode, useCallback, useMemo, useState } from 'react';

import { DEFAULT_THRESHOLDS, emptyFilters } from './constants';
import { DrawerState, RemarksDrawer } from './drawer';
import { FilterBar } from './filters';
import { useRemarkTexts } from './hooks/use-remark-texts';
import { useRemarksDataset } from './hooks/use-remarks-dataset';
import type { DrillRequest, Filters, LeadMode, ScoreCtx, ScoreMode, Thresholds, View } from './types';
import { IST, addDays, today } from './utils/dates';
import { makePredicate } from './utils/filtering';
import { compilePointers } from './utils/scoring';
import { EmptyState, ErrorBanner, FOCUS, LoadingSkeleton, Spinner } from './ui';
import { BmScorecardView } from './views/bm-scorecard';
import { DashboardView } from './views/dashboard';
import { ReportCardsView } from './views/report-cards';

const defaultFilters = () => emptyFilters([addDays(today(), -13), today()]);

const VIEWS: Array<[View, string]> = [['dash', 'Dashboard'], ['cards', 'EC report cards'], ['bm', 'BM scorecard']];

function Header({ scope, children }: { scope: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Material Depot · Internal Analytics</div>
        <h1 className="text-2xl font-bold text-gray-900 mt-0.5">Remarks Quality</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">How useful the lead remarks are · Need · Stuck · Who · Next + date</p>
      </div>
      <div className="sm:ml-auto flex flex-wrap items-center gap-2.5 text-[12px] text-gray-500 min-w-0">
        <span className="max-w-full truncate rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-600" title={scope}>
          {scope.length > 48 ? `${scope.slice(0, 48)}…` : scope}
        </span>
        {children}
      </div>
    </div>
  );
}

export default function RemarksQualityTab({ allowedBranches, seeAll }: { allowedBranches: string[]; seeAll: boolean }) {
  if (!seeAll && !allowedBranches.length) {
    return (
      <div className="px-3 sm:px-6 py-4 space-y-4 max-w-[1500px] mx-auto">
        <Header scope="No branches" />
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-14 text-center">
          <div className="text-[15px] font-semibold text-gray-800">No branches assigned to your account</div>
          <p className="mt-1.5 text-[13px] text-gray-500">Remarks Quality shows data only for the branches you manage. Ask an admin to assign your branches.</p>
        </div>
      </div>
    );
  }
  return <RemarksQualityContent allowedBranches={allowedBranches} scope={seeAll ? 'All branches' : allowedBranches.join(', ')} />;
}

function RemarksQualityContent({ allowedBranches, scope }: { allowedBranches: string[]; scope: string }) {
  const { dataset: ds, loading, error, refresh } = useRemarksDataset(allowedBranches);
  const { ensure, textOf, version } = useRemarkTexts();

  const [view, setView] = useState<View>('dash');
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [thresholds, setThresholds] = useState<Thresholds>(DEFAULT_THRESHOLDS);
  const [mode, setMode] = useState<ScoreMode>('pt');
  const [leadMode, setLeadMode] = useState<LeadMode>('best');
  const [drawer, setDrawer] = useState<DrawerState | null>(null);

  const ctx = useMemo<ScoreCtx>(
    () => ({ copyNothing: filters.copyNothing, leadMode, thresholds }),
    [filters.copyNothing, leadMode, thresholds],
  );
  const cur = useMemo(() => (ds ? ds.remarks.filter(makePredicate(ds, filters)) : []), [ds, filters]);
  const rx = useMemo(() => (ds ? compilePointers(ds.rx) : null), [ds]);

  const onDrill = useCallback((d: DrillRequest) => {
    setDrawer({ title: d.title, rows: cur.filter(d.match).sort((a, b) => b.id - a.id), tab: d.tab ?? -1, group: d.group ?? 'none' });
  }, [cur]);
  const closeDrawer = useCallback(() => setDrawer(null), []);

  const generated = ds
    ? `Data as of ${new Date(ds.generated).toLocaleString('en-IN', { timeZone: IST, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · last ${ds.days} days`
    : '';
  const resetAll = () => setFilters(defaultFilters());

  return (
    <div className="px-3 sm:px-6 py-4 space-y-4 max-w-[1500px] mx-auto">
      <Header scope={scope}>
        {generated && <span className="tabular-nums">{generated}</span>}
        <button onClick={refresh} disabled={loading} aria-label="Refresh data" title="Pull fresh data (takes about 15 seconds)"
          className={`inline-flex items-center gap-1.5 border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-700 hover:bg-gray-50 cursor-pointer disabled:opacity-60 disabled:cursor-default ${FOCUS}`}>
          {loading ? <><Spinner />{ds ? 'Refreshing…' : 'Loading…'}</> : '↻ Refresh'}
        </button>
      </Header>

      <div role="tablist" className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {VIEWS.map(([v, label]) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)}
            className={`px-4 py-2 font-semibold text-[13px] whitespace-nowrap -mb-px border-b-[3px] cursor-pointer ${FOCUS} ${view === v ? 'text-gray-900 border-amber-400' : 'text-gray-400 border-transparent hover:text-gray-600'}`}>
            {label}
          </button>
        ))}
      </div>

      {error && (
        <ErrorBanner onRetry={refresh} busy={loading}>
          Could not load remarks: {error}{ds ? ' · showing the last data that loaded' : ''}
        </ErrorBanner>
      )}
      {!ds && loading && <LoadingSkeleton note="Pulling remarks… the first load of the day takes about 15 seconds." />}

      {ds && rx && (
        <div className="space-y-4" aria-busy={loading}>
          <FilterBar ds={ds} filters={filters} setFilters={setFilters} thresholds={thresholds} setThresholds={setThresholds} hideDate={view === 'cards'} />
          {view !== 'cards' && !cur.length && <EmptyState onReset={resetAll} />}
          {view === 'dash' && !!cur.length && (
            <DashboardView ds={ds} filters={filters} ctx={ctx} cur={cur} onDrill={onDrill}
              mode={mode} setMode={setMode} leadMode={leadMode} setLeadMode={setLeadMode} />
          )}
          {view === 'cards' && <ReportCardsView ds={ds} filters={filters} ctx={ctx} ensureTexts={ensure} textOf={textOf} onReset={resetAll} />}
          {view === 'bm' && !!cur.length && <BmScorecardView ds={ds} filters={filters} ctx={ctx} cur={cur} onDrill={onDrill} />}
          {drawer && (
            <RemarksDrawer drill={drawer} dicts={ds.dicts} ctx={ctx} mode={mode} rx={rx}
              ensureTexts={ensure} textOf={textOf} textVersion={version} onClose={closeDrawer} />
          )}
        </div>
      )}
    </div>
  );
}
