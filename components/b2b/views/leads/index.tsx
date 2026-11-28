'use client';

import { useB2BReps } from '../../hooks/use-b2b-reps';
import { fmtINR } from '../../models/mock-data';
import { repNames } from '../../models/outreach/handover';
import { AssignBar } from '../../ui/assign-bar';
import { Spinner } from '../../ui/inbound-chips';
import { ALL, LeadFilters, LeadSection, NO_FILTERS, PAGE_SIZE } from './constants';
import { DetailDrawer } from './drawer';
import { useLeadAssign } from './hooks/use-lead-assign';
import { LeadFilterBar, SelectSpec } from './ui/filters';
import { LeadTable } from './ui/table';
import { distinct, ecOf, leadState, matchLead, periodRange, referrerOf, sourceKey } from './utils';
import { LeadSource, UnifiedLead, fetchUnifiedLeads, isEcReferral, istToday } from '@/lib/b2b';
import type { B2BTeamLoad, Viewer } from '@/lib/b2b/team/types';
import { useEffect, useMemo, useRef, useState } from 'react';

const SECTIONS: { key: LeadSection; label: string; rule: string }[] = [
  { key: 'pipeline', label: 'Inbound and Outreach', rule: 'Every Inbound lead and every Outreach lead not referred by an Experience Centre' },
  { key: 'ec', label: 'EC B2B referrals', rule: 'Clients an Experience Centre referred to the B2B team, through the EC B2B Referral form or picked as an EC referral' },
];
const SECTION_KEYS: (keyof LeadFilters)[] = ['source', 'ec', 'referrer'];

const merge = (prev: UnifiedLead, next: UnifiedLead): UnifiedLead => ({ ...next, createdAt: next.createdAt || prev.createdAt });

export default function LeadsTab({ team, viewer }: { team: B2BTeamLoad; viewer: Viewer }) {
  const [leads, setLeads] = useState<UnifiedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<LeadSource[]>([]);
  const [section, setSection] = useState<LeadSection>('pipeline');
  const [f, setF] = useState<LeadFilters>(NO_FILTERS);
  const [page, setPage] = useState(0);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const today = istToday();

  const latestLoad = useRef(0);
  const load = () => {
    const run = ++latestLoad.current;
    setLoading(true);
    setError(null);
    fetchUnifiedLeads()
      .then((res) => {
        if (run !== latestLoad.current) return;
        setLeads(res.leads);
        setFailed(res.failed);
      })
      .catch((e) => { if (run === latestLoad.current) setError(e instanceof Error ? e.message : 'Failed to load leads'); })
      .finally(() => { if (run === latestLoad.current) setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const set = (patch: Partial<LeadFilters>) => setF((prev) => ({ ...prev, ...patch }));
  const pickSection = (s: LeadSection) => {
    setSection(s);
    setF((prev) => ({ ...prev, ...Object.fromEntries(SECTION_KEYS.map((k) => [k, ALL])) }));
  };

  const range = useMemo(() => periodRange(f.period, f.from, f.to, today), [f.period, f.from, f.to, today]);
  const common = useMemo(() => ({ ...f, ...Object.fromEntries(SECTION_KEYS.map((k) => [k, ALL])) }) as LeadFilters, [f]);

  const bySection = useMemo(() => ({
    pipeline: leads.filter((l) => !isEcReferral(l)),
    ec: leads.filter(isEcReferral),
  }), [leads]);
  const inSection = bySection[section];

  const sectionCounts = useMemo(() => ({
    pipeline: bySection.pipeline.filter((l) => matchLead(l, common, range)).length,
    ec: bySection.ec.filter((l) => matchLead(l, common, range)).length,
  }), [bySection, common, range]);

  const beforeState = useMemo(() => inSection.filter((l) => matchLead(l, f, range, 'state')), [inSection, f, range]);
  const filtered = useMemo(() => (f.state === ALL ? beforeState : beforeState.filter((l) => leadState(l) === f.state)), [beforeState, f.state]);

  const stateCounts = useMemo(() => {
    const c: Record<string, number> = { [ALL]: beforeState.length, open: 0, closed: 0, lost: 0 };
    for (const l of beforeState) c[leadState(l)] += 1;
    return c;
  }, [beforeState]);

  const stats = useMemo(() => {
    const closed = filtered.filter((l) => leadState(l) === 'closed').length;
    return {
      total: filtered.length,
      closed,
      rate: filtered.length ? Math.round((closed / filtered.length) * 100) : null,
      withEnq: filtered.filter((l) => !!l.enqId).length,
      value: filtered.reduce((a, l) => a + (Number(l.orderValue) || 0), 0),
    };
  }, [filtered]);

  const { reps, rotationReps, allKams } = useB2BReps(team);
  const selects = useMemo((): SelectSpec[] => {
    const opts = (values: string[]) => values.map((v) => ({ value: v, label: v }));
    if (section === 'ec') {
      return [
        { key: 'ec', label: 'Experience Centre', all: 'Every EC', options: opts(distinct(inSection.map(ecOf))) },
        { key: 'referrer', label: 'Referred by', all: 'Anyone referring', options: opts(distinct(inSection.map(referrerOf))) },
        { key: 'owner', label: 'Outreach BM', all: 'Every BM', options: opts(distinct(inSection.map((l) => l.spok))) },
      ];
    }
    const outreachSources = distinct(inSection.filter((l) => l.source === 'Outreach').map((l) => sourceKey(l).slice('Outreach:'.length)));
    return [
      {
        key: 'source', label: 'Source', all: 'Every source',
        options: [
          { value: 'Inbound', label: 'Inbound' },
          { value: 'Outreach', label: 'Outreach, any source' },
          ...outreachSources.map((s) => ({ value: `Outreach:${s}`, label: s, group: 'Outreach source' })),
        ],
      },
      { key: 'owner', label: 'Owner', all: 'Every owner', options: opts(distinct(inSection.map((l) => l.spok))) },
      { key: 'kam', label: 'KAM', all: 'Every KAM', options: opts(repNames(allKams, inSection.map((l) => l.kam))) },
    ];
  }, [section, inSection, allKams]);

  const activeFilters = (Object.keys(NO_FILTERS) as (keyof LeadFilters)[])
    .filter((k) => k !== 'from' && k !== 'to' && f[k] !== NO_FILTERS[k]).length;

  const resetKey = `${section}|${JSON.stringify(f)}`;
  useEffect(() => { setPage(0); }, [resetKey]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const rows = filtered.slice(cur * PAGE_SIZE, (cur + 1) * PAGE_SIZE);

  const selected = leads.find((l) => l.key === selectedKey) || null;
  const assigner = useLeadAssign({
    leads, members: team.members, reps, rotationReps, by: viewer.member?.name || viewer.name,
    onSaved: (list) => {
      const byKey = new Map(list.map((l) => [l.key, l]));
      setLeads((prev) => prev.map((l) => (byKey.has(l.key) ? merge(l, byKey.get(l.key)!) : l)));
    },
  });
  const meta = SECTIONS.find((s) => s.key === section)!;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-semibold text-gray-900">Leads</h1>
          <p className="text-[13px] text-gray-500 mt-1">Every B2B lead, newest first. The figures below follow the filters.</p>
        </div>
        <button onClick={load} disabled={loading} className="h-9 px-3 rounded-md text-[13px] border border-gray-200 bg-white text-gray-800 hover:bg-gray-50 disabled:opacity-50">
          Refresh
        </button>
      </div>

      {failed.length > 0 && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">
          The {failed.join(' and ')} {failed.length === 1 ? 'side' : 'sides'} did not load, so this list is incomplete. It does not mean there are no {failed.join('/')} leads. Refresh to try again.
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 flex items-start justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="text-red-400 hover:text-red-700 leading-none">×</button>
        </div>
      )}

      <section className="bg-white rounded-xl border border-gray-200">
        <div role="tablist" className="flex border-b border-gray-200 overflow-x-auto">
          {SECTIONS.map((s) => {
            const on = s.key === section;
            return (
              <button
                key={s.key} role="tab" aria-selected={on} title={s.rule} onClick={() => pickSection(s.key)}
                className={`relative shrink-0 px-5 h-11 flex items-center gap-2 text-[14px] ${on ? 'text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-800'}`}
              >
                {s.label}
                <span className={`min-w-[24px] h-5 px-1.5 rounded-full text-[12px] tabular-nums flex items-center justify-center ${on ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {loading ? '…' : sectionCounts[s.key]}
                </span>
                {on && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gray-900" />}
              </button>
            );
          })}
        </div>

        <LeadFilterBar
          f={f} set={set} selects={selects} stateCounts={stateCounts}
          showUnassigned={viewer.isManager} active={activeFilters} onClear={() => setF(NO_FILTERS)}
        />

        {loading ? <div className="py-16"><Spinner label="Loading leads…" /></div> : <>
          <dl className="grid grid-cols-2 md:grid-cols-4 border-b border-gray-100">
            {[
              { k: 'Leads', v: stats.total.toLocaleString('en-IN'), sub: meta.label },
              { k: 'Closed', v: stats.closed.toLocaleString('en-IN'), sub: stats.rate == null ? '—' : `${stats.rate}% of these leads` },
              { k: 'With an Enquiry ID', v: stats.withEnq.toLocaleString('en-IN'), sub: 'linked to a Django enquiry' },
              { k: 'Order value', v: fmtINR(stats.value), sub: 'on these leads' },
            ].map((s, i) => (
              <div key={s.k} className={`px-5 py-4 ${i ? 'border-l border-gray-100' : ''}`}>
                <dt className="text-[12px] text-gray-500">{s.k}</dt>
                <dd className="text-[24px] font-semibold text-gray-900 tabular-nums leading-tight mt-1">{s.v}</dd>
                <dd className="text-[12px] text-gray-400 mt-0.5">{s.sub}</dd>
              </div>
            ))}
          </dl>

          {viewer.isManager && (
            <AssignBar
              count={assigner.picked.size}
              noun="lead"
              teams={assigner.teams}
              busy={assigner.busy}
              rule="Bulk assignment takes only open leads with no owner on the chosen team, and round robin gives each to whichever of these people holds the fewest. To move a lead that has an owner, select it on its own. Outreach BMs must accept or reject."
              total={filtered.length}
              onPickAll={() => assigner.pickAll(filtered.map((l) => l.key))}
              onAssign={assigner.assign}
              onClear={assigner.clear}
            />
          )}
          {assigner.note && (
            <div className="px-5 py-2 text-[13px] text-teal-900 bg-teal-50 border-b border-teal-100 flex items-start justify-between gap-3">
              <span>{assigner.note}</span>
              <button onClick={() => assigner.setNote(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100 leading-none">×</button>
            </div>
          )}
          {assigner.error && (
            <div className="px-5 py-2 text-[13px] text-red-700 bg-red-50 border-b border-red-100 flex items-start justify-between gap-3">
              <span>{assigner.error}</span>
              <button onClick={() => assigner.setError(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100 leading-none">×</button>
            </div>
          )}

          {rows.length === 0
            ? <p className="px-5 py-12 text-center text-[13px] text-gray-500">{activeFilters ? 'No leads match these filters' : 'No leads here yet'}</p>
            : (
              <LeadTable
                section={section} rows={rows} today={today} onOpen={setSelectedKey}
                select={viewer.isManager ? {
                  picked: assigner.picked,
                  toggle: assigner.toggle,
                  allOnPage: rows.every((l) => assigner.picked.has(l.key)),
                  togglePage: () => assigner.togglePage(rows.map((l) => l.key)),
                } : undefined}
              />
            )}

          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 gap-3 flex-wrap">
              <span className="text-[12px] text-gray-500 tabular-nums">
                Showing {cur * PAGE_SIZE + 1}–{Math.min(filtered.length, (cur + 1) * PAGE_SIZE)} of {filtered.length.toLocaleString('en-IN')}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={() => setPage(cur - 1)} disabled={cur === 0} className="h-8 px-3 text-[13px] border border-gray-200 rounded-md bg-white text-gray-700 disabled:opacity-40">Previous</button>
                <button onClick={() => setPage(cur + 1)} disabled={cur >= pages - 1} className="h-8 px-3 text-[13px] border border-gray-200 rounded-md bg-white text-gray-700 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </>}
      </section>

      <p className="text-[12px] text-gray-400 mt-3 max-w-[900px]">
        Created is when Kylas created an Inbound lead, and when an Outreach lead was added or referred. Lost includes Inbound
        leads marked Invalid. Expected closure reads n/a for Inbound, which has no such field.
      </p>

      {selected && (
        <DetailDrawer
          lead={selected}
          onClose={() => setSelectedKey(null)}
          onSaved={(updated) => setLeads((prev) => prev.map((l) => (l.key === updated.key ? merge(l, updated) : l)))}
        />
      )}
    </div>
  );
}
