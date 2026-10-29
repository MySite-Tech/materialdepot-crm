'use client';

import OutreachDrawer from '../../drawers/outreach/index';
import { OutreachLead } from '../../models/mock-data';
import { OutreachStatus, STUDIO_WAITLIST_URL, istToday, outreachGateErrors } from '../../models/outreach';
import { repOwns } from '../../models/outreach/handover';
import { inboundPool } from '../../models/outreach/intake';
import { OUTREACH_KPIS, Period, monthPeriod, outreachKpis, waitlistFor, waitlistIndex } from '../../models/outreach/kpis';
import { ExportFormat, ExportScope } from '../../types/export';
import { ExportButton } from '../../ui/export-button';
import { exportRowsCsv, exportRowsExcel, todayStr } from '../../utils/export';
import { Spinner } from '../../ui/inbound-chips';
import { EXPORT_HEADERS, LENS, NO_FILTERS } from './constants';
import { useOutreachData } from './hooks/use-outreach-data';
import { useOutreachLenses } from './hooks/use-outreach-lenses';
import { useOutreachScope } from './hooks/use-outreach-scope';
import { ImportModal } from './intake/import-modal';
import { FromInbound } from './intake';
import { LensStrip } from './lenses';
import { OutreachBoard } from './lists/board';
import { columnsFor } from './lists/columns';
import { BmChips, Toolbar } from './lists/filters';
import { LensTable } from './lists/table';
import { CreateLeadModal, MoveModal } from './modals';
import { Scorecard } from './performance';
import { PeriodPicker } from './performance/period';
import { TeamTable } from './performance/team-table';
import { Lens, OutreachFilters, RangeKey, WorkLens } from './types';
import { bmOptions, fmtRange, matchesFilters, nowIso, rangeFor, toExportRow } from './utils';
import type { B2BTeamLoad, Viewer } from '@/lib/b2b/team/types';
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';

const seg = (on: boolean) => `px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap ${on ? 'bg-[#1A1A1A] text-white' : 'bg-white text-gray-500 hover:text-gray-800'}`;

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-md border border-gray-200 overflow-hidden shrink-0">
      {options.map(([k, label]) => <button key={k} onClick={() => onChange(k)} className={seg(value === k)}>{label}</button>)}
    </div>
  );
}

export default function OutreachLeads({ team, viewer }: { team: B2BTeamLoad; viewer: Viewer }) {
  const scope = useOutreachScope(team, viewer);
  const data = useOutreachData(scope.me.name || 'Unknown user');
  const today = istToday();
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => { setNowMs(Date.now()); }, [data.leads]);

  const isKamView = scope.isKam && scope.mode === 'mine';
  const defaultLens: WorkLens = isKamView ? 'signoff' : 'action';
  const [lens, setLens] = useState<Lens>(defaultLens);
  const [kpiShow, setKpiShow] = useState<'all' | 'counted' | 'missed'>('all');
  const [view, setView] = useState<'list' | 'board'>('list');
  const [scoreView, setScoreView] = useState<'tiles' | 'team'>('tiles');
  const [bm, setBm] = useState('all');
  const [periodKey, setPeriodKey] = useState('month');
  const [custom, setCustom] = useState<Period>({ from: '', to: '' });
  const [f, setF] = useState<OutreachFilters>(NO_FILTERS);
  const setFilters = (patch: Partial<OutreachFilters>) => setF((cur) => ({ ...cur, ...patch }));
  const lensBeforeSearch = useRef<Lens | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [move, setMove] = useState<{ lead: OutreachLead; target: OutreachStatus } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const period = useMemo<Period>(
    () => (periodKey.startsWith('m:') ? monthPeriod(periodKey.slice(2)) : rangeFor(periodKey as RangeKey, today, custom) ?? monthPeriod(today.slice(0, 7))),
    [periodKey, today, custom],
  );
  const added = useMemo(() => rangeFor(f.added, today, { from: f.addedFrom, to: f.addedTo }), [f.added, f.addedFrom, f.addedTo, today]);

  const waitIdx = useMemo(() => waitlistIndex(data.waitlist), [data.waitlist]);
  const scoped = useMemo(() => data.leads.filter(scope.owns), [data.leads, scope]);
  const teamLive = scope.mode !== 'open';
  const bms = useMemo(() => bmOptions(scoped, scope.reps, teamLive), [scoped, scope.reps, teamLive]);
  const canPickBm = scope.mode !== 'mine';
  const pickedRep = useMemo(
    () => (!canPickBm || bm === 'all' ? null : bms.find((o) => o.rep.name === bm)?.rep ?? { name: bm }),
    [canPickBm, bm, bms],
  );
  const bmLeads = useMemo(() => (pickedRep ? scoped.filter(repOwns(pickedRep)) : scoped), [scoped, pickedRep]);
  const filtered = useMemo(() => bmLeads.filter((l) => matchesFilters(l, f, added)), [bmLeads, f, added]);
  const kpis = useMemo(() => outreachKpis(bmLeads, period, waitIdx), [bmLeads, period, waitIdx]);
  const pool = useMemo(() => (data.inbound ? inboundPool(data.inbound, data.leads) : null), [data.inbound, data.leads]);
  const lenses = useOutreachLenses({ leads: filtered, kpis, lens, isKam: isKamView, today, nowMs, waitlist: waitIdx, pool });

  const validLens = lens.startsWith('kpi:') ? !isKamView : lenses.groups.some((g) => g.head === lens || g.lenses.includes(lens as WorkLens));
  useEffect(() => { if (!validLens) setLens(defaultLens); }, [validLens, defaultLens]);

  const pickLens = (k: Lens) => {
    setLens(k);
    setView('list');
    setKpiShow('all');
    lensBeforeSearch.current = null;
    const top = tableRef.current?.getBoundingClientRect().top;
    if (top !== undefined && top > window.innerHeight - 160) window.scrollBy({ top: top - 140, behavior: 'smooth' });
  };

  const onSearch = (q: string) => {
    if (q && !f.search && !lens.startsWith('kpi:')) {
      lensBeforeSearch.current = lens;
      setLens(isKamView ? 'signed' : 'all');
    }
    if (!q && lensBeforeSearch.current) {
      setLens(lensBeforeSearch.current);
      lensBeforeSearch.current = null;
    }
    setFilters({ search: q });
  };

  const applyPatch = async (lead: OutreachLead, patch: Partial<OutreachLead>) => {
    const statusChanged = patch.status !== undefined && patch.status !== lead.status;
    const err = await data.save(lead, {
      ...lead,
      ...patch,
      statusChangedAt: statusChanged ? nowIso() : lead.statusChangedAt,
      quoteSharedAt: patch.status === 'Quote Share' && !lead.quoteSharedAt ? nowIso() : lead.quoteSharedAt,
    });
    if (err) setMoveError(`Could not move ${lead.company}: ${err}`);
  };

  const requestMove = (id: string, target: OutreachStatus) => {
    const lead = data.leads.find((l) => l.id === id);
    if (!lead || lead.status === target) return;
    setMoveError(null);
    const errs = outreachGateErrors({ status: target, followUpDate: lead.followUpDate, lostReason: lead.lostReason });
    if (errs.length || target === 'Quote Share' || target === 'Closed' || target === 'PI Shared') {
      setMove({ lead, target });
      return;
    }
    applyPatch(lead, { status: target });
  };

  const kpiDef = lenses.kpi ? OUTREACH_KPIS.find((d) => d.key === lenses.kpi!.key)! : null;
  const rows = lenses.kpi
    ? lenses.kpi.visible.filter((r) => kpiShow === 'all' || (kpiShow === 'counted') === r.kpi!.counts)
    : lenses.lists[lens as WorkLens] ?? [];

  const handleExport = async (format: ExportFormat, which: ExportScope) => {
    if (exporting) return;
    const list = which === 'all' ? scoped : view === 'list' && lens !== 'inbox' ? rows.map((r) => r.lead) : filtered;
    if (!list.length) { data.setError('No leads matched — nothing to export.'); return; }
    setExporting(true);
    try {
      const name = `b2b_outreach_leads_${which}_${todayStr()}`;
      const out = list.map((l) => toExportRow(l, waitlistFor(l, waitIdx), nowMs));
      if (format === 'csv') exportRowsCsv(EXPORT_HEADERS, out, name);
      else await exportRowsExcel(EXPORT_HEADERS, out, name, 'Outreach Leads');
    } finally {
      setExporting(false);
    }
  };

  const copyWaitlistLink = () => { navigator.clipboard?.writeText(STUDIO_WAITLIST_URL).catch(() => {}); };

  const selected = data.leads.find((l) => l.id === selectedId) || null;
  const loading = data.loading || team.loading;
  const state = loading ? 'loading' : data.loadFailed ? 'failed' : 'ready';
  const heads = pickedRep || scope.mode === 'mine' ? 1 : Math.max(1, teamLive ? scope.reps.length : bms.length);
  const customPeriod = !periodKey.startsWith('m:') && !['month', 'last-month'].includes(periodKey);
  const hidden = lenses.kpi ? lenses.kpi.total - lenses.kpi.visible.length : 0;
  const notices: ReactNode[] = [
    scope.notice,
    data.waitlistError && !isKamView
      ? <>Studio Space waitlist is unreachable, so waitlist figures read Unknown. <button onClick={data.loadWaitlist} className="underline font-semibold">Retry</button></>
      : null,
  ].filter(Boolean);

  const kpiCount = () => {
    const k = lenses.kpi!;
    const missed = k.total - k.counted;
    if (kpiDef!.unit === '%') return `${k.counted} of ${k.total}`;
    return `${k.counted} counted${missed ? ` · ${missed} not counted` : ''}`;
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="min-w-0 flex flex-col gap-1.5">
          <h1 className="text-[19px] font-bold text-gray-900">Outreach</h1>
          {isKamView ? <p className="text-[11.5px] text-gray-500">Converted firms handed over to you</p>
            : canPickBm ? <BmChips options={bms} value={bm} onChange={setBm} />
              : <p className="text-[11.5px] text-gray-500">Your leads · {scope.me.name}</p>}
        </div>
        {!isKamView && (
          <div className="flex items-center gap-2">
            <ExportButton onExport={handleExport} disabled={exporting} />
            <button onClick={() => setImporting(true)} className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-700 whitespace-nowrap">
              Import CSV
            </button>
            <button onClick={() => setCreating(true)} className="bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap">
              + New lead
            </button>
          </div>
        )}
      </div>

      {notices.length > 0 && (
        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11.5px] text-amber-800 flex flex-col gap-0.5">
          {notices.map((n, i) => <div key={i}>⚠ {n}</div>)}
        </div>
      )}
      {data.error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 flex items-start justify-between gap-3">
          <span>{data.error} {data.loadFailed && <button onClick={data.load} className="underline font-semibold">Retry</button>}</span>
          <button onClick={() => data.setError(null)} className="opacity-60 hover:opacity-100 text-lg leading-none shrink-0">×</button>
        </div>
      )}
      {moveError && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 flex items-start justify-between gap-3">
          <span>{moveError}</span>
          <button onClick={() => setMoveError(null)} className="opacity-60 hover:opacity-100 text-lg leading-none shrink-0">×</button>
        </div>
      )}

      {!isKamView && (
        <div className="mb-4">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <h2 className="text-[13px] font-bold text-gray-900">Scorecard</h2>
            <PeriodPicker value={periodKey} onChange={setPeriodKey} custom={custom} setCustom={setCustom} today={today} />
            <span className="text-[11px] text-gray-400">
              {customPeriod ? `${fmtRange(period)} · no monthly targets` : heads > 1 ? `Targets for ${heads} BMs` : 'Per-head targets'}
            </span>
            {!customPeriod && periodKey === 'month' && (
              <span className="text-[11px] text-gray-400 flex items-center gap-1" title="The marker on each bar is where the number should be by today, at an even pace through the month.">
                <span className="inline-block w-[2px] h-[10px] rounded bg-gray-500" /> pace for today
              </span>
            )}
            {canPickBm && !pickedRep && (
              <div className="ml-auto">
                <Segmented value={scoreView} onChange={setScoreView} options={[['tiles', 'Tiles'], ['team', 'By BM']]} />
              </div>
            )}
          </div>
          {scoreView === 'team' && canPickBm && !pickedRep ? (
            <TeamTable leads={scoped} bms={bms} period={period} today={today} teamLive={teamLive} waitlist={waitIdx}
              onPick={(name) => { setBm(name); setScoreView('tiles'); }} />
          ) : (
            <Scorecard kpis={kpis} heads={heads} period={period} today={today} state={state} active={lens} onPick={pickLens} />
          )}
        </div>
      )}

      <Toolbar
        f={f}
        set={setFilters}
        onSearch={onSearch}
        right={!isKamView && <Segmented value={view} onChange={setView} options={[['list', 'List'], ['board', 'Board']]} />}
      />

      <LensStrip groups={lenses.groups} counts={lenses.counts} hints={lenses.hints} state={state}
        active={view === 'list' ? lens : null} onPick={pickLens} />

      <div ref={tableRef}>
        {loading ? (
          <div className="bg-white rounded-lg border border-gray-200 py-16"><Spinner label="Loading outreach leads…" /></div>
        ) : data.loadFailed ? (
          <div className="bg-white rounded-lg border border-gray-200 py-12 flex flex-col items-center gap-3">
            <p className="text-[12px] text-gray-600">Outreach leads did not load, so nothing here can be counted yet.</p>
            <button onClick={data.load} className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white">Try again</button>
          </div>
        ) : view === 'board' ? (
          <OutreachBoard leads={filtered} today={today} onOpen={setSelectedId} onMove={requestMove} />
        ) : lens === 'inbox' ? (
          <FromInbound leads={filtered} allLeads={data.leads} pool={pool} scope={scope} today={today}
            save={data.save} createMany={data.createMany} onOpen={setSelectedId} />
        ) : kpiDef && lenses.kpi ? (
          <LensTable
            title={kpiDef.label}
            accent="#1A1A1A"
            rule={`${kpiDef.rule} ${fmtRange(period)}.`}
            count={kpiCount()}
            cols={columnsFor(lens, { today, nowMs, showBm: canPickBm && !pickedRep })}
            rows={rows}
            resetKey={`${lens}|${kpiShow}|${rows.length}|${period.from}`}
            empty={hidden ? 'Filters or search hide every lead here.' : kpiDef.key === 'waitlist' && kpis.waitlist.value === null ? 'Studio Space did not answer, so sign-ups are unknown.' : 'Nothing counts toward this yet in this period.'}
            onOpen={setSelectedId}
            note={hidden > 0 && (
              <span className="text-amber-700">
                Filters or search hide {hidden} of {lenses.kpi.total}.{' '}
                <button onClick={() => setF(NO_FILTERS)} className="underline font-semibold">Show all</button>
              </span>
            )}
            aside={(
              <div className="flex items-center gap-2 flex-wrap">
                {kpiDef.key === 'waitlist' && (
                  <button onClick={copyWaitlistLink} title={STUDIO_WAITLIST_URL} className="text-[11.5px] font-semibold text-[#0F766E] hover:underline whitespace-nowrap">Copy join link</button>
                )}
                {lenses.kpi.total > lenses.kpi.counted && (
                  <Segmented value={kpiShow} onChange={setKpiShow}
                    options={[['all', 'All'], ['counted', `Counted ${lenses.kpi.counted}`], ['missed', `Not counted ${lenses.kpi.total - lenses.kpi.counted}`]]} />
                )}
              </div>
            )}
          />
        ) : (
          <LensTable
            title={LENS[lens as WorkLens].title}
            accent={LENS[lens as WorkLens].accent}
            rule={LENS[lens as WorkLens].rule}
            count={`${rows.length} lead${rows.length === 1 ? '' : 's'}`}
            cols={columnsFor(lens, { today, nowMs, showBm: canPickBm && !pickedRep })}
            rows={rows}
            resetKey={`${lens}|${rows.length}|${f.search}`}
            empty={f.search ? `Nothing matches “${f.search}”.` : lens === 'action' ? 'Nothing due — every lead is up to date.' : lens === 'meetings' ? 'No meetings scheduled for today.' : lens === 'signoff' ? 'No handover is waiting for your sign-off.' : 'No leads here.'}
            onOpen={setSelectedId}
          />
        )}
      </div>

      {creating && (
        <CreateLeadModal reps={scope.reps} me={scope.me} canPickBm={canPickBm} onClose={() => setCreating(false)}
          onCreate={async (lead) => {
            setCreating(false);
            const err = await data.save(null, lead);
            if (err) data.setError(`Could not save ${lead.company}: ${err}. The lead was not created — try again.`);
          }} />
      )}

      {importing && (
        <ImportModal existing={data.leads} inbound={data.inbound} reps={scope.reps} me={scope.me} canPickBm={canPickBm}
          onClose={() => setImporting(false)} onImport={(list) => data.createMany(list)} />
      )}

      {move && (
        <MoveModal lead={move.lead} target={move.target} onCancel={() => setMove(null)}
          onDone={(patch) => { applyPatch(move.lead, patch); setMove(null); }} />
      )}

      {selected && (
        <OutreachDrawer lead={selected} scope={scope} waitlist={waitlistFor(selected, waitIdx)} waitlistError={data.waitlistError}
          onClose={() => setSelectedId(null)} onSave={data.save} />
      )}
    </div>
  );
}
