'use client';

import OutreachDrawer from '../../drawers/outreach/index';
import { OutreachLead } from '../../models/mock-data';
import { OUTREACH_PRD_VIEWS, OutreachStatus, OutreachView, istToday, outreachGateErrors } from '../../models/outreach';
import { handoverState } from '../../models/outreach/handover';
import { intakePending } from '../../models/outreach/intake';
import { currentMonth, waitlistFor, waitlistIndex } from '../../models/outreach/kpis';
import { ExportFormat, ExportScope } from '../../types/export';
import { ExportButton } from '../../ui/export-button';
import { exportRowsCsv, exportRowsExcel, todayStr } from '../../utils/export';
import { Spinner } from '../../ui/inbound-chips';
import { EXPORT_HEADERS } from './constants';
import { useOutreachData } from './hooks/use-outreach-data';
import { useOutreachScope } from './hooks/use-outreach-scope';
import { ImportModal } from './intake/import-modal';
import { FromInbound } from './intake';
import { OutreachBoard, OutreachList } from './lists/board';
import { FilterBar, NO_FILTERS, OutreachFilters, activeFilterCount, matchesFilters } from './lists/filters';
import { ConvertedTable, FollowUpTable, StatusTable } from './lists/tables';
import { CreateLeadModal, MoveModal } from './modals';
import { MyDay } from './my-day';
import { KpiStrip, TeamTable, monthLabel, monthOptions, repOwns } from './performance';
import { nowIso, toExportRow } from './utils';
import type { B2BTeamLoad, Viewer } from '@/lib/b2b/team/types';
import { useEffect, useMemo, useState } from 'react';

const Banner = ({ tone, children, onClose }: { tone: 'red' | 'amber'; children: React.ReactNode; onClose?: () => void }) => (
  <div className={`mb-3 rounded-md border px-3 py-2 text-[12px] flex items-start justify-between gap-3 ${tone === 'red' ? 'border-red-200 bg-red-50 text-red-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
    <span className="leading-snug">{children}</span>
    {onClose && <button onClick={onClose} className="opacity-60 hover:opacity-100 text-lg leading-none shrink-0">×</button>}
  </div>
);

export default function OutreachLeads({ team, viewer }: { team: B2BTeamLoad; viewer: Viewer }) {
  const scope = useOutreachScope(team, viewer);
  const data = useOutreachData(scope.me.name || 'Unknown user');
  const today = istToday();
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => { setNowMs(Date.now()); }, [data.leads]);

  const [view, setView] = useState<OutreachView>('today');
  const [month, setMonth] = useState(currentMonth(today));
  const [f, setF] = useState<OutreachFilters>(NO_FILTERS);
  const setFilters = (patch: Partial<OutreachFilters>) => setF((cur) => ({ ...cur, ...patch }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [move, setMove] = useState<{ lead: OutreachLead; target: OutreachStatus } | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const waitIdx = useMemo(() => waitlistIndex(data.waitlist), [data.waitlist]);
  const scoped = useMemo(() => data.leads.filter(scope.owns), [data.leads, scope]);
  const pickedRep = useMemo(
    () => (scope.mode !== 'mine' && f.bm !== 'all' ? scope.reps.find((r) => r.name === f.bm) ?? { name: f.bm } : null),
    [scope.mode, scope.reps, f.bm],
  );
  const filtered = useMemo(
    () => scoped.filter((l) => matchesFilters(l, f, pickedRep ? repOwns(pickedRep) : () => true)),
    [scoped, f, pickedRep],
  );
  const kpiLeads = useMemo(() => (pickedRep ? scoped.filter(repOwns(pickedRep)) : scoped), [scoped, pickedRep]);

  const isKamView = scope.isKam && scope.mode === 'mine';
  const tabs = useMemo(() => {
    const base = [...OUTREACH_PRD_VIEWS, { key: 'board' as const, label: 'Board', note: '' }, { key: 'list' as const, label: 'List', note: '' }];
    if (isKamView) return base.filter((v) => v.key === 'today' || v.key === 'closed').map((v) => (v.key === 'today' ? { ...v, label: 'Sign-offs' } : v));
    return scope.mode === 'mine' ? base : [...base, { key: 'team' as const, label: 'Team', note: 'Every BM against their own monthly target.' }];
  }, [isKamView, scope.mode]);
  useEffect(() => { if (!tabs.some((t) => t.key === view)) setView('today'); }, [tabs, view]);

  const badge = useMemo(() => ({
    inbox: scoped.filter(intakePending).length,
    followups: scoped.filter((l) => (l.status === 'Follow up' || l.status === 'PI Shared') && !!l.followUpDate && l.followUpDate.slice(0, 10) < today).length,
    closed: scoped.filter((l) => ['ready', 'overdue', 'rejected'].includes(handoverState(l, nowMs))).length,
  }) as Partial<Record<OutreachView, number>>, [scoped, today, nowMs]);

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

  const handleExport = async (format: ExportFormat, which: ExportScope) => {
    if (exporting) return;
    const list = which === 'all' ? scoped : filtered;
    if (!list.length) { data.setError('No leads matched — nothing to export.'); return; }
    setExporting(true);
    try {
      const name = `b2b_outreach_leads_${which}_${todayStr()}`;
      const rows = list.map((l) => toExportRow(l, waitlistFor(l, waitIdx), nowMs));
      if (format === 'csv') exportRowsCsv(EXPORT_HEADERS, rows, name);
      else await exportRowsExcel(EXPORT_HEADERS, rows, name, 'Outreach Leads');
    } finally {
      setExporting(false);
    }
  };

  const selected = data.leads.find((l) => l.id === selectedId) || null;
  const loading = data.loading || team.loading;
  const viewNote = tabs.find((v) => v.key === view)?.note;
  const kpiTitle = pickedRep ? pickedRep.name : scope.mode === 'mine' ? 'My numbers' : 'Outreach team';
  const heads = pickedRep || scope.mode === 'mine' ? 1 : Math.max(1, scope.reps.length);
  const canPickBm = scope.mode !== 'mine';

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h1 className="text-[19px] font-bold text-gray-900">Outreach</h1>
          <p className="text-[11.5px] text-gray-500 mt-0.5">
            {isKamView ? 'Converted firms handed over to you'
              : scope.mode === 'mine' ? `${scope.me.name}'s leads` : 'Every BM'}
            {loading ? ' · loading…' : ` · ${filtered.length} shown`}
            {' · ends at the first order, then a KAM handover'}
          </p>
        </div>
        {!isKamView && (
          <div className="flex items-center gap-2">
            <ExportButton onExport={handleExport} disabled={exporting} />
            <button onClick={() => setImporting(true)} className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md bg-white text-gray-700 whitespace-nowrap">
              Import CSV
            </button>
            <button onClick={() => setCreating(true)} className="bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap">
              + Create Lead
            </button>
          </div>
        )}
      </div>

      {scope.notice && <Banner tone="amber">{scope.notice}</Banner>}
      {data.waitlistError && !isKamView && (
        <Banner tone="amber">
          {`Studio Space waitlist unavailable — ${data.waitlistError}. Waitlist status reads Unknown until it answers.`}{' '}
          <button onClick={data.loadWaitlist} className="underline font-semibold">Retry</button>
        </Banner>
      )}
      {data.error && <Banner tone="red" onClose={() => data.setError(null)}>{data.error} <button onClick={data.load} className="underline font-semibold">Retry</button></Banner>}
      {moveError && <Banner tone="red" onClose={() => setMoveError(null)}>{moveError}</Banner>}

      {!isKamView && !loading && (
        <>
          <div className="flex items-center justify-end mb-1">
            <select value={month} onChange={(e) => setMonth(e.target.value)} className="px-2 py-1 text-[11.5px] border border-gray-200 rounded-md bg-white">
              {monthOptions(today).map((m) => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
          </div>
          <KpiStrip leads={kpiLeads} month={month} waitlist={waitIdx} heads={heads} title={kpiTitle} />
        </>
      )}

      {!isKamView && <FilterBar f={f} set={setFilters} bmOptions={canPickBm ? scope.reps.map((r) => r.name) : null} />}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex rounded-md border border-gray-200 overflow-hidden flex-wrap">
          {tabs.map((v) => (
            <button key={v.key} onClick={() => setView(v.key)}
              className={`px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap ${view === v.key ? 'bg-[#1A1A1A] text-white' : 'bg-white text-gray-500 hover:text-gray-800'}`}>
              {v.label}
              {!!badge[v.key] && <span className={`ml-1.5 px-1.5 rounded-full text-[10px] ${view === v.key ? 'bg-white/20' : 'bg-red-50 text-red-600'}`}>{badge[v.key]}</span>}
            </button>
          ))}
        </div>
        {viewNote && <span className="text-[10.5px] text-gray-400">{viewNote}</span>}
        {activeFilterCount(f) > 0 && view !== 'team' && <span className="text-[10.5px] text-amber-700">Filtered — KPIs above still count every lead</span>}
      </div>

      {loading ? (
        <div className="bg-white rounded-lg border border-gray-200 py-16"><Spinner label="Loading outreach leads…" /></div>
      ) : (
        <>
          {view === 'today' && <MyDay leads={filtered} today={today} nowMs={nowMs} waitlist={waitIdx} isKam={isKamView} onOpen={setSelectedId} />}
          {view === 'inbox' && (
            <FromInbound leads={scoped} allLeads={data.leads} inbound={data.inbound} scope={scope} today={today}
              save={data.save} createMany={data.createMany} onOpen={setSelectedId} />
          )}
          {view === 'followups' && (
            <FollowUpTable leads={filtered.filter((l) => l.status === 'Follow up' || l.status === 'PI Shared' || l.status === 'Quote Share')} today={today} onOpen={setSelectedId} />
          )}
          {view === 'pi' && <StatusTable status="PI Shared" leads={filtered.filter((l) => l.status === 'PI Shared')} onOpen={setSelectedId} />}
          {view === 'closed' && <ConvertedTable leads={filtered.filter((l) => l.status === 'Closed')} nowMs={nowMs} onOpen={setSelectedId} />}
          {view === 'lost' && <StatusTable status="Lost" leads={filtered.filter((l) => l.status === 'Lost')} onOpen={setSelectedId} />}
          {view === 'board' && <OutreachBoard leads={filtered} today={today} onOpen={setSelectedId} onMove={requestMove} />}
          {view === 'list' && <OutreachList leads={filtered} onOpen={setSelectedId} />}
          {view === 'team' && (
            <TeamTable leads={scoped} reps={scope.reps} month={month} waitlist={waitIdx}
              onPick={(rep) => { setFilters({ bm: rep.name }); setView('today'); }} />
          )}
        </>
      )}

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
