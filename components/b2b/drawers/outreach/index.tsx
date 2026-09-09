'use client';

import { OutreachClientCard } from './client-card';
import { OutreachCompanyCard } from './company-card';
import { OutreachDealsCard } from './deals-card';
import { OutreachFooter } from './footer';
import { OutreachHeader } from './header';
import { OutreachMeetingsCard } from './meetings-card';
import { OutreachNotesCard } from './notes-card';
import { OutreachRequirementCard } from './requirement-card';
import { OutreachStatusCard } from './status-card';

import { Selection } from '../../models/outreachModel';

import { B2B_REPS, KAMS, LeadDeal, LeadNote, OutreachLead, fmtINR } from '../../models/mockData';
import { COMPANY_TYPES, CompanyType, LEAD_TYPES, LeadType, MAX_MEETINGS, MEETING_STATUSES, MeetingStatus, OUTREACH_ENRICHMENT_FIELD_COUNT, OUTREACH_LOST_REASONS, OUTREACH_STATUSES, OUTREACH_STATUS_HINT, OutreachMeeting, OutreachStatus, SEGMENTS, SELECTIONS, Segment, canScheduleMeeting, hasMet, istToday, meetingsExhausted, nextKamRoundRobin, nextMeetingNumber, openMeeting, outreachEnrichmentGaps, outreachGateErrors, outreachStatusPrompts } from '../../models/outreachModel';
import EcPicker from '../../ui/EcPicker';
import { LostReasonSelect } from '../../ui/exportUtils';
import { Empty, Field, FollowUpChip, GateErrors, ReadValue, SectionCard, Spinner, errorInputCls, fmtDay, inputCls } from '../../ui/inboundChips';
import { MeetingStatusChip, OutreachLeadTypeChip, OutreachStatusBadge } from '../../ui/outreachChips';
import { SaveState } from '../../types/outreach-drawer';
import { nowIso } from '../../utils/outreach-drawer';
import { EnqLookup, fetchKamLoad, lookupEnqId, upsertOutreachLead } from '@/lib/b2bLeads';
import { fetchLeadDeals } from '@/lib/mockApi';
import { useEffect, useMemo, useRef, useState } from 'react';

export default function OutreachDrawer({
  lead, onClose, onSaved,
}: {
  lead: OutreachLead;
  onClose: () => void;

  onSaved: (updated: OutreachLead) => void;
}) {
  const [draft, setDraft] = useState<OutreachLead>(lead);
  const [save, setSave] = useState<SaveState>({ saving: false });
  const [showGates, setShowGates] = useState(false);
  const today = istToday();

  const set = <K extends keyof OutreachLead>(k: K, v: OutreachLead[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const [deals, setDeals] = useState<LeadDeal[] | null>(null);
  const [dealsFailed, setDealsFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!lead.phone) { setDeals([]); return; }
    setDealsFailed(false);
    fetchLeadDeals(lead.phone)
      .then((d) => { if (alive) setDeals(d); })
      .catch(() => { if (alive) { setDeals([]); setDealsFailed(true); } });
    return () => { alive = false; };
  }, [lead.phone]);

  const gateErrors = useMemo(() => outreachGateErrors({
    status: draft.status,
    followUpDate: draft.followUpDate,
    lostReason: draft.lostReason,
  }), [draft.status, draft.followUpDate, draft.lostReason]);

  const prompts = useMemo(() => outreachStatusPrompts({
    status: draft.status, enqId: draft.enqId, followUpDate: draft.followUpDate, kam: draft.kam,
  }), [draft.status, draft.enqId, draft.followUpDate, draft.kam]);

  const gaps = useMemo(() => outreachEnrichmentGaps({
    contactPerson: draft.contactPerson,
    designation: draft.designation,
    segment: draft.segment,
    leadType: draft.leadType,
    companyType: draft.companyType,
    selections: draft.selections,
    requirement: draft.requirement,
    expectedOrderValue: draft.expectedOrderValue,
  }), [draft.contactPerson, draft.designation, draft.segment, draft.leadType,
    draft.companyType, draft.selections, draft.requirement, draft.expectedOrderValue]);

  const gateFor = (field: 'followUpDate' | 'lostReason'): string | undefined => {
    if (!showGates) return undefined;
    const needle = field === 'followUpDate' ? 'follow-up date' : 'lost reason';
    return gateErrors.find((e) => e.toLowerCase().includes(needle));
  };

  const [enq, setEnq] = useState<EnqLookup | null>(null);
  const [enqChecking, setEnqChecking] = useState(false);
  const lastCheckedEnq = useRef<string>('');

  const checkEnq = async (id?: string) => {
    const want = (id ?? draft.enqId ?? '').trim();
    if (!want || enqChecking) return;
    setEnqChecking(true);
    lastCheckedEnq.current = want;
    const res = await lookupEnqId(draft.phone, want);
    setEnq(res);
    if (res.status === 'matched') {
      setDraft((d) => ({
        ...d,
        orderValue: res.orderValue ?? 0,
        orderValueSource: 'deal',
        dealStatus: res.dealStatus,
        // Deliberately NOT auto-filling "Assisted at EC" from the ticket's
        // branch or assignee. A cart's branch is where it was raised; "assisted
        // at" is a claim about who helped close it, and inferring one from the
        // other would put a name in a field nobody attested to.
      }));
    } else if (res.status === 'no-match') {
      setDraft((d) => ({ ...d, orderValueSource: 'manual' }));
    }
    setEnqChecking(false);
  };

  useEffect(() => {
    const cur = (draft.enqId || '').trim();
    if (cur !== lastCheckedEnq.current) setEnq(null);
  }, [draft.enqId]);

  const meetings = draft.meetings || [];
  const open = openMeeting(meetings);
  const exhausted = meetingsExhausted(meetings);
  const met = hasMet(meetings);

  const [scheduling, setScheduling] = useState(false);
  const [mDate, setMDate] = useState('');
  const [mTime, setMTime] = useState('');
  const [mArea, setMArea] = useState('');
  const [mOffice, setMOffice] = useState('');
  const [mError, setMError] = useState<string | null>(null);

  const scheduleMeeting = () => {
    if (!mDate) { setMError('A meeting date is required.'); return; }
    if (!canScheduleMeeting(meetings)) { setMError(`Only ${MAX_MEETINGS} meetings can be logged on a lead.`); return; }
    setMError(null);
    const m: OutreachMeeting = {
      n: nextMeetingNumber(meetings),
      date: mDate,
      time: mTime || undefined,
      area: mArea.trim() || undefined,
      officeLocation: mOffice.trim() || undefined,
      status: 'Scheduled',
      loggedBy: draft.bm,
      updatedAt: nowIso(),
    };
    setDraft((d) => ({ ...d, meetings: [...(d.meetings || []), m] }));
    setScheduling(false);
    setMDate(''); setMTime(''); setMArea(''); setMOffice('');
  };

  const patchMeeting = (n: number, patch: Partial<OutreachMeeting>) =>
    setDraft((d) => ({
      ...d,
      meetings: (d.meetings || []).map((m) => (m.n === n ? { ...m, ...patch, updatedAt: nowIso() } : m)),
    }));

  const [kamLoad, setKamLoad] = useState<Record<string, number> | null>(null);
  const [kamAssigning, setKamAssigning] = useState(false);

  const assignKam = async () => {
    if (kamAssigning) return;
    setKamAssigning(true);
    const load = kamLoad ?? await fetchKamLoad();
    setKamLoad(load);
    const pick = nextKamRoundRobin(KAMS, load);
    setKamAssigning(false);
    if (pick) set('kam', pick);
  };

  const [noteText, setNoteText] = useState('');
  const addNote = () => {
    const text = noteText.trim();
    if (!text) return;
    const note: LeadNote = {
      ts: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      author: draft.bm,
      text,
    };
    setDraft((d) => ({ ...d, notes: [...(d.notes || []), note] }));
    setNoteText('');
  };

  const toggleSelection = (s: Selection) =>
    setDraft((d) => {
      const cur = d.selections || [];
      return { ...d, selections: cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s] };
    });

  const handleSave = async () => {
    if (save.saving) return;
    if (gateErrors.length) { setShowGates(true); return; }
    setSave({ saving: true });

    const statusChanged = draft.status !== lead.status;
    const toSave: OutreachLead = {
      ...draft,
      company: draft.company.trim(),
      statusChangedAt: statusChanged ? nowIso() : draft.statusChangedAt,
      quoteSharedAt: draft.status === 'Quote Share' && !draft.quoteSharedAt ? nowIso() : draft.quoteSharedAt,

      value: Number(draft.orderValue) || 0,
    };

    const err = await upsertOutreachLead(toSave);
    if (err) {
      setSave({ saving: false, error: `Save failed: ${err}. Nothing was stored — try again.` });
      return;
    }
    setDraft(toSave);
    onSaved(toSave);
    setSave({ saving: false });
    onClose();
  };

  const enqDeal = enq?.status === 'matched' ? enq.deal : undefined;

  return (
    <div className="fixed inset-0 z-[1200] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[780px] bg-[#F7F7F8] h-full overflow-y-auto shadow-2xl flex flex-col">

        <OutreachHeader
        draft={draft}
        gaps={gaps}
        onClose={onClose}
        today={today}
      />

        <div className="p-5 flex flex-col gap-4">

          <OutreachClientCard
        draft={draft}
        set={set}
      />

          <OutreachCompanyCard
        exhausted={exhausted}
        mArea={mArea}
        mDate={mDate}
        mError={mError}
        mOffice={mOffice}
        mTime={mTime}
        meetings={meetings}
        open={open}
        patchMeeting={patchMeeting}
        scheduleMeeting={scheduleMeeting}
        scheduling={scheduling}
        setMArea={setMArea}
        setMDate={setMDate}
        setMError={setMError}
        setMOffice={setMOffice}
        setMTime={setMTime}
        setScheduling={setScheduling}
      />

          <OutreachRequirementCard
        draft={draft}
        set={set}
        toggleSelection={toggleSelection}
      />

          <OutreachStatusCard
        checkEnq={checkEnq}
        draft={draft}
        enq={enq}
        enqChecking={enqChecking}
        enqDeal={enqDeal}
        gateErrors={gateErrors}
        gateFor={gateFor}
        prompts={prompts}
        set={set}
        setDraft={setDraft}
        showGates={showGates}
      />

          <OutreachMeetingsCard
        assignKam={assignKam}
        draft={draft}
        kamAssigning={kamAssigning}
        kamLoad={kamLoad}
        set={set}
        setDraft={setDraft}
      />

          <OutreachNotesCard
        addNote={addNote}
        draft={draft}
        noteText={noteText}
        setNoteText={setNoteText}
      />

          <OutreachDealsCard
        checkEnq={checkEnq}
        deals={deals}
        dealsFailed={dealsFailed}
        draft={draft}
        set={set}
      />
        </div>

        <OutreachFooter
        handleSave={handleSave}
        meetings={meetings}
        met={met}
        onClose={onClose}
        save={save}
      />
      </div>
    </div>
  );
}
