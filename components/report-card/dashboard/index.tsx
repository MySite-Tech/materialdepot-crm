'use client';

import { ClosurePipelineSection } from './ui/closure';
import { Dropdown } from './ui/dropdowns';
import { CrmAdherenceSection, OrdersLostTable, PipelineTable, RankingTable, WalkinTable } from './ui/tables';
import { Props } from './types';
import { ReportingLine, TeamRankingTable, TeamRoster } from './ui/team';
import { STAKEHOLDERS, OrgPerson, samePerson, stakeholderLabel } from '@/lib/org';
import { Section } from './ui';
import { fmtDate, matchTeamRankings, monthEndISO, monthStartISO } from './utils';
import { CategoryOption, ReportCardBMOption, ReportCardData, fetchAvailableBMs, fetchCategoryOptions, fetchReportCard } from '@/lib/api';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTeam } from './hooks/use-team';

export default function ReportCardDashboard({ branches, allowedBranches, currentUser }: Props) {
  const isRestricted = allowedBranches.length > 0;
  const branchOptions = (isRestricted ? allowedBranches : branches).filter(b => b !== 'HQ');
  const currentUserPhone = currentUser.phone ?? '';

  const [dateFrom, setDateFrom] = useState(monthStartISO);
  const [dateTo, setDateTo] = useState(monthEndISO);
  const [store, setStore] = useState('');
  const [personPhone, setPersonPhone] = useState('');
  const [category, setCategory] = useState('');

  const [data, setData] = useState<ReportCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [bmList, setBmList] = useState<ReportCardBMOption[]>([]);
  const [catList, setCatList] = useState<CategoryOption[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { team, loading: teamLoading, failed: teamFailed } = useTeam({
    id: currentUser.id,
    name: currentUser.name,
    phone: currentUserPhone,
    role: currentUser.role,
    branchKey: allowedBranches.join(','),
  });

  useEffect(() => { fetchCategoryOptions().then(setCatList).catch(() => setCatList([])); }, []);

  const branchKey = store || '';
  useEffect(() => {
    if (!teamFailed) return;
    const eff = branchKey ? [branchKey] : (isRestricted ? allowedBranches : undefined);
    fetchAvailableBMs(eff).then(setBmList).catch(() => setBmList([]));
  }, [teamFailed, branchKey, isRestricted, allowedBranches]);

  const visiblePeople: OrgPerson[] | null = useMemo(() => {
    if (!team) return null;
    const all = team.me ? [team.me, ...team.reports] : team.reports;
    const withPhone = all.filter(p => p.phone);
    if (!store) return withPhone;
    return withPhone.filter(p => p.branches.length === 0 || p.branches.some(b => b.toLowerCase() === store.toLowerCase()));
  }, [team, store]);

  const teamRoster = useMemo(
    () => (visiblePeople ?? []).filter(p => !samePerson(p.phone, currentUserPhone)),
    [visiblePeople, currentUserPhone],
  );

  const autoPicked = useRef(false);
  useEffect(() => {
    if (autoPicked.current || personPhone) return;
    if (visiblePeople) {
      const pick = visiblePeople.find(p => samePerson(p.phone, currentUserPhone)) ?? visiblePeople[0];
      if (!pick) return;
      setPersonPhone(pick.phone);
      autoPicked.current = true;
      return;
    }
    if (bmList.length === 0) return;
    const mine = currentUserPhone ? bmList.find(b => samePerson(b.contact, currentUserPhone)) : undefined;
    setPersonPhone((mine ?? bmList[0]).contact);
    autoPicked.current = true;
  }, [visiblePeople, bmList, personPhone, currentUserPhone]);

  const selectedPerson = useMemo(
    () => (visiblePeople ?? []).find(p => samePerson(p.phone, personPhone)) ?? null,
    [visiblePeople, personPhone],
  );
  const viewingSelf = samePerson(personPhone, currentUserPhone);

  const load = useCallback(() => {
    setLoading(true);
    fetchReportCard({
      bm: personPhone.trim(),
      branch: store ? [store] : undefined,
      dateFrom, dateTo,
      category: category || undefined,
    }).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [personPhone, store, dateFrom, dateTo, category]);

  useEffect(() => {
    if (teamLoading || !personPhone) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(load, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [load, teamLoading, personPhone]);

  const reset = () => {
    setDateFrom(monthStartISO()); setDateTo(monthEndISO());
    setStore(''); setCategory('');
    setPersonPhone('');
    autoPicked.current = false;
  };

  const rangeLabel = data?.meta
    ? `${fmtDate(data.meta.date_from)} – ${fmtDate(data.meta.date_to)}`
    : `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`;
  const catNames = catList.map(c => c.name);

  const personOptions = visiblePeople
    ? visiblePeople.map(p => ({
        label: `${p.name || p.phone}${samePerson(p.phone, currentUserPhone) ? ' (me)' : ''} · ${p.stakeholder ? STAKEHOLDERS[p.stakeholder].code : p.crmRole}`,
        value: p.phone,
      }))
    : bmList.map(b => ({ label: `${b.name}${b.contact ? ` · ${b.contact}` : ''}`, value: b.contact }));

  const teamMatch = data && teamRoster.length > 0 ? matchTeamRankings(data.rankings.company_wide, teamRoster) : null;
  const subjectName = selectedPerson?.name || data?.meta?.bm_name || '';

  return (
    <div className="px-3 sm:px-6 py-4 space-y-6 max-w-[1400px] mx-auto">

      <div>
        <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Material Depot · Internal Analytics</div>
        <h1 className="text-2xl font-bold text-gray-900 mt-0.5">Report Card</h1>
        <p className="text-[13px] text-gray-500 mt-0.5">
          Your own card, and the card of everyone who reports into you · {rangeLabel}
        </p>
      </div>

      {team?.me && (
        <ReportingLine
          me={team.me}
          reportCount={team.reports.length}
          viewing={viewingSelf ? 'Your own report card' : (subjectName || 'Nobody selected')}
          isSelf={viewingSelf}
          onViewSelf={() => setPersonPhone(currentUserPhone)}
        />
      )}

      {teamFailed && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-800">
          The organisation roster did not load, so this tab cannot work out who reports into you. Every BM is listed
          below instead of just your team. Reload to try again.
        </div>
      )}

      {team && team.unmappedRole && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-800">
          Your CRM role <span className="font-semibold">{currentUser.role || '—'}</span> is not one of the five store
          stakeholders (BM, Receptionist, Team Leader, Assistant Store Manager, Store Manager), so no team report cards
          are available. Ask an admin to correct the role under Admin &gt; Users.
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 shadow-sm sticky top-0 z-40">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Date</span>
        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] text-gray-700" />
        <span className="text-gray-300">—</span>
        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] text-gray-700" />
        <span className="w-px h-5 bg-gray-200 mx-1" />
        <Dropdown value={store} placeholder="All Stores" onChange={setStore}
          options={[{ label: 'All Stores', value: '' }, ...branchOptions.map(b => ({ label: b, value: b }))]} searchable />
        <Dropdown value={personPhone} placeholder="Select person" searchable
          onChange={setPersonPhone}
          options={[{ label: 'Select person', value: '' }, ...personOptions]} />
        <Dropdown value={category} placeholder="All Categories" onChange={setCategory} searchable
          options={[{ label: 'All Categories', value: '' }, ...catNames.map(c => ({ label: c, value: c }))]} />
        <button onClick={reset} className="ml-auto text-[12px] font-medium text-gray-500 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 cursor-pointer">Reset Filters</button>
        {(loading || teamLoading) && <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />}
      </div>

      {teamRoster.length > 0 && (
        <Section n="01" title="My Team" hint={`${teamRoster.length} ${teamRoster.length === 1 ? 'person reports' : 'people report'} into you · open any card`}>
          <TeamRoster people={teamRoster} selectedPhone={personPhone} onSelect={p => setPersonPhone(p.phone)} />
        </Section>
      )}

      {teamLoading && <div className="py-16 text-center text-[13px] text-gray-400">Working out your reporting line…</div>}
      {!teamLoading && !personPhone && <div className="py-16 text-center text-[13px] text-gray-400">Select a person to see their report card.</div>}
      {!teamLoading && personPhone && loading && !data && <div className="py-16 text-center text-[13px] text-gray-400">Loading…</div>}
      {!teamLoading && personPhone && !loading && !data && <div className="py-16 text-center text-[13px] text-gray-400">Failed to load data. Check filters and try again.</div>}

      {personPhone && data && !data.meta.has_bm && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center">
          <div className="text-[13px] font-semibold text-gray-700">
            {subjectName ? `No report-card data for ${subjectName}` : 'Select a person to see their report card'}
          </div>
          <div className="mt-1 text-[12px] text-gray-400">
            {selectedPerson
              ? `${stakeholderLabel(selectedPerson.stakeholder)} · report cards are built from leads owned in the CRM, and none resolved for ${rangeLabel}.`
              : `Nothing resolved for ${rangeLabel}.`}
          </div>
        </div>
      )}

      {personPhone && data && data.meta.has_bm && (
        <div className={`space-y-8 transition-opacity duration-150 ${loading ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
          <Section n="02" title="Walkin Attendance & Conversion" hint="Footfall breakdown · cart creation · revenue conversion">
            <WalkinTable w={data.walkin_analysis} />
          </Section>
          <Section n="03" title="Pipeline Cart Breakdown" hint="All open carts not yet won or lost · as of today">
            <PipelineTable p={data.pipeline_carts} />
          </Section>
          <Section n="04" title="Orders Lost Breakdown" hint="Lost count & value by reason">
            <OrdersLostTable o={data.orders_lost} />
          </Section>
          <Section n="05" title="CRM Adherence & Walkin Averages" hint="Follow-up discipline · turnaround time · footfall patterns">
            <CrmAdherenceSection c={data.crm_adherence} range={rangeLabel} />
          </Section>
          <Section n="06" title="Closure Pipeline" hint="Clients with expected closure in selected range">
            <ClosurePipelineSection clients={data.closure_pipeline.clients} catOptions={catNames} />
          </Section>
          <Section n="07" title="Rankings" hint="How the selected person compares to peers · highlighted row = selected person">
            <div className="space-y-6">
              {teamMatch && <TeamRankingTable match={teamMatch} teamSize={teamRoster.length} />}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <RankingTable title="Company-Wide" rows={data.rankings.company_wide} showStore />
                <RankingTable title={data.meta.store ? `Within ${data.meta.store}` : 'Within Store'} rows={data.rankings.within_store} />
              </div>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
