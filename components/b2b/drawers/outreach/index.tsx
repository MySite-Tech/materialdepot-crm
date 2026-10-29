'use client';

import { OutreachClientCard } from './cards/client';
import { OutreachCompanyCard } from './cards/company';
import { OutreachDealsCard } from './cards/deals';
import { OutreachHandoverCard } from './cards/handover';
import { OutreachJourneyCard } from './cards/journey';
import { OutreachNotesCard } from './cards/notes';
import { OutreachRequirementCard } from './cards/requirement';
import { OutreachStatusCard } from './cards/status';
import { OutreachFooter } from './footer';
import { OutreachHeader } from './header';
import { SaveState } from './types';
import { nowIso } from './utils';

import { LeadDeal, LeadNote, OutreachLead } from '../../models/mock-data';
import { dealIsOrder } from '../../models/client';
import {
  OutreachMeeting, Selection, WaitlistSignup, hasMet, istToday,
  meetingsStalled, nextKamRoundRobin, nextMeetingNumber, openMeeting, outreachEnrichmentGaps, outreachGateErrors,
  outreachStatusPrompts,
} from '../../models/outreach';
import { isHandoverKam, respondToHandover, sendHandover } from '../../models/outreach/handover';
import { Rep } from '../../models/outreach/intake';
import { newOnboardingFrom } from '../../models/outreach/kpis';
import { outreachCaptureErrors } from '../../models/outreach/reminders';
import { OutreachScope, SaveLead } from '../../views/outreach/types';
import { EnqLookup, fetchKamLoad, lookupEnqId } from '@/lib/b2b';
import { fetchLeadDeals } from '@/lib/api';
import { useEffect, useMemo, useRef, useState } from 'react';

export default function OutreachDrawer({
  lead, scope, waitlist, waitlistError, onClose, onSave,
}: {
  lead: OutreachLead;
  scope: OutreachScope;
  waitlist: WaitlistSignup | null | undefined;
  waitlistError: string | null;
  onClose: () => void;
  onSave: SaveLead;
}) {
  const [draft, setDraft] = useState<OutreachLead>(lead);
  const [save, setSave] = useState<SaveState>({ saving: false });
  const [showGates, setShowGates] = useState(false);
  const today = istToday();
  const nowMs = useMemo(() => Date.now(), [lead]);

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

  const gateErrors = useMemo(() => [
    ...outreachGateErrors({ status: draft.status, followUpDate: draft.followUpDate, lostReason: draft.lostReason }),
    ...outreachCaptureErrors(draft),
  ], [draft]);

  const prompts = useMemo(() => outreachStatusPrompts({
    status: draft.status, enqId: draft.enqId, followUpDate: draft.followUpDate,
  }), [draft.status, draft.enqId, draft.followUpDate]);

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
      const onboarding = deals && !dealsFailed ? newOnboardingFrom(deals, want, dealIsOrder) : undefined;
      setDraft((d) => ({
        ...d,
        orderValue: res.orderValue ?? 0,
        orderValueSource: 'deal',
        dealStatus: res.dealStatus,
        newOnboarding: onboarding,
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
  const exhausted = meetingsStalled(meetings);
  const met = hasMet(meetings);

  const [scheduling, setScheduling] = useState(false);
  const [mDate, setMDate] = useState('');
  const [mTime, setMTime] = useState('');
  const [mArea, setMArea] = useState('');
  const [mOffice, setMOffice] = useState('');
  const [mError, setMError] = useState<string | null>(null);

  const scheduleMeeting = () => {
    if (!mDate) { setMError('A meeting date is required.'); return; }
    setMError(null);
    const m: OutreachMeeting = {
      n: nextMeetingNumber(meetings),
      date: mDate,
      time: mTime || undefined,
      area: mArea.trim() || undefined,
      officeLocation: mOffice.trim() || undefined,
      status: 'Scheduled',
      loggedBy: scope.me.name || draft.bm,
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
  const autoKam = async (): Promise<string | null> => {
    const load = kamLoad ?? await fetchKamLoad();
    setKamLoad(load);
    return nextKamRoundRobin(scope.kams.map((k) => k.name), load) ?? null;
  };

  const [noteText, setNoteText] = useState('');
  const addNote = () => {
    const text = noteText.trim();
    if (!text) return;
    const note: LeadNote = {
      ts: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
      author: scope.me.name || draft.bm,
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

  const persist = async (next: OutreachLead, close: boolean, gated = true): Promise<boolean> => {
    if (save.saving) return false;
    if (gated && gateErrors.length) {
      setShowGates(true);
      setSave({ saving: false, error: `Not saved yet — ${gateErrors.join(' ')}` });
      return false;
    }
    setSave({ saving: true });
    const statusChanged = next.status !== lead.status;
    const toSave: OutreachLead = {
      ...next,
      company: next.company.trim(),
      statusChangedAt: statusChanged ? nowIso() : next.statusChangedAt,
      quoteSharedAt: next.status === 'Quote Share' && !next.quoteSharedAt ? nowIso() : next.quoteSharedAt,
    };
    const err = await onSave(lead, toSave);
    if (err) {
      setSave({ saving: false, error: `Save failed: ${err}. Nothing was stored — try again.` });
      return false;
    }
    setSave({ saving: false });
    if (close) onClose();
    return true;
  };

  const handleSave = async () => { await persist(draft, true); };

  const sendNow = async (kam: Rep) => {
    const next = sendHandover(draft, kam, scope.me.name || draft.bm, nowIso());
    if (await persist(next, false)) setDraft(next);
  };

  const respond = async (accept: boolean, reason?: string) => {
    const next = respondToHandover(lead, accept, scope.me.name, nowIso(), reason);
    if (await persist(next, false, false)) setDraft((d) => ({ ...d, handover: next.handover }));
  };

  const enqDeal = enq?.status === 'matched' ? enq.deal : undefined;
  const canRespond = scope.mode === 'open' || scope.isManager || isHandoverKam(lead, { name: scope.me.name, phone: scope.me.phone || '' });

  return (
    <div className="fixed inset-0 z-[1200] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[780px] bg-[#F7F7F8] h-full overflow-y-auto shadow-2xl flex flex-col">
        <OutreachHeader draft={draft} gaps={gaps} onClose={onClose} today={today} waitlist={waitlist} waitlistError={waitlistError} nowMs={nowMs} />

        <div className="p-5 flex flex-col gap-4">
          <OutreachClientCard
            draft={draft}
            set={set}
            reps={scope.reps}
            canPickBm={scope.mode !== 'mine'}
            onPickBm={(r) => setDraft((d) => ({ ...d, bm: r.name, bmPhone: r.phone }))}
          />

          <OutreachCompanyCard
            draft={draft}
            set={set}
            showGates={showGates}
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

          <OutreachRequirementCard draft={draft} set={set} toggleSelection={toggleSelection} />

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

          <OutreachHandoverCard
            draft={draft}
            saved={lead}
            kams={scope.kams}
            canRespond={canRespond}
            nowMs={nowMs}
            busy={save.saving}
            kamLoad={kamLoad}
            onAutoKam={autoKam}
            onSend={sendNow}
            onRespond={respond}
            set={set}
            setDraft={setDraft}
          />

          <OutreachNotesCard addNote={addNote} draft={draft} noteText={noteText} setNoteText={setNoteText} />

          <OutreachDealsCard checkEnq={checkEnq} deals={deals} dealsFailed={dealsFailed} draft={draft} set={set} />

          <OutreachJourneyCard lead={lead} waitlist={waitlist} />
        </div>

        <OutreachFooter handleSave={handleSave} meetings={meetings} met={met} onClose={onClose} save={save} />
      </div>
    </div>
  );
}
