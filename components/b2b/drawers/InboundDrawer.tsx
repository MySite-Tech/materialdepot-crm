'use client';

// ── Inbound lead drawer ──────────────────────────────────────────────────────
// Organised by the PRD's own sections, in the order a rep works them:
//
//   From Presales (§3.1) → Client (§3.2) → Requirement (§3.3)
//   → Call log (§3.2) → Status (§3.4) → Placed under (§3.5)
//
// Every block states which system owns it. Three systems hold pieces of one
// lead and a rep has no other way to tell why a field is read-only, or why a
// value they typed reappeared different after a sync.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchLeadNotes, createLeadNote, fetchLeadCallLogs, createInboundCallLog,
  updateInboundLeadKylas, fetchInboundLeadDetail, fetchCallLogSummary, fetchLeadDeals,
} from '@/lib/mockApi';
import { upsertInboundLead, lookupEnqId, fetchInboundKamLoad, type EnqLookup } from '@/lib/b2bLeads';
import {
  fmtINR, KAMS, type InboundLead, type LeadNote, type CallLogEntry, type LeadDeal,
} from '../models/mockData';
import {
  INBOUND_STATUSES, INBOUND_STATUS_HINT, INBOUND_LOCATIONS, INBOUND_LOST_REASONS,
  SEGMENTS, CLIENT_TYPES, LEAD_TYPES, PRIORITIES, SELECTIONS, MAX_CALL_ATTEMPTS,
  PLACED_UNDER_FIELDS,
  statusGateErrors, callGateErrors, enrichmentGaps, ENRICHMENT_FIELD_COUNT,
  nextAttemptNumber, retriesExhausted, hasConnected,
  selectionsKylasWillDrop, kylasClientTypeIsAmbiguous, nextKamRoundRobin, istToday,
  nameIsJustThePhone,
  type InboundStatus, type CallAttempt, type CallAttemptOutcome, type PlacedUnder,
} from '../models/inboundModel';
import {
  SectionCard, Field, ReadValue, Spinner, Empty, GateErrors, StatusBadge,
  PriorityChip, LeadTypeChip, FollowUpChip, ProvenanceChip,
  inputCls, errorInputCls, fmtLeadDateTime,
} from '../ui/inboundChips';

// PRD §3.2 logs an attempt as Connected or RNR (Ring No Response). Kylas's own
// outcome vocabulary is wider; these are the two exact equivalents, not a
// nearest match.
const KYLAS_OUTCOME: Record<CallAttemptOutcome, 'connected' | 'no_answer'> = {
  Connected: 'connected',
  RNR: 'no_answer',
};

interface SaveState {
  saving: boolean;
  /** Shown after a save that partially failed — never swallowed. */
  warning?: string;
  error?: string;
}

export default function InboundDrawer({
  lead, onClose, onSaved,
}: {
  lead: InboundLead;
  onClose: () => void;
  /** Called with the persisted lead so the board can update in place. */
  onSaved: (updated: InboundLead) => void;
}) {
  const [draft, setDraft] = useState<InboundLead>(lead);
  const [save, setSave] = useState<SaveState>({ saving: false });
  const [showGates, setShowGates] = useState(false);

  const set = <K extends keyof InboundLead>(k: K, v: InboundLead[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  // ── Live Kylas read (§3.1 + the shared §3.3 fields) ──
  const [detailLoading, setDetailLoading] = useState(true);
  const [detailFailed, setDetailFailed] = useState(false);
  const [phoneId, setPhoneId] = useState<number | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    setDetailLoading(true);
    setDetailFailed(false);
    fetchInboundLeadDetail(lead.id)
      .then((d) => {
        if (!alive) return;
        if (!d.loaded) { setDetailFailed(true); return; }
        setPhoneId(d.phoneId);
        setDraft((prev) => ({
          ...prev,
          // Presales owns these; the live read wins over the stored snapshot.
          leadSummary: d.leadSummary ?? prev.leadSummary,
          urgency: d.urgency ?? prev.urgency,
          pincode: d.pincode ?? prev.pincode,
          presalesOwner: d.presalesOwner ?? prev.presalesOwner,
          presalesClientType: d.presalesClientType ?? prev.presalesClientType,
          presalesMissedCalls: d.presalesMissedCalls ?? prev.presalesMissedCalls,
          qualificationTag: d.qualificationTag ?? prev.qualificationTag,
          leadCreatedAt: d.leadCreatedAt ?? prev.leadCreatedAt,
          phone: d.phone || prev.phone,
          // Kylas owns the name (§3.1). Refreshed here because a promoted lead
          // is often absent from the board's Kylas page, so `mergeKylasIntoRow`
          // never reaches it — and the old placeholder is what was stored.
          contactName: d.contactName ?? prev.contactName,
          company: d.kylasName || prev.company,
          // Shared: keep an unsaved local edit, otherwise take Kylas's copy.
          requirement: prev.requirement || d.requirement,
          selections: prev.selections?.length ? prev.selections : d.selections,
        }));
      })
      .finally(() => { if (alive) setDetailLoading(false); });
    return () => { alive = false; };
  }, [lead.id]);

  // ── Notes, call logs, deals ──
  const [kylasNotes, setKylasNotes] = useState<LeadNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(true);
  const [callLogs, setCallLogs] = useState<CallLogEntry[]>([]);
  const [callsLoading, setCallsLoading] = useState(true);
  const [deals, setDeals] = useState<LeadDeal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setNotesLoading(true);
    fetchLeadNotes(lead.id, lead.ownerId)
      .then((n) => { if (alive) setKylasNotes(n); })
      .finally(() => { if (alive) setNotesLoading(false); });
    return () => { alive = false; };
  }, [lead.id, lead.ownerId]);

  const reloadCalls = () => {
    setCallsLoading(true);
    fetchLeadCallLogs(lead.id).then(setCallLogs).finally(() => setCallsLoading(false));
  };

  useEffect(() => {
    let alive = true;
    setCallsLoading(true);
    fetchLeadCallLogs(lead.id)
      .then((c) => { if (alive) setCallLogs(c); })
      .finally(() => { if (alive) setCallsLoading(false); });
    return () => { alive = false; };
  }, [lead.id]);

  useEffect(() => {
    let alive = true;
    setDealsLoading(true);
    fetchLeadDeals(lead.phone)
      .then((d) => { if (alive) setDeals(d); })
      .finally(() => { if (alive) setDealsLoading(false); });
    return () => { alive = false; };
  }, [lead.phone]);

  // ── Gates ──
  const gateErrors = useMemo(() => statusGateErrors({
    status: draft.stage,
    followUpDate: draft.followUpDate,
    enqId: draft.enqId,
    lostReason: draft.lostReason,
  }), [draft.stage, draft.followUpDate, draft.enqId, draft.lostReason]);

  const gaps = useMemo(() => enrichmentGaps({
    companyName: draft.companyName,
    gstNumber: draft.gstNumber,
    segment: draft.segment,
    clientType: draft.clientType,
    leadType: draft.leadType,
    priority: draft.priority,
    selections: draft.selections,
    expectedOrderValue: draft.expectedOrderValue,
  }), [draft.companyName, draft.gstNumber, draft.segment, draft.clientType,
    draft.leadType, draft.priority, draft.selections, draft.expectedOrderValue]);

  const gateFor = (field: 'followUpDate' | 'enqId' | 'lostReason'): string | undefined => {
    if (!showGates) return undefined;
    const map: Record<typeof field, string> = {
      followUpDate: 'follow-up date',
      enqId: 'Enq ID',
      lostReason: 'lost reason',
    };
    return gateErrors.find((e) => e.toLowerCase().includes(map[field].toLowerCase()));
  };

  // ── Enq ID → order value (PRD §3.4) ──
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
        // PRD §3.5: "BM Name — fetched from Procurement".
        placedUnder: { ...(d.placedUnder || {}), bmName: res.bmName || d.placedUnder?.bmName },
      }));
    } else if (res.status === 'no-match') {
      // Hand the field back to the rep rather than leaving a stale fetched
      // figure attached to an Enq ID that no longer resolves.
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

  // ── Call attempts (PRD §3.2 + the retry loop) ──
  const attempts = draft.callAttempts || [];
  const attemptNo = nextAttemptNumber(attempts);
  const exhausted = retriesExhausted(attempts);
  const connected = hasConnected(attempts);

  const [logOpen, setLogOpen] = useState(false);
  const [logOutcome, setLogOutcome] = useState<CallAttemptOutcome>('Connected');
  const [logNote, setLogNote] = useState('');
  const [logDuration, setLogDuration] = useState('');
  const [logFollowUp, setLogFollowUp] = useState(draft.followUpDate || '');
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);

  const logAttempt = async () => {
    if (logging) return;
    const gate = callGateErrors(logFollowUp);
    if (gate.length) { setLogError(gate[0]); return; }
    setLogError(null);
    setLogging(true);

    const attempt: CallAttempt = {
      n: attemptNo,
      outcome: logOutcome,
      at: new Date().toISOString(),
      by: draft.owner,
      note: logNote.trim() || undefined,
    };
    const nextAttempts = [...attempts, attempt];
    // A logged call always carries the next follow-up date the PRD requires,
    // and a lead being actively called is by definition on follow-up — unless
    // it has already moved past that (PI Shared / Closed / Lost).
    const nextStatus: InboundStatus =
      draft.stage === 'New' ? 'Follow up' : draft.stage;
    const updated: InboundLead = {
      ...draft,
      callAttempts: nextAttempts,
      followUpDate: logFollowUp,
      stage: nextStatus,
      statusChangedAt: nextStatus !== draft.stage ? new Date().toISOString() : draft.statusChangedAt,
    };

    // Kylas holds the call-log record; b2b_lead holds the attempt counter the
    // PRD reports on. The Kylas half needs a phoneId we may not have, so a
    // failure there must not lose the attempt — it is reported instead.
    let kylasNote = '';
    if (phoneId) {
      const ok = await createInboundCallLog({
        leadId: draft.id,
        leadName: draft.companyName || draft.contactName || draft.company,
        phoneId,
        outcome: KYLAS_OUTCOME[logOutcome],
        callSummary: logNote.trim(),
        durationMinutes: logOutcome === 'Connected' && logDuration ? Number(logDuration) : undefined,
      });
      if (!ok) kylasNote = 'Recorded here, but Kylas rejected the call log.';
    } else {
      kylasNote = 'Recorded here only — no Kylas phone id for this lead.';
    }

    const err = await upsertInboundLead(updated);
    setLogging(false);
    if (err) { setLogError(`Could not save the attempt: ${err}`); return; }

    setDraft(updated);
    onSaved(updated);
    setLogOpen(false);
    setLogNote('');
    setLogDuration('');
    if (kylasNote) setSave({ saving: false, warning: kylasNote });
    if (phoneId) reloadCalls();
  };

  // ── KAM handoff (PRD §3.5) ──
  const [kamLoad, setKamLoad] = useState<Record<string, number> | null>(null);
  const [kamAssigning, setKamAssigning] = useState(false);

  const assignKam = async () => {
    if (kamAssigning) return;
    setKamAssigning(true);
    const load = kamLoad ?? await fetchInboundKamLoad();
    setKamLoad(load);
    const pick = nextKamRoundRobin(KAMS, load);
    setKamAssigning(false);
    if (pick) set('kam', pick);
  };

  const setPlaced = (k: keyof PlacedUnder, v: string) =>
    setDraft((d) => ({ ...d, placedUnder: { ...(d.placedUnder || {}), [k]: v } }));

  // ── Notes ──
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const addNote = async () => {
    const text = noteText.trim();
    if (!text || savingNote) return;
    setSavingNote(true);
    const ok = await createLeadNote(lead.id, text);
    if (ok) {
      setNoteText('');
      setKylasNotes(await fetchLeadNotes(lead.id, lead.ownerId));
    } else {
      setSave({ saving: false, warning: 'Kylas rejected the note. Nothing was saved.' });
    }
    setSavingNote(false);
  };

  // ── Save ─────────────────────────────────────────────────────────────────
  // Two systems, reported separately. The old drawer discarded the Kylas result
  // and rendered every save as a success, so a rejected PATCH left Kylas and
  // the CRM disagreeing with nothing on screen to say so.
  const handleSave = async () => {
    if (save.saving) return;
    if (gateErrors.length) { setShowGates(true); return; }
    setSave({ saving: true });

    const statusChanged = draft.stage !== lead.stage;
    const toSave: InboundLead = {
      ...draft,
      company: draft.companyName?.trim() || draft.company,
      value: Number(draft.orderValue) || 0,
      statusChangedAt: statusChanged ? new Date().toISOString() : draft.statusChangedAt,
      // Kept in step for the shared boards, which read the old aliases.
      timeline: draft.urgency,
      requirementBrief: draft.leadSummary,
    };

    const [kylasRes, dbErr] = await Promise.all([
      updateInboundLeadKylas(lead.id, {
        requirement: toSave.requirement,
        selections: toSave.selections,
      }),
      upsertInboundLead(toSave),
    ]);

    if (dbErr) {
      setSave({ saving: false, error: `Save failed: ${dbErr}. Nothing was stored — try again.` });
      return;
    }

    const notes: string[] = [];
    if (!kylasRes.ok) {
      notes.push(`Saved here, but the Kylas push failed (${kylasRes.error || 'unknown error'}). Requirement and Selection may differ in Kylas until the next save.`);
    }
    if (kylasRes.dropped?.length) {
      notes.push(`${kylasRes.dropped.join(', ')} — Kylas has no option for this, so it is stored in the CRM only.`);
    }
    setDraft(toSave);
    onSaved(toSave);
    setSave({ saving: false, warning: notes.length ? notes.join(' ') : undefined });
    if (!notes.length) onClose();
  };

  const [summaryModal, setSummaryModal] = useState<{ loading: boolean; text?: string; error?: string } | null>(null);
  const openCallSummary = async (callLogId: string) => {
    setSummaryModal({ loading: true });
    try {
      const text = await fetchCallLogSummary(callLogId);
      setSummaryModal({ loading: false, text: text || 'No summary available for this call.' });
    } catch {
      setSummaryModal({ loading: false, error: 'Failed to load call summary. Please try again.' });
    }
  };

  const droppedSelections = selectionsKylasWillDrop(draft.selections);
  const presalesTypeUnmapped = kylasClientTypeIsAmbiguous(draft.presalesClientType);
  const today = istToday();

  return (
    <div className="fixed inset-0 z-[1200] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[780px] bg-[#F7F7F8] h-full overflow-y-auto shadow-2xl flex flex-col">

        {/* ── Header ── */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-[17px] font-bold text-gray-900 truncate">
                {draft.companyName?.trim()
                  || (nameIsJustThePhone(draft)
                    ? <span className="text-gray-400 font-semibold italic">Not named yet</span>
                    : draft.company)}
              </h2>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span className="text-[12px] font-mono text-gray-500">{draft.phone || '—'}</span>
                <span className="text-gray-300">·</span>
                <StatusBadge s={draft.stage} />
                <PriorityChip p={draft.priority} />
                <LeadTypeChip t={draft.leadType} />
                {(draft.stage === 'Follow up' || draft.stage === 'PI Shared') && (
                  <FollowUpChip date={draft.followUpDate} today={today} />
                )}
              </div>
              {nameIsJustThePhone(draft) && (
                <p className="text-[11px] text-amber-700 mt-1.5">
                  Kylas has no company name for this lead — it ships the phone number in the name
                  field. Fill <strong>Client company name</strong> below.
                </p>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none shrink-0">×</button>
          </div>
          {gaps.length > 0 && (
            <p className="text-[11px] text-gray-500 mt-2.5">
              <span className="font-semibold text-amber-700">{gaps.length} of {ENRICHMENT_FIELD_COUNT} enrichment fields empty</span>
              {' — '}{gaps.map((g) => g.label).join(', ')}. These do not block a save.
            </p>
          )}
        </div>

        <div className="p-5 flex flex-col gap-4">

          {/* ── §3.1 From Presales ── */}
          <SectionCard
            title="From Presales"
            owner="kylas"
            subtitle="Read-only · overwritten on every sync"
            right={detailLoading
              ? <span className="w-3 h-3 rounded-full border-2 border-gray-200 border-t-[#0F766E] animate-spin" />
              : detailFailed
                ? <span className="text-[10px] font-semibold text-red-500">Kylas unreachable</span>
                : null}
          >
            {detailFailed && (
              <p className="text-[11px] text-red-600 mb-3 leading-snug">
                Kylas did not answer, so this block shows the last stored snapshot rather than live
                values. It is not evidence Presales left these blank.
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <Field label="Contact number"><ReadValue v={draft.phone} /></Field>
              <Field label="Contact name"><ReadValue v={draft.contactName} /></Field>
              <Field label="Assigned to"><ReadValue v={draft.owner} /></Field>
              <Field label="Lead date & time" className="col-span-2 sm:col-span-1">
                <ReadValue v={fmtLeadDateTime(draft.leadCreatedAt)} />
              </Field>
              <Field label="Qualified as"><ReadValue v={draft.qualificationTag} /></Field>
              <Field label="Qualified by"><ReadValue v={draft.presalesOwner} /></Field>
              <Field label="Lead summary" className="col-span-2">
                <ReadValue v={draft.leadSummary} />
              </Field>
              <Field label="Urgency"><ReadValue v={draft.urgency} /></Field>
              <Field label="Pincode" hint={draft.pincode ? 'Sets the default Location' : undefined}>
                <ReadValue v={draft.pincode} />
              </Field>
              <Field
                label="Client type (Presales)"
                hint={presalesTypeUnmapped ? 'No exact match in the PRD list — pick one yourself below' : undefined}
              >
                <ReadValue v={draft.presalesClientType} />
              </Field>
              <Field label="Missed calls (Presales)">
                <ReadValue v={draft.presalesMissedCalls} />
              </Field>
              <Field label="Source"><ReadValue v={draft.source} /></Field>
            </div>
          </SectionCard>

          {/* ── §3.2 Client ── */}
          <SectionCard title="Client" owner="crm" subtitle="§3.2 — your team owns these">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Client company name"
                className="sm:col-span-2"
                hint="The real company. Kylas ships the phone number in the name field."
              >
                <input
                  value={draft.companyName || ''}
                  onChange={(e) => set('companyName', e.target.value)}
                  placeholder="e.g. Sundaram Interiors"
                  className={inputCls}
                />
              </Field>
              <Field label="GST number">
                <input
                  value={draft.gstNumber || ''}
                  onChange={(e) => set('gstNumber', e.target.value.toUpperCase())}
                  placeholder="29ABCDE1234F1Z5"
                  className={inputCls}
                />
              </Field>
              <Field label="Segment">
                <select value={draft.segment || ''} onChange={(e) => set('segment', (e.target.value || undefined) as InboundLead['segment'])} className={inputCls}>
                  <option value="">Select…</option>
                  {SEGMENTS.map((s) => <option key={s} value={s}>Segment {s}</option>)}
                </select>
              </Field>
              <Field
                label="Client type"
                hint={presalesTypeUnmapped
                  ? `Presales recorded "${draft.presalesClientType}", which maps to no single value here.`
                  : undefined}
              >
                <select value={draft.clientType || ''} onChange={(e) => set('clientType', (e.target.value || undefined) as InboundLead['clientType'])} className={inputCls}>
                  <option value="">Select…</option>
                  {CLIENT_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Lead type">
                <select value={draft.leadType || ''} onChange={(e) => set('leadType', (e.target.value || undefined) as InboundLead['leadType'])} className={inputCls}>
                  <option value="">Select…</option>
                  {LEAD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Priority">
                <select value={draft.priority || ''} onChange={(e) => set('priority', (e.target.value || undefined) as InboundLead['priority'])} className={inputCls}>
                  <option value="">Select…</option>
                  {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field
                label="Location"
                owner="derived"
                hint={draft.pincode ? `Defaulted from pincode ${draft.pincode}` : 'No pincode from Presales — set it yourself'}
              >
                <select value={draft.location || ''} onChange={(e) => set('location', (e.target.value || undefined) as InboundLead['location'])} className={inputCls}>
                  <option value="">Select…</option>
                  {INBOUND_LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </Field>
            </div>
          </SectionCard>

          {/* ── §3.3 Requirement ── */}
          <SectionCard title="Requirement" owner="kylas-write" subtitle="§3.3 — Requirement summary and Selection sync to Kylas">
            <Field label="Selection">
              <div className="flex flex-wrap gap-1.5">
                {SELECTIONS.map((c) => {
                  const active = (draft.selections || []).includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() => set('selections', active
                        ? (draft.selections || []).filter((x) => x !== c)
                        : [...(draft.selections || []), c])}
                      className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                        active
                          ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                      }`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              {droppedSelections.length > 0 && (
                <p className="text-[10px] text-amber-700 mt-1.5 leading-snug">
                  {droppedSelections.join(', ')} has no option in the Kylas picklist, so it is stored
                  in the CRM only and will not appear in Kylas.
                </p>
              )}
            </Field>
            <Field label="Requirement summary" className="mt-3">
              <textarea
                value={draft.requirement || ''}
                onChange={(e) => set('requirement', e.target.value)}
                rows={3}
                placeholder="What the client actually needs — quantities, sizes, sites."
                className={inputCls + ' resize-none'}
              />
            </Field>
            <Field
              label="Expected order value"
              className="mt-3 sm:max-w-[260px]"
              hint="Your estimate at qualification. Not the PI or the order figure — those come from the deal ticket."
            >
              <input
                type="number"
                min={0}
                value={draft.expectedOrderValue || ''}
                onChange={(e) => set('expectedOrderValue', Number(e.target.value) || 0)}
                placeholder="₹"
                className={inputCls}
              />
            </Field>
          </SectionCard>

          {/* ── §3.2 Call log ── */}
          <SectionCard
            title="Call log"
            owner="crm"
            subtitle={`Attempt ${Math.min(attemptNo, MAX_CALL_ATTEMPTS)} of ${MAX_CALL_ATTEMPTS}`}
            right={!logOpen && (
              <button
                onClick={() => { setLogOpen(true); setLogFollowUp(draft.followUpDate || ''); }}
                className="border border-gray-200 bg-white text-gray-600 px-2.5 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap hover:border-[#0F766E] hover:text-[#0F766E]"
              >
                ＋ Log attempt
              </button>
            )}
          >
            {/* Attempt tracker — the PRD's retry loop, 1 to 4 */}
            <div className="flex items-center gap-2 mb-3">
              {Array.from({ length: MAX_CALL_ATTEMPTS }, (_, i) => {
                const a = attempts[i];
                const isNext = !a && i + 1 === attemptNo && !connected;
                const bg = a?.outcome === 'Connected' ? 'bg-[#0F766E] text-white border-[#0F766E]'
                  : a?.outcome === 'RNR' ? 'bg-red-50 text-red-600 border-red-200'
                    : isNext ? 'bg-white text-gray-500 border-dashed border-gray-400'
                      : 'bg-gray-50 text-gray-300 border-gray-200';
                return (
                  <div
                    key={i}
                    title={a ? `${a.outcome} · ${fmtLeadDateTime(a.at)}${a.note ? ` · ${a.note}` : ''}` : `Attempt ${i + 1} not made`}
                    className={`flex-1 rounded-md border px-2 py-1.5 text-center ${bg}`}
                  >
                    <div className="text-[9px] font-bold uppercase tracking-wider opacity-70">Call {i + 1}</div>
                    <div className="text-[11px] font-semibold mt-0.5">
                      {a ? (a.outcome === 'Connected' ? 'Connected' : 'RNR') : isNext ? 'Next' : '—'}
                    </div>
                  </div>
                );
              })}
            </div>

            {draft.presalesMissedCalls ? (
              <p className="text-[10px] text-gray-400 mb-3 leading-snug">
                Presales already recorded {draft.presalesMissedCalls} missed{' '}
                {draft.presalesMissedCalls === 1 ? 'call' : 'calls'} in Kylas before handover. The
                four attempts above are your team&apos;s own, counted separately.
              </p>
            ) : null}

            {/* PRD: 4th attempt RNR → mark Lost (unreachable) or park for long-term follow-up */}
            {exhausted && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 mb-3">
                <p className="text-[11px] text-amber-800 leading-snug font-semibold">
                  Four attempts, none connected.
                </p>
                <p className="text-[11px] text-amber-700 leading-snug mt-0.5">
                  The PRD calls for marking this Lost as unreachable, or parking it on a long-term
                  follow-up date.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => setDraft((d) => ({ ...d, stage: 'Lost', lostReason: 'Unreachable (4 attempts)' }))}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    Mark Lost — unreachable
                  </button>
                  <button
                    onClick={() => setLogOpen(true)}
                    className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-white border border-gray-200 text-gray-600 hover:border-[#0F766E] hover:text-[#0F766E]"
                  >
                    Park on a later date
                  </button>
                </div>
              </div>
            )}

            {/* Log-an-attempt form */}
            {logOpen && (
              <div className="rounded-md border border-gray-200 bg-gray-50/60 p-3 mb-3 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-gray-700">
                    Attempt {attemptNo}{attemptNo > MAX_CALL_ATTEMPTS ? ' (beyond the PRD’s four)' : ''}
                  </span>
                  <button onClick={() => { setLogOpen(false); setLogError(null); }} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <Field label="Outcome">
                    <select value={logOutcome} onChange={(e) => setLogOutcome(e.target.value as CallAttemptOutcome)} className={inputCls}>
                      <option value="Connected">Connected</option>
                      <option value="RNR">RNR — ring no response</option>
                    </select>
                  </Field>
                  {logOutcome === 'Connected' && (
                    <Field label="Duration (mins)">
                      <input type="number" min={0} value={logDuration} onChange={(e) => setLogDuration(e.target.value)} className={inputCls} />
                    </Field>
                  )}
                  <Field label="Next follow-up" required>
                    <input
                      type="date"
                      value={logFollowUp}
                      onChange={(e) => { setLogFollowUp(e.target.value); setLogError(null); }}
                      className={logError && !logFollowUp ? errorInputCls : inputCls}
                    />
                  </Field>
                </div>
                <Field label="What was discussed">
                  <textarea value={logNote} onChange={(e) => setLogNote(e.target.value)} rows={2} className={inputCls + ' resize-none'} />
                </Field>
                <p className="text-[10px] text-gray-400 leading-snug">
                  Saves the attempt here and the call in Kylas. Every logged call needs the next
                  follow-up date — that date is what puts the lead on tomorrow&apos;s list.
                </p>
                {logError && <GateErrors errors={[logError]} />}
                <div className="flex items-center gap-2">
                  <button
                    onClick={logAttempt}
                    disabled={logging}
                    className="bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold disabled:opacity-50"
                  >
                    {logging ? 'Saving…' : 'Save attempt'}
                  </button>
                  {!phoneId && !detailLoading && (
                    <span className="text-[10px] text-amber-700">
                      No Kylas phone id — the attempt saves here but not as a Kylas call log.
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Attempt history */}
            {attempts.length > 0 && (
              <div className="flex flex-col divide-y divide-gray-100 mb-3">
                {attempts.slice().reverse().map((a, i) => (
                  <div key={`${a.n}-${i}`} className="flex items-start gap-3 py-2">
                    <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      a.outcome === 'Connected' ? 'bg-[#0F766E] text-white' : 'bg-red-100 text-red-600'
                    }`}>{a.n}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] font-semibold text-gray-800">{a.outcome}</div>
                      <div className="text-[10px] text-gray-400">{fmtLeadDateTime(a.at)}{a.by ? ` · ${a.by}` : ''}</div>
                      {a.note && <div className="text-[11px] text-gray-600 mt-0.5">{a.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Kylas's own call records */}
            <div className="border-t border-gray-100 pt-2.5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Kylas call records</span>
                <ProvenanceChip owner="kylas" />
                {!callsLoading && <span className="text-[10px] text-gray-400">{callLogs.length}</span>}
              </div>
              {callsLoading ? <Spinner label="Loading call records…" />
                : callLogs.length === 0 ? <Empty>No calls recorded in Kylas.</Empty>
                  : (
                    <div className="flex flex-col divide-y divide-gray-100 max-h-[220px] overflow-y-auto">
                      {callLogs.map((c) => {
                        const ok = /connect|complete|answer/i.test(c.status);
                        return (
                          <div key={c.id} className="flex items-center gap-2.5 py-2">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] shrink-0 ${ok ? 'bg-[#0F766E] text-white' : 'bg-gray-100 text-gray-400'}`}>
                              {/inbound/i.test(c.direction) ? '↓' : '↑'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-[12px] font-semibold text-gray-800">
                                {c.status}
                                {c.durationSec ? <span className="text-gray-400 font-normal"> · {Math.floor(c.durationSec / 60)}m {c.durationSec % 60}s</span> : null}
                              </div>
                              <div className="text-[10px] text-gray-400 truncate">{c.direction}{c.ts ? ` · ${c.ts}` : ''}{c.by ? ` · ${c.by}` : ''}</div>
                            </div>
                            <button
                              onClick={() => openCallSummary(c.id)}
                              className="shrink-0 border border-gray-200 bg-white text-gray-500 px-2 py-0.5 rounded text-[10px] font-semibold hover:border-[#0F766E] hover:text-[#0F766E]"
                            >
                              Summary
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
            </div>
          </SectionCard>

          {/* ── §3.4 Status ── */}
          <SectionCard title="Status" owner="crm" subtitle="§3.4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Status" hint={INBOUND_STATUS_HINT[draft.stage]}>
                <select
                  value={draft.stage}
                  onChange={(e) => { set('stage', e.target.value as InboundStatus); setShowGates(false); }}
                  className={inputCls}
                >
                  {INBOUND_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </Field>

              {(draft.stage === 'Follow up' || draft.stage === 'PI Shared') && (
                <>
                  <Field label="Next follow-up date" required error={gateFor('followUpDate')}>
                    <input
                      type="date"
                      value={draft.followUpDate || ''}
                      onChange={(e) => set('followUpDate', e.target.value)}
                      className={gateFor('followUpDate') ? errorInputCls : inputCls}
                    />
                  </Field>
                  <Field label="Follow-up time" hint="Optional — orders the day's call list">
                    <input type="time" value={draft.followUpTime || ''} onChange={(e) => set('followUpTime', e.target.value)} className={inputCls} />
                  </Field>
                </>
              )}

              {(draft.stage === 'PI Shared' || draft.stage === 'Closed') && (
                <>
                  <Field
                    label="Enq ID"
                    required={draft.stage === 'PI Shared'}
                    error={gateFor('enqId')}
                    hint="The cart / ENQ number on the deal ticket"
                  >
                    <div className="flex items-center gap-1.5">
                      <input
                        value={draft.enqId || ''}
                        onChange={(e) => set('enqId', e.target.value)}
                        onBlur={() => checkEnq()}
                        placeholder="ENQ-…"
                        className={(gateFor('enqId') ? errorInputCls : inputCls) + ' flex-1'}
                      />
                      <button
                        onClick={() => checkEnq()}
                        disabled={enqChecking || !(draft.enqId || '').trim()}
                        className="shrink-0 border border-gray-200 bg-white text-gray-600 px-2.5 py-1.5 rounded-md text-[11px] font-semibold disabled:opacity-40 hover:border-[#0F766E] hover:text-[#0F766E]"
                      >
                        {enqChecking ? '…' : 'Fetch'}
                      </button>
                    </div>
                  </Field>

                  <Field
                    label="Order value"
                    owner={draft.orderValueSource === 'deal' ? 'deals' : 'crm'}
                    hint={
                      enq?.status === 'matched'
                        ? `From deal ticket ${draft.enqId}${enq.dealStatus ? ` · ${enq.dealStatus}` : ''}`
                        : enq?.status === 'unavailable'
                          ? 'Could not reach the deal system — this is not a wrong Enq ID.'
                          : enq?.status === 'no-match'
                            ? 'No deal ticket on this phone matches that Enq ID — enter the value yourself.'
                            : 'Press Fetch to pull it from the matching deal ticket.'
                    }
                  >
                    <input
                      type="number"
                      min={0}
                      value={draft.orderValue || ''}
                      onChange={(e) => setDraft((d) => ({ ...d, orderValue: Number(e.target.value) || 0, orderValueSource: 'manual' }))}
                      disabled={draft.orderValueSource === 'deal' && enq?.status === 'matched'}
                      className={inputCls}
                    />
                  </Field>

                  {enq?.status === 'no-match' && !!enq.available?.length && (
                    <div className="sm:col-span-2">
                      <p className="text-[10px] text-gray-500 mb-1">Enq IDs that do exist on {draft.phone}:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {enq.available.slice(0, 8).map((id) => (
                          <button
                            key={id}
                            onClick={() => { set('enqId', id); checkEnq(id); }}
                            className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-gray-100 text-gray-600 hover:bg-[#0F766E] hover:text-white"
                          >
                            {id}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {draft.orderValueSource === 'deal' && enq?.status === 'matched' && (
                    <p className="sm:col-span-2 text-[10px] text-gray-400 -mt-1">
                      Fetched from the deal ticket, so it cannot be typed over.{' '}
                      <button onClick={() => set('orderValueSource', 'manual')} className="underline hover:text-gray-600">
                        Override manually
                      </button>
                    </p>
                  )}
                </>
              )}

              {draft.stage === 'Lost' && (
                <Field label="Lost reason" required error={gateFor('lostReason')} className="sm:col-span-2">
                  <select
                    value={draft.lostReason || ''}
                    onChange={(e) => set('lostReason', e.target.value)}
                    className={gateFor('lostReason') ? errorInputCls : inputCls}
                  >
                    <option value="">Select a reason…</option>
                    {INBOUND_LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    {/* A reason recorded before this list existed must survive an edit. */}
                    {draft.lostReason && !(INBOUND_LOST_REASONS as readonly string[]).includes(draft.lostReason) && (
                      <option value={draft.lostReason}>{draft.lostReason} (previously recorded)</option>
                    )}
                  </select>
                </Field>
              )}
            </div>
          </SectionCard>

          {/* ── §3.5 Placed under ── */}
          {draft.stage === 'Closed' && (
            <SectionCard title="Placed under" owner="crm" subtitle="§3.5 — captured on order won">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {PLACED_UNDER_FIELDS.map((f) => (
                  <Field key={f.key} label={f.label} owner={f.owner} hint={f.hint}>
                    <input
                      value={draft.placedUnder?.[f.key] || ''}
                      onChange={(e) => setPlaced(f.key, e.target.value)}
                      className={inputCls}
                      placeholder={f.owner === 'deals' ? 'From the deal ticket' : ''}
                    />
                  </Field>
                ))}
              </div>
              <div className="mt-3 rounded-md border border-gray-200 bg-gray-50/60 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <div className="text-[11px] font-bold text-gray-700">KAM handoff</div>
                    <div className="text-[10px] text-gray-500 mt-0.5">
                      {draft.kam
                        ? <>Assigned to <strong>{draft.kam}</strong>.</>
                        : 'Round-robin over the KAM roster, balanced by how many closed inbound leads each already holds.'}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={draft.kam || ''}
                      onChange={(e) => set('kam', e.target.value || undefined)}
                      className={inputCls + ' w-auto min-w-[150px]'}
                    >
                      <option value="">Unassigned</option>
                      {KAMS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                    <button
                      onClick={assignKam}
                      disabled={kamAssigning}
                      className="shrink-0 bg-[#1A1A1A] text-white px-2.5 py-1.5 rounded-md text-[11px] font-semibold disabled:opacity-50 whitespace-nowrap"
                    >
                      {kamAssigning ? '…' : 'Auto-assign'}
                    </button>
                  </div>
                </div>
              </div>
            </SectionCard>
          )}

          {/* ── Deals ── */}
          <SectionCard
            title="Deal tickets"
            owner="deals"
            subtitle={`Every deal on ${draft.phone || 'this number'}`}
            right={!dealsLoading && <span className="text-[10px] font-semibold text-gray-400">{deals.length}</span>}
          >
            {dealsLoading ? <Spinner label="Loading deals…" />
              : deals.length === 0 ? <Empty>No deal tickets on this number yet — a PI or order raised in the main CRM will appear here.</Empty>
                : (
                  <div className="flex flex-col divide-y divide-gray-100">
                    {deals.map((d) => (
                      <div key={d.ticketId ?? d.id} className="py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[12px] font-mono font-semibold text-gray-800 truncate">{d.id}</span>
                            {draft.enqId && d.id === draft.enqId && (
                              <span className="text-[9px] font-bold uppercase tracking-wider text-[#0F766E] bg-[#0F766E]/10 px-1.5 py-0.5 rounded">matched</span>
                            )}
                          </div>
                          <span className="text-[12px] font-mono text-gray-700 whitespace-nowrap">
                            {d.cartValue ? fmtINR(d.cartValue) : '—'}
                          </span>
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">
                          {[d.status, d.branch, d.assignedTo, d.createdAt ? `Created ${d.createdAt}` : '']
                            .filter(Boolean).join(' · ')}
                        </div>
                        {d.lostReason && <div className="text-[10px] text-red-500 mt-0.5">Lost: {d.lostReason}</div>}
                      </div>
                    ))}
                  </div>
                )}
          </SectionCard>

          {/* ── Notes ── */}
          <SectionCard title="Notes" owner="kylas-write" subtitle="Written to Kylas, visible to Presales">
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="What was discussed, what the client asked for, what you promised…"
              rows={2}
              className={inputCls + ' resize-none'}
            />
            <button
              onClick={addNote}
              disabled={savingNote || !noteText.trim()}
              className="mt-2 bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold disabled:opacity-50"
            >
              {savingNote ? 'Saving…' : '+ Add note'}
            </button>
            <div className="mt-3 flex flex-col gap-2 max-h-[240px] overflow-y-auto pr-1">
              {notesLoading ? <Spinner label="Loading notes…" />
                : kylasNotes.length === 0 ? <Empty>No notes yet.</Empty>
                  : kylasNotes.map((n, i) => (
                    <div key={i} className="text-[11px] border border-gray-100 rounded-md p-2">
                      <div className="text-gray-700 whitespace-pre-wrap">{n.text}</div>
                      <div className="text-gray-400 mt-1">{n.author}{n.ts ? ` · ${n.ts}` : ''}</div>
                    </div>
                  ))}
            </div>
          </SectionCard>
        </div>

        {/* ── Footer ── */}
        <div className="mt-auto sticky bottom-0 bg-white border-t border-gray-200 px-6 py-3.5 flex flex-col gap-2">
          {showGates && gateErrors.length > 0 && <GateErrors errors={gateErrors} />}
          {save.error && <GateErrors errors={[save.error]} />}
          {save.warning && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800 leading-snug">
              {save.warning}
            </div>
          )}
          <div className="flex items-center justify-between gap-3">
            <button onClick={onClose} className="px-4 py-2 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">
              Close
            </button>
            <div className="flex items-center gap-2">
              {gaps.length > 0 && (
                <span className="text-[10px] text-amber-700 hidden sm:inline">{gaps.length} field{gaps.length === 1 ? '' : 's'} still empty</span>
              )}
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

      {summaryModal && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSummaryModal(null)} />
          <div className="relative bg-white rounded-lg shadow-xl w-full max-w-[480px] mx-4 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[13px] font-bold text-gray-800">Call summary</span>
              <button onClick={() => setSummaryModal(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            {summaryModal.loading ? <Spinner label="Loading summary…" />
              : summaryModal.error ? <p className="text-[12px] text-red-500">{summaryModal.error}</p>
                : <p className="text-[12px] text-gray-700 whitespace-pre-wrap">{summaryModal.text}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

