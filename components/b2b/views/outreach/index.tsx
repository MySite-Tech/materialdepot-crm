'use client';

import OutreachDrawer from '../../drawers/outreach/index';
import { OutreachLead } from '../../models/mock-data';
import { OutreachStatus, istToday, outreachGateErrors } from '../../models/outreach';
import { repOwns } from '../../models/outreach/handover';
import { inboundPool, isUnassigned, unassignedPool } from '../../models/outreach/intake';
import { Period, inPeriod, monthPeriod, waitlistFor, waitlistIndex } from '../../models/outreach/kpis';
import { Spinner } from '../../ui/inbound-chips';
import { LENS, NO_FILTERS } from './constants';
import { useOutreachData } from './hooks/use-outreach-data';
import { useOutreachLenses } from './hooks/use-outreach-lenses';
import { useOutreachScope } from './hooks/use-outreach-scope';
import { Assignments } from './intake';
import { outreachPills, outreachTiles } from './lenses';
import { LensPills, LensTiles } from '../../ui/lens-tiles';
import { useOpenDeals } from '../../hooks/use-open-deals';
import { outreachPhones } from '@/lib/b2b';
import { OutreachBoard } from './lists/board';
import { columnsFor } from './lists/columns';
import { Toolbar } from './lists/filters';
import { LensTable } from './lists/table';
import { CreateLeadModal, MoveModal } from './modals';
import { PeriodPicker } from './period';
import { OutreachFilters, RangeKey, WorkLens } from './types';
import { bmOptions, fmtRange, matchesFilters, nowIso, rangeFor } from './utils';
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
  const defaultLens: WorkLens = isKamView ? 'signoff' : 'work';
  const [lens, setLens] = useState<WorkLens>(defaultLens);
  const [view, setView] = useState<'list' | 'board'>('list');
  const [bm, setBm] = useState('all');
  const [periodKey, setPeriodKey] = useState('month');
  const [custom, setCustom] = useState<Period>({ from: '', to: '' });
  const [f, setF] = useState<OutreachFilters>(NO_FILTERS);
  const setFilters = (patch: Partial<OutreachFilters>) => setF((cur) => ({ ...cur, ...patch }));
  const lensBeforeSearch = useRef<WorkLens | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [move, setMove] = useState<{ lead: OutreachLead; target: OutreachStatus } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);

  const waitIdx = useMemo(() => waitlistIndex(data.waitlist), [data.waitlist]);
  const scoped = useMemo(() => data.leads.filter((l) => scope.owns(l) && !isUnassigned(l)), [data.leads, scope]);
  const firstDay = useMemo(() => scoped.reduce((min, l) => {
    const d = String(l.createdAt || '').slice(0, 10);
    return d && d < min ? d : min;
  }, today), [scoped, today]);
  const allTime = periodKey === 'all';
  const period = useMemo<Period>(
    () => (allTime ? { from: firstDay, to: today }
      : periodKey.startsWith('m:') ? monthPeriod(periodKey.slice(2))
        : rangeFor(periodKey as RangeKey, today, custom) ?? monthPeriod(today.slice(0, 7))),
    [allTime, firstDay, periodKey, today, custom],
  );
  const unassigned = useMemo(() => (scope.isManager ? unassignedPool(data.leads) : []), [data.leads, scope.isManager]);
  const teamLive = scope.mode !== 'open';
  const bms = useMemo(() => bmOptions(scoped, scope.reps, teamLive), [scoped, scope.reps, teamLive]);
  const canPickBm = scope.mode !== 'mine';
  const pickedRep = useMemo(
    () => (!canPickBm || bm === 'all' ? null : bms.find((o) => o.rep.name === bm)?.rep ?? { name: bm }),
    [canPickBm, bm, bms],
  );
  const bmLeads = useMemo(() => (pickedRep ? scoped.filter(repOwns(pickedRep)) : scoped), [scoped, pickedRep]);
  const filtered = useMemo(() => bmLeads.filter((l) => matchesFilters(l, f)), [bmLeads, f]);
  const pipelineLeads = useMemo(() => (allTime || f.search.trim() ? filtered : filtered.filter((l) => inPeriod(l.createdAt, period))), [filtered, allTime, f.search, period]);
  const pool = useMemo(() => (data.inbound ? inboundPool(data.inbound, data.leads) : null), [data.inbound, data.leads]);
  const phoneKey = useMemo(() => [...new Set(scoped.flatMap(outreachPhones))].sort().join(','), [scoped]);
  const deals = useOpenDeals(phoneKey, !isKamView && !data.loading && !data.loadFailed);
  const dealsByPhone = deals.status === 'ready' ? deals.byPhone : null;
  const lenses = useOutreachLenses({ leads: filtered, pipeline: pipelineLeads, isKam: isKamView, today, nowMs, waitlist: waitIdx, dealsByPhone });

  const validLens = lens in lenses.lists;
  useEffect(() => { if (!validLens) setLens(defaultLens); }, [validLens, defaultLens]);

  const pickLens = (k: WorkLens) => {
    setLens(k);
    setView('list');
    lensBeforeSearch.current = null;
    const top = tableRef.current?.getBoundingClientRect().top;
    if (top !== undefined && top > window.innerHeight - 160) window.scrollBy({ top: top - 140, behavior: 'smooth' });
  };

  const onSearch = (q: string) => {
    if (q && !f.search) {
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

  const rows = lenses.lists[lens] ?? [];

  const selected = data.leads.find((l) => l.id === selectedId) || null;
  const loading = data.loading || team.loading;
  const state = loading ? 'loading' : data.loadFailed ? 'failed' : 'ready';
  const customIncomplete = periodKey === 'custom' && !rangeFor('custom', today, custom);
  const periodName = allTime || f.search.trim() ? 'any time' : fmtRange(period);
  const tiles = useMemo(() => outreachTiles({
    groups: lenses.groups, lists: lenses.lists, today, pool, unassigned: unassigned.length,
    leadsState: loading ? 'pending' : data.loadFailed ? 'failed' : null,
    dealsState: deals.status === 'ready' ? null : deals.status,
  }), [lenses.groups, lenses.lists, today, pool, unassigned.length, loading, data.loadFailed, deals.status]);
  const pills = useMemo(() => outreachPills(lenses.lists, state !== 'ready'), [lenses.lists, state]);
  const pickPeriod = (key: string) => {
    if (key === 'custom' && !rangeFor('custom', today, custom)) setCustom({ from: period.from, to: period.to > today ? today : period.to });
    setPeriodKey(key);
  };
  const notices: ReactNode[] = [
    scope.notice,
    deals.status === 'failed' && !isKamView
      ? <>Open carts and PIs did not load ({deals.error}), so Carts &amp; PIs read Unknown and leads with a cart still sit under Calls &amp; meetings. <button onClick={deals.refresh} className="underline font-semibold">Retry</button></>
      : null,
    deals.truncated && !isKamView ? 'More open carts than one read covers, so some carts may be missing here.' : null,
    data.waitlistError && !isKamView
      ? <>Studio Space waitlist is unreachable, so waitlist figures read Unknown. <button onClick={data.loadWaitlist} className="underline font-semibold">Retry</button></>
      : null,
  ].filter(Boolean);

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="min-w-0 flex flex-col gap-1.5">
          <h1 className="text-[19px] font-bold text-gray-900">Outreach</h1>
          {isKamView && <p className="text-[11.5px] text-gray-500">Converted firms handed over to you</p>}
        </div>
        {!isKamView && (
          <div className="flex items-center gap-2">
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

      <Toolbar
        f={f}
        set={setFilters}
        onSearch={onSearch}
        bm={canPickBm && !isKamView ? { options: bms, value: bm, onChange: setBm } : null}
        period={!isKamView && (
          <PeriodPicker value={periodKey} onChange={pickPeriod} custom={custom} setCustom={setCustom} today={today} />
        )}
        periodNote={!isKamView ? (customIncomplete ? `Pick a start and an end date. Showing ${fmtRange(period)} until then.` : `Period picks the leads added in it for Converted, Lost and the status pills (${periodName}). Calls & meetings, Carts & PIs, sign-offs and handovers are always as of today.`) : undefined}
        periodWarn={customIncomplete}
        right={!isKamView && <Segmented value={view} onChange={setView} options={[['list', 'List'], ['board', 'Board']]} />}
      />

      <LensTiles groups={tiles} active={view === 'list' ? lens : null} onPick={pickLens} />
      {!isKamView && (
        <div className="mb-4"><LensPills pills={pills} active={view === 'list' ? lens : null} onPick={pickLens} /></div>
      )}

      <div ref={tableRef}>
        {loading ? (
          <div className="bg-white rounded-lg border border-gray-200 py-16"><Spinner label="Loading outreach leads…" /></div>
        ) : data.loadFailed ? (
          <div className="bg-white rounded-lg border border-gray-200 py-12 flex flex-col items-center gap-3">
            <p className="text-[12px] text-gray-600">Outreach leads did not load, so nothing here can be counted yet.</p>
            <button onClick={data.load} className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white">Try again</button>
          </div>
        ) : view === 'board' ? (
          <OutreachBoard leads={pipelineLeads} today={today} onOpen={setSelectedId} onMove={requestMove} />
        ) : lens === 'inbox' ? (
          <Assignments leads={filtered} allLeads={data.leads} pool={pool} unassigned={unassigned} scope={scope} today={today}
            save={data.save} saveMany={data.saveMany} createMany={data.createMany} onOpen={setSelectedId} />
        ) : (
          <LensTable
            title={LENS[lens].title}
            accent={LENS[lens].accent}
            rule={LENS[lens].rule}
            count={`${rows.length} lead${rows.length === 1 ? '' : 's'}`}
            cols={columnsFor(lens, { today, nowMs, showBm: canPickBm && !pickedRep, waitlist: waitIdx })}
            rows={rows}
            resetKey={`${lens}|${rows.length}|${f.search}`}
            empty={f.search ? `Nothing matches “${f.search}”.` : lens === 'action' || lens === 'work' ? 'Nothing due — every lead is up to date.' : lens === 'meetings' ? 'No meetings scheduled for today.' : lens === 'deals' ? 'No open cart or PI on these leads.' : lens === 'signoff' ? 'No handover is waiting for your sign-off.' : 'No leads here.'}
            onOpen={setSelectedId}
          />
        )}
      </div>

      {creating && (
        <CreateLeadModal reps={scope.reps} me={scope.me} canPickBm={canPickBm} assigner={scope.isManager} existing={data.leads} onClose={() => setCreating(false)}
          onCreate={async (lead) => {
            const err = await data.save(null, lead);
            if (!err) setCreating(false);
            return err;
          }} />
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
