'use client';

import { OutreachActivity } from './cards/activity';
import { OutreachClientCard } from './cards/client';
import { OutreachAssistedCard, OutreachDealsCard } from './cards/deals';
import { OutreachHandoverCard } from './cards/handover';
import { OutreachJourneyCard, OutreachSourceCard } from './cards/journey';
import { OutreachPeople } from './cards/people';
import { OutreachStatusCard } from './cards/status';
import { OutreachFooter } from './footer';
import { OutreachHeader } from './header';
import { OutreachMeetings } from './meetings';
import { OutreachTab, OutreachTabDef, SaveState } from './types';
import { gateTab, nowIso } from './utils';

import { LeadDeal, LeadNote, OutreachLead } from '../../models/mock-data';
import { dealIsOpen, dealIsOrder } from '../../models/client';
import { CallAttempt, CallAttemptOutcome, nextAttemptNumber } from '../../models/inbound';
import {
  MeetingCheckIn, OutreachMeeting, WaitlistSignup, hasMet, istToday,
  nextKamRoundRobin, outreachEnrichmentGaps, outreachGateErrors, outreachStatusPrompts,
} from '../../models/outreach';
import { HANDOVER_STATE_LABEL, handoverState, isHandoverKam, respondToHandover, sameRep, sendHandover } from '../../models/outreach/handover';
import { Rep, assignLead } from '../../models/outreach/intake';
import { newOnboardingFrom } from '../../models/outreach/kpis';
import { istDay, meetingGaps, outreachCaptureErrors, withRebooking } from '../../models/outreach/reminders';
import { OutreachScope, SaveLead } from '../../views/outreach/types';
import { EnqLookup, fetchKamLoad, lookupEnqId, outreachPhones, saveOutreachHandoverFirm } from '@/lib/b2b';
import { fetchFirmDeals } from '@/lib/api';
import { CheckInCapture } from '../../ui/check-in-capture';
import { OrderCreditLine } from '../../order-credit/ui/credit-line';
import { RedirectToEc, openEnquiries, uniquePhones } from '../../ui/redirect-to-ec';
import { ReferralsCard } from '../../ui/referrals';
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
  const [tab, setTab] = useState<OutreachTab>('activity');
  const today = istToday();
  const nowMs = useMemo(() => Date.now(), [lead]);

  const set = <K extends keyof OutreachLead>(k: K, v: OutreachLead[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const [deals, setDeals] = useState<LeadDeal[] | null>(null);
  const [dealsFailed, setDealsFailed] = useState(false);

  const phoneKey = useMemo(
    () => outreachPhones(lead).join(','),
    [lead.phone, lead.altPhone, lead.contacts],
  );

  useEffect(() => {
    let alive = true;
    if (!phoneKey) { setDeals([]); return; }
    setDealsFailed(false);
    fetchFirmDeals(phoneKey.split(','))
      .then((d) => { if (alive) setDeals(d); })
      .catch(() => { if (alive) { setDeals([]); setDealsFailed(true); } });
    return () => { alive = false; };
  }, [phoneKey]);

  const stageErrors = useMemo(
    () => outreachGateErrors({ status: draft.status, followUpDate: draft.followUpDate, lostReason: draft.lostReason }),
    [draft.status, draft.followUpDate, draft.lostReason],
  );
  const gateErrors = useMemo(() => [...stageErrors, ...outreachCaptureErrors(draft)], [stageErrors, draft]);

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
    const res = await lookupEnqId(outreachPhones(draft), want);
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
  const locked = useMemo(() => new Set((lead.meetings || []).filter((m) => m.status !== 'Scheduled').map((m) => m.n)), [lead.meetings]);
  const stored = useMemo(() => new Map((lead.meetings || []).map((m) => [m.n, m])), [lead.meetings]);
  const [checkingIn, setCheckingIn] = useState<number | null>(null);
  const patchMeeting = (n: number, patch: Partial<OutreachMeeting>) =>
    setDraft((d) => ({
      ...d,
      meetings: (d.meetings || []).map((m) => (m.n === n ? { ...m, ...patch, updatedAt: nowIso() } : m)),
    }));
  const recordCheckIn = async (n: number, c: MeetingCheckIn): Promise<string | null> => {
    const date = istDay(c.at);
    const after = { ...lead, meetings: (lead.meetings || []).map((m) => (m.n === n ? { ...m, checkIn: c, date, updatedAt: nowIso() } : m)) };
    const err = await onSave(lead, after);
    if (err) return `The check-in was not saved: ${err}`;
    patchMeeting(n, { checkIn: c, date });
    return null;
  };
  const met = hasMet(meetings);

  const logCall = async (outcome: CallAttemptOutcome, note: string): Promise<string | null> => {
    const attempt: CallAttempt = {
      n: nextAttemptNumber(lead.callAttempts), outcome, at: nowIso(),
      by: scope.me.name || undefined, byPhone: scope.me.phone || undefined, note: note || undefined,
    };
    const err = await onSave(lead, { ...lead, callAttempts: [...(lead.callAttempts || []), attempt] });
    if (err) return `The call was not saved: ${err}`;
    setDraft((d) => ({ ...d, callAttempts: [...(d.callAttempts || []), attempt] }));
    return null;
  };

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

  const persist = async (next: OutreachLead, close: boolean, gated = true): Promise<boolean> => {
    if (save.saving) return false;
    if (gated && gateErrors.length) {
      setShowGates(true);
      setTab(gateTab(draft, stageErrors));
      setSave({ saving: false, error: `Not saved yet — ${gateErrors.join(' ')}` });
      return false;
    }
    setSave({ saving: true });
    const statusChanged = next.status !== lead.status;
    const toSave: OutreachLead = {
      ...next,
      meetings: withRebooking(lead.meetings, next.meetings, nowIso()),
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
    if (save.saving) return;
    const at = nowIso();
    const next = respondToHandover(lead, accept, scope.me.name, at, reason);
    if (accept) {
      setSave({ saving: true });
      const err = await saveOutreachHandoverFirm(next, at);
      if (err) {
        setSave({ saving: false, error: `Not accepted yet: the firm could not be added to the Client Database, so the KAM tab would not find it (${err}). Try again.` });
        return;
      }
      setSave({ saving: false });
    }
    if (await persist(next, false, false)) setDraft((d) => ({ ...d, handover: next.handover }));
  };

  const enqDeal = enq?.status === 'matched' ? enq.deal : undefined;
  const canRespond = scope.mode === 'open' || scope.isManager || isHandoverKam(lead, { name: scope.me.name, phone: scope.me.phone || '' });
  const pickBm = (r: Rep) => setDraft((d) => (scope.isManager ? assignLead(d, r, scope.me.name, nowIso(), sameRep(r.name, scope.me.name) ? 'self' : 'manual') : { ...d, bm: r.name, bmPhone: r.phone }));

  const hs = handoverState(draft, nowMs);
  const unfinished = meetings.filter((m) => meetingGaps(m).length).length;
  const openDeals = (deals || []).filter((d) => dealIsOpen(d.status)).length;
  const tabs: OutreachTabDef[] = [
    { key: 'activity', label: 'Activity', badge: draft.callAttempts?.length ? String(draft.callAttempts.length) : undefined },
    { key: 'meetings', label: 'Meetings', badge: unfinished ? `${unfinished} to finish` : meetings.length ? String(meetings.length) : undefined, warn: !!unfinished },
    { key: 'client', label: 'Client', badge: gaps.length ? `${gaps.length} missing` : undefined, warn: true },
    { key: 'deal', label: 'Deal', badge: openDeals ? `${openDeals} open` : undefined },
    { key: 'handoff', label: 'Hand-offs', badge: hs === 'not-converted' ? undefined : HANDOVER_STATE_LABEL[hs].toLowerCase(), warn: hs === 'ready' || hs === 'overdue' || hs === 'rejected' },
    { key: 'journey', label: 'Journey' },
  ];
  const pane = (k: OutreachTab) => (tab === k ? 'flex flex-col gap-3' : 'hidden');

  return (
    <div className="fixed inset-0 z-[1200] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[780px] bg-[#F7F7F8] h-full overflow-y-auto shadow-2xl flex flex-col">
        <OutreachHeader
          draft={draft}
          gaps={gaps}
          today={today}
          waitlist={waitlist}
          waitlistError={waitlistError}
          nowMs={nowMs}
          tabs={tabs}
          tab={tab}
          onTab={setTab}
          onClose={onClose}
          people={<OutreachPeople draft={draft} reps={scope.reps} canPickBm={scope.mode !== 'mine'} onPickBm={pickBm} />}
        />

        <div className="p-4">
          <div className={pane('activity')}>
            <OutreachActivity
              draft={draft}
              savedNotes={(lead.notes || []).length}
              today={today}
              onLog={logCall}
              noteText={noteText}
              setNoteText={setNoteText}
              addNote={addNote}
              onFollowUp={() => setTab('deal')}
            />
          </div>

          <div className={pane('meetings')}>
            <OutreachMeetings
              draft={draft}
              set={set}
              setDraft={setDraft}
              patchMeeting={patchMeeting}
              showGates={showGates}
              locked={locked}
              stored={stored}
              loggedBy={scope.me.name || draft.bm}
              onCheckIn={setCheckingIn}
            />
          </div>

          <div className={pane('client')}>
            <OutreachClientCard draft={draft} set={set} />
          </div>

          <div className={pane('deal')}>
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
            <OutreachDealsCard checkEnq={checkEnq} deals={deals} dealsFailed={dealsFailed} draft={draft} set={set} />
            <OutreachAssistedCard draft={draft} set={set} setDraft={setDraft} />
            {draft.status === 'Closed' && !!draft.enqId && <OrderCreditLine enquiryId={draft.enqId} rule={draft.bm} />}
          </div>

          <div className={pane('handoff')}>
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
            <RedirectToEc
              firm={draft.company}
              contactName={draft.contactPerson}
              phones={uniquePhones([draft.phone, draft.altPhone, ...(draft.contacts || []).map((c) => c.phone)])}
              sourceTeam="outreach"
              leadRef={draft.id}
              enquiries={openEnquiries(deals ?? [])}
              enquiriesState={!deals ? 'loading' : dealsFailed ? 'failed' : 'ready'}
            />
            <ReferralsCard kind="outreach" referrerId={draft.id} referrerName={draft.company} by={scope.me.name || undefined} />
          </div>

          <div className={pane('journey')}>
            <OutreachSourceCard draft={draft} set={set} />
            <OutreachJourneyCard lead={lead} waitlist={waitlist} />
          </div>
        </div>

        <OutreachFooter handleSave={handleSave} meetings={meetings} met={met} onClose={onClose} save={save} />
      </div>
      {checkingIn != null && (
        <CheckInCapture
          title={`${draft.company || 'Meeting'} · meeting ${checkingIn}`}
          by={scope.me.name}
          onClose={() => setCheckingIn(null)}
          onDone={(c) => recordCheckIn(checkingIn, c)}
        />
      )}
    </div>
  );
}
