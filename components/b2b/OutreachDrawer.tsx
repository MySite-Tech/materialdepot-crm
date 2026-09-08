'use client';

// ── Outreach lead drawer ─────────────────────────────────────────────────────
// Organised by the PRD's own sections, in the order a BM works them:
//
//   Client (§3.1) → Meetings (§3.2) → Requirement (§3.3) → Status (§3.4)
//   → Handoff (§7)
//
// Unlike the Inbound drawer there is no Kylas leg to reconcile — a BM created
// this lead in the field and the CRM owns every field on it except the money,
// which comes from the deal ticket behind the Enq ID.

import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchLeadDeals } from '@/lib/mockApi';
import { upsertOutreachLead, lookupEnqId, fetchKamLoad, type EnqLookup } from '@/lib/b2bLeads';
import { fmtINR, KAMS, B2B_REPS, type OutreachLead, type LeadDeal, type LeadNote } from './mockData';
import {
  OUTREACH_STATUSES, OUTREACH_STATUS_HINT, OUTREACH_LOST_REASONS,
  SEGMENTS, LEAD_TYPES, SELECTIONS, COMPANY_TYPES, MAX_MEETINGS, MEETING_STATUSES,
  outreachGateErrors, outreachStatusPrompts, outreachEnrichmentGaps,
  OUTREACH_ENRICHMENT_FIELD_COUNT,
  nextMeetingNumber, canScheduleMeeting, openMeeting, meetingsExhausted, hasMet,
  nextKamRoundRobin, istToday,
  type OutreachStatus, type OutreachMeeting, type MeetingStatus,
  type Segment, type LeadType, type Selection, type CompanyType,
} from './outreachModel';
import {
  SectionCard, Field, ReadValue, Spinner, Empty, GateErrors, FollowUpChip,
  inputCls, errorInputCls, fmtDay,
} from './inboundChips';
import { OutreachStatusBadge, OutreachLeadTypeChip, MeetingStatusChip } from './outreachChips';
import { LostReasonSelect } from './exportUtils';
import EcPicker from './EcPicker';

interface SaveState {
  saving: boolean;
  warning?: string;
  error?: string;
}

const nowIso = () => new Date().toISOString();

export default function OutreachDrawer({
  lead, onClose, onSaved,
}: {
  lead: OutreachLead;
  onClose: () => void;
  /** Called with the persisted lead so the board can update in place. */
  onSaved: (updated: OutreachLead) => void;
}) {
  const [draft, setDraft] = useState<OutreachLead>(lead);
  const [save, setSave] = useState<SaveState>({ saving: false });
  const [showGates, setShowGates] = useState(false);
  const today = istToday();

  const set = <K extends keyof OutreachLead>(k: K, v: OutreachLead[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  // ── Deal tickets on this client's number ──
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

  // ── Gates ──
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

  // ── Enq ID → order value (PRD §3.4 "auto-fetched from Procurement") ──
  //
  // Identical rule to Inbound: EXACT match against the deal tickets already on
  // the client's phone, and a Django outage is reported as unavailable rather
  // than as an invalid Enq ID.
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

  // A changed Enq ID invalidates the previous lookup immediately, so a matched
  // value can never sit under an ID it did not come from.
  useEffect(() => {
    const cur = (draft.enqId || '').trim();
    if (cur !== lastCheckedEnq.current) setEnq(null);
  }, [draft.enqId]);

  // ── Meetings (PRD §3.2) ──
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

  // ── KAM handoff (PRD §7) ──
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

  // ── Notes ──
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

  // ── Save ──
  // One system, so unlike the Inbound drawer there is no partial-success case:
  // the write either lands or it does not, and a failure never closes the panel
  // (which would look exactly like a successful save).
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
      // Realised rupees only — the BM's estimate never reaches this field.
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

        {/* ── Header ── */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold text-gray-900 truncate">
                {draft.company || <span className="text-gray-400 font-semibold italic">Unnamed company</span>}
              </h2>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className="text-[12px] text-gray-500">{draft.contactPerson || '—'}</span>
                {draft.designation && <span className="text-[12px] text-gray-400">· {draft.designation}</span>}
                <span className="text-gray-300">·</span>
                <OutreachStatusBadge s={draft.status} />
                <OutreachLeadTypeChip t={draft.leadType} />
                {(draft.status === 'Follow up' || draft.status === 'PI Shared') && (
                  <FollowUpChip date={draft.followUpDate} today={today} />
                )}
              </div>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none shrink-0">×</button>
          </div>
          {gaps.length > 0 && (
            <p className="text-[11px] text-gray-500 mt-2.5">
              <span className="font-semibold text-amber-700">{gaps.length} of {OUTREACH_ENRICHMENT_FIELD_COUNT} fields still empty</span>
              {' — '}{gaps.map((g) => g.label).join(', ')}. These do not block a save.
            </p>
          )}
        </div>

        <div className="p-5 flex flex-col gap-4">

          {/* ── §3.1 Client ── */}
          <SectionCard title="Client" owner="crm" subtitle="Captured on the field visit">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Company name" required className="col-span-2 sm:col-span-1">
                <input value={draft.company} onChange={(e) => set('company', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Contact person">
                <input value={draft.contactPerson || ''} onChange={(e) => set('contactPerson', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Designation">
                <input value={draft.designation || ''} onChange={(e) => set('designation', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Contact number" hint="Used to match the deal tickets">
                <input value={draft.phone || ''} onChange={(e) => set('phone', e.target.value)} className={inputCls} />
              </Field>
              <Field label="GST" hint="Optional — the PRD does not require it">
                <input value={draft.gstNumber || ''} onChange={(e) => set('gstNumber', e.target.value)} className={inputCls} />
              </Field>
              <Field label="Segment">
                <select value={draft.segment || ''} onChange={(e) => set('segment', (e.target.value || undefined) as Segment | undefined)} className={inputCls}>
                  <option value="">—</option>
                  {SEGMENTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Lead type">
                <select value={draft.leadType || ''} onChange={(e) => set('leadType', (e.target.value || undefined) as LeadType | undefined)} className={inputCls}>
                  <option value="">—</option>
                  {LEAD_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Company type">
                <select value={draft.companyType || ''} onChange={(e) => set('companyType', (e.target.value || undefined) as CompanyType | undefined)} className={inputCls}>
                  <option value="">—</option>
                  {COMPANY_TYPES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              {draft.companyType === 'Other' && (
                <Field label="Specify" required>
                  <input value={draft.companyTypeOther || ''} onChange={(e) => set('companyTypeOther', e.target.value)} placeholder="e.g. Modular factory" className={inputCls} />
                </Field>
              )}
              <Field label="BM (owner)">
                <select value={draft.bm} onChange={(e) => set('bm', e.target.value)} className={inputCls}>
                  {B2B_REPS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </Field>
            </div>
          </SectionCard>

          {/* ── §3.2 Meetings ── */}
          <SectionCard
            title={`Meetings · ${meetings.length} of ${MAX_MEETINGS}`}
            owner="crm"
            subtitle="Each logged Completed or Postponed"
            right={canScheduleMeeting(meetings) && !open && (
              <button
                onClick={() => setScheduling((v) => !v)}
                className="px-3 py-1 text-[11px] font-semibold rounded-md bg-[#0F766E] text-white whitespace-nowrap"
              >
                + Schedule meeting {nextMeetingNumber(meetings)}
              </button>
            )}
          >
            {exhausted && (
              <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800 leading-snug">
                All {MAX_MEETINGS} meetings were postponed and none was held. The PRD&apos;s lifecycle
                stops here: mark the lead <strong>Lost</strong> with reason &ldquo;Unable to meet (4 meetings)&rdquo;,
                or park it on <strong>Follow up</strong> with a long-term date. Nothing is decided for you.
              </div>
            )}

            {scheduling && (
              <div className="mb-3 rounded-md border border-gray-200 bg-gray-50/70 p-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Meeting date" required>
                    <input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} className={mError && !mDate ? errorInputCls : inputCls} />
                  </Field>
                  <Field label="Time">
                    <input type="time" value={mTime} onChange={(e) => setMTime(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Area" hint="e.g. Indiranagar">
                    <input value={mArea} onChange={(e) => setMArea(e.target.value)} className={inputCls} />
                  </Field>
                  <Field label="Office location">
                    <input value={mOffice} onChange={(e) => setMOffice(e.target.value)} className={inputCls} />
                  </Field>
                </div>
                {mError && <p className="text-[11px] text-red-600 mt-2">{mError}</p>}
                <div className="flex items-center justify-end gap-2 mt-3">
                  <button onClick={() => { setScheduling(false); setMError(null); }} className="px-3 py-1.5 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">Cancel</button>
                  <button onClick={scheduleMeeting} className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white">Add meeting</button>
                </div>
              </div>
            )}

            {meetings.length === 0 && !scheduling ? (
              <Empty>No meetings scheduled yet — the lead sits in &ldquo;Yet to Meet&rdquo; until one is held.</Empty>
            ) : (
              <div className="flex flex-col gap-2">
                {meetings.map((m) => (
                  <div key={m.n} className="rounded-md border border-gray-200 p-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] font-bold text-gray-700">Meeting {m.n}</span>
                        <MeetingStatusChip s={m.status} />
                      </div>
                      <select
                        value={m.status}
                        onChange={(e) => patchMeeting(m.n, { status: e.target.value as MeetingStatus })}
                        className="px-2 py-1 text-[11px] border border-gray-200 rounded-md bg-white outline-none"
                      >
                        {MEETING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-2.5">
                      <Field label="Date">
                        <input type="date" value={m.date || ''} onChange={(e) => patchMeeting(m.n, { date: e.target.value })} className={inputCls} />
                      </Field>
                      <Field label="Time">
                        <input type="time" value={m.time || ''} onChange={(e) => patchMeeting(m.n, { time: e.target.value })} className={inputCls} />
                      </Field>
                      <Field label="Area">
                        <input value={m.area || ''} onChange={(e) => patchMeeting(m.n, { area: e.target.value })} className={inputCls} />
                      </Field>
                      <Field label="Office location">
                        <input value={m.officeLocation || ''} onChange={(e) => patchMeeting(m.n, { officeLocation: e.target.value })} className={inputCls} />
                      </Field>
                    </div>
                    {/* PRD: notes are "captured once a meeting is Completed". The box
                        appears then rather than inviting notes on a meeting nobody attended. */}
                    {m.status === 'Completed' ? (
                      <Field label="Meeting notes" className="mt-2.5">
                        <textarea
                          value={m.notes || ''}
                          onChange={(e) => patchMeeting(m.n, { notes: e.target.value })}
                          rows={2}
                          placeholder="What was discussed, what they asked for…"
                          className={inputCls + ' resize-none'}
                        />
                      </Field>
                    ) : m.notes ? (
                      <Field label="Meeting notes" hint="Recorded when this meeting was marked Completed" className="mt-2.5">
                        <ReadValue v={m.notes} />
                      </Field>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* ── §3.3 Requirement ── */}
          <SectionCard title="Requirement" owner="crm" subtitle="PRD §3.3">
            <Field label="Selection">
              <div className="flex flex-wrap gap-2">
                {SELECTIONS.map((s) => {
                  const active = (draft.selections || []).includes(s);
                  return (
                    <button
                      key={s}
                      onClick={() => toggleSelection(s)}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold border ${active ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="Requirement summary" className="mt-3">
              <textarea value={draft.requirement || ''} onChange={(e) => set('requirement', e.target.value)} rows={3} className={inputCls + ' resize-none'} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <Field
                label="Expected order value (₹)"
                hint="Your estimate at qualification. Reported as an estimate on the Quote Shared tile — never as revenue."
              >
                <input
                  type="number"
                  min={0}
                  value={draft.expectedOrderValue ?? ''}
                  onChange={(e) => set('expectedOrderValue', Number(e.target.value) || undefined)}
                  className={inputCls}
                />
              </Field>
              <Field label="Expected date of closure" hint="Shown as a column on the Leads tab">
                <input type="date" value={draft.expectedClosure || ''} onChange={(e) => set('expectedClosure', e.target.value)} className={inputCls} />
              </Field>
            </div>
          </SectionCard>

          {/* ── §3.4 Status ── */}
          <SectionCard title="Status" owner="crm" subtitle={OUTREACH_STATUS_HINT[draft.status]}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Status" required>
                <select value={draft.status} onChange={(e) => set('status', e.target.value as OutreachStatus)} className={inputCls}>
                  {OUTREACH_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>
              {(draft.status === 'Follow up' || draft.status === 'PI Shared' || draft.status === 'Quote Share') && (
                <>
                  <Field
                    label="Next follow-up"
                    required={draft.status !== 'Quote Share'}
                    error={gateFor('followUpDate')}
                    hint={draft.status === 'Quote Share' ? 'Optional on Quote Share' : undefined}
                  >
                    <input
                      type="date"
                      value={draft.followUpDate || ''}
                      onChange={(e) => set('followUpDate', e.target.value)}
                      className={gateFor('followUpDate') ? errorInputCls : inputCls}
                    />
                  </Field>
                  <Field label="Time" hint="Optional">
                    <input type="time" value={draft.followUpTime || ''} onChange={(e) => set('followUpTime', e.target.value)} className={inputCls} />
                  </Field>
                </>
              )}
            </div>

            {(draft.status === 'PI Shared' || draft.status === 'Closed') && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">From Procurement</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">Deals</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Enq ID" hint="Matched exactly against the deal tickets on this number">
                    <div className="flex items-center gap-1.5">
                      <input value={draft.enqId || ''} onChange={(e) => set('enqId', e.target.value)} placeholder="ENQ-…" className={inputCls} />
                      <button
                        onClick={() => checkEnq()}
                        disabled={enqChecking || !draft.enqId?.trim()}
                        className="px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white whitespace-nowrap disabled:opacity-50"
                      >
                        {enqChecking ? '…' : 'Fetch'}
                      </button>
                    </div>
                  </Field>
                  <Field
                    label="Order value (₹)"
                    hint={draft.orderValueSource === 'deal'
                      ? 'Fetched from the matched deal ticket'
                      : draft.orderValueSource === 'manual'
                        ? 'Typed by hand — no ticket matched this Enq ID'
                        : undefined}
                  >
                    <input
                      type="number"
                      min={0}
                      value={draft.orderValue ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, orderValue: Number(e.target.value) || undefined, orderValueSource: 'manual' }))}
                      className={inputCls}
                    />
                  </Field>
                </div>

                {enq?.status === 'matched' && (
                  <div className="mt-2.5 rounded-md border border-[#0F766E]/25 bg-[#0F766E]/5 px-3 py-2 text-[11.5px] text-gray-700 leading-snug">
                    Matched ticket <strong>{draft.enqId}</strong> — {fmtINR(enq.orderValue || 0)}
                    {enq.dealStatus ? ` · ${enq.dealStatus}` : ''}
                    {enq.bmName ? ` · assigned to ${enq.bmName}` : ''}
                    {enq.branch ? ` · ${enq.branch}` : ''}
                    {enqDeal?.cartItems && <div className="text-gray-500 mt-1">{enqDeal.cartItems}</div>}
                  </div>
                )}
                {enq?.status === 'no-match' && (
                  <div className="mt-2.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800 leading-snug">
                    No deal ticket on this number carries that Enq ID exactly, so nothing was fetched —
                    type the value if you have it.
                    {enq.available?.length
                      ? <> Tickets on this number: <span className="font-mono">{enq.available.join(', ')}</span>.</>
                      : ' This number has no deal tickets at all.'}
                  </div>
                )}
                {enq?.status === 'unavailable' && (
                  <div className="mt-2.5 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11.5px] text-red-700 leading-snug">
                    The deal system did not answer. That is not evidence your Enq ID is wrong — try the
                    fetch again in a moment.
                  </div>
                )}
              </div>
            )}

            {draft.status === 'Lost' && (
              <Field label="Lost reason" required error={gateFor('lostReason')} className="mt-4 pt-4 border-t border-gray-100">
                <LostReasonSelect
                  value={draft.lostReason || ''}
                  options={OUTREACH_LOST_REASONS}
                  onChange={(v) => set('lostReason', v)}
                  className={gateFor('lostReason') ? errorInputCls : inputCls}
                />
              </Field>
            )}

            {showGates && gateErrors.length > 0 && <div className="mt-3"><GateErrors errors={gateErrors} /></div>}
            {prompts.length > 0 && (
              <ul className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 flex flex-col gap-1">
                {prompts.map((p) => (
                  <li key={p} className="text-[11px] text-amber-800 leading-snug">• {p}</li>
                ))}
              </ul>
            )}
          </SectionCard>

          {/* ── §7 Handoff ── */}
          <SectionCard
            title="Handoff"
            owner="crm"
            subtitle="Round-robin to a KAM once the order is placed"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="KAM">
                <div className="flex items-center gap-1.5">
                  <select value={draft.kam || ''} onChange={(e) => set('kam', e.target.value || undefined)} className={inputCls}>
                    <option value="">Unassigned</option>
                    {KAMS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <button
                    onClick={assignKam}
                    disabled={kamAssigning}
                    className="px-2.5 py-1.5 text-[11px] font-semibold rounded-md border border-gray-200 bg-white text-gray-600 whitespace-nowrap disabled:opacity-50 hover:border-[#0F766E] hover:text-[#0F766E]"
                  >
                    {kamAssigning ? '…' : 'Auto'}
                  </button>
                </div>
              </Field>
              <Field label="Spok" hint="Whoever is speaking to this lead — shown on the Leads tab">
                <input value={draft.spok || ''} onChange={(e) => set('spok', e.target.value)} placeholder={draft.bm} className={inputCls} />
              </Field>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Assisted at EC</span>
              <EcPicker
                ecName={draft.ecName}
                ecBmName={draft.ecBmName}
                onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
              />
            </div>
            {kamLoad && (
              <p className="text-[10px] text-gray-400 mt-2 leading-snug">
                Rotation picks the KAM holding the fewest closed leads across Inbound and Outreach —
                currently {Object.entries(kamLoad).map(([k, n]) => `${k} ${n}`).join(', ') || 'nobody has any'}.
              </p>
            )}
          </SectionCard>

          {/* ── Notes ── */}
          <SectionCard title="Notes" owner="crm" subtitle="Stored in the CRM only">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={2}
              placeholder="Add a note…"
              className={inputCls + ' resize-none'}
            />
            <button onClick={addNote} disabled={!noteText.trim()} className="mt-2 px-3 py-1.5 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-50">
              + Add note
            </button>
            <div className="mt-3 flex flex-col gap-2">
              {(draft.notes || []).length === 0
                ? <Empty>No notes yet.</Empty>
                : (draft.notes || []).slice().reverse().map((n, i) => (
                  <div key={i} className="text-[11.5px] border border-gray-100 rounded-md p-2">
                    <div className="text-gray-700 whitespace-pre-wrap">{n.text}</div>
                    <div className="text-gray-400 mt-1">{n.author} · {n.ts}</div>
                  </div>
                ))}
            </div>
            <p className="text-[10px] text-gray-400 mt-2">
              Notes are saved with the lead — use <strong>Save changes</strong> below.
            </p>
          </SectionCard>

          {/* ── Deal tickets on this number ── */}
          <SectionCard title="Deal tickets on this number" owner="deals" subtitle="Every cart Procurement holds for this contact">
            {deals === null ? <Spinner label="Loading deal tickets…" />
              : dealsFailed ? (
                <p className="text-[11.5px] text-red-600 leading-snug">
                  The deal system did not answer, so this list is unreadable — not empty. Do not read it
                  as &ldquo;this client has no carts&rdquo;.
                </p>
              ) : !draft.phone ? (
                <Empty>No contact number on this lead, so no tickets can be matched.</Empty>
              ) : deals.length === 0 ? (
                <Empty>No deal tickets on {draft.phone}.</Empty>
              ) : (
                <div className="flex flex-col gap-2">
                  {deals.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => { set('enqId', d.id); checkEnq(d.id); }}
                      className="text-left rounded-md border border-gray-200 px-3 py-2 hover:border-[#0F766E]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-mono font-semibold text-gray-800">{d.id}</span>
                        <span className="text-[12px] font-mono text-gray-700">{fmtINR(d.cartValue)}</span>
                      </div>
                      <div className="text-[10.5px] text-gray-400 mt-0.5">
                        {[d.status, d.branch, d.assignedTo, d.createdAt && fmtDay(d.createdAt)].filter(Boolean).join(' · ')}
                      </div>
                      {d.cartItems && <div className="text-[10.5px] text-gray-500 mt-0.5 truncate">{d.cartItems}</div>}
                    </button>
                  ))}
                </div>
              )}
          </SectionCard>
        </div>

        {/* ── Footer ── */}
        <div className="mt-auto sticky bottom-0 bg-white border-t border-gray-200 px-6 py-4">
          {save.error && (
            <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{save.error}</div>
          )}
          {save.warning && (
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{save.warning}</div>
          )}
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-gray-400">
              {met ? `${meetings.filter((m) => m.status === 'Completed').length} meeting(s) held` : 'No meeting held yet'}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={onClose} className="px-4 py-2 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">Close</button>
              <button
                onClick={handleSave}
                disabled={save.saving}
                className="px-4 py-2 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-50"
              >
                {save.saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
