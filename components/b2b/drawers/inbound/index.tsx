'use client';

import { InboundDrawerFooter } from './footer';
import { InboundDrawerHeader } from './header';

import { InboundCallsCard } from './cards/calls';
import { InboundClientCard } from './cards/client';
import { InboundEnrichCard } from './cards/enrich';
import { InboundNotesCard } from './cards/notes';
import { InboundPresalesCard } from './cards/presales';
import { InboundRequirementCard } from './cards/requirement';
import { InboundStatusCard } from './cards/status';

import { CallAttempt, CallAttemptOutcome, InboundStatus, PLACED_UNDER_FIELDS, PlacedUnder, callGateErrors, enrichmentGaps, hasConnected, istToday, kylasClientTypeIsAmbiguous, nextAttemptNumber, nextKamRoundRobin, retriesExhausted, selectionsKylasWillDrop, statusGateErrors } from '../../models/inbound';
import { CallLogEntry, InboundLead, KAMS, LeadDeal, LeadNote } from '../../models/mock-data';
import { Field, SectionCard, Spinner, inputCls } from '../../ui/inbound-chips';
import { KYLAS_OUTCOME } from './constants';
import { SaveState } from '../../types/inbound-drawer';
import { EnqLookup, fetchInboundKamLoad, lookupEnqId, upsertInboundLead } from '@/lib/b2b';
import { createInboundCallLog, createLeadNote, fetchCallLogSummary, fetchInboundLeadDetail, fetchLeadCallLogs, fetchLeadDeals, fetchLeadNotes, updateInboundLeadKylas } from '@/lib/api';
import { useEffect, useMemo, useRef, useState } from 'react';

export default function InboundDrawer({
  lead, onClose, onSaved,
}: {
  lead: InboundLead;
  onClose: () => void;

  onSaved: (updated: InboundLead) => void;
}) {
  const [draft, setDraft] = useState<InboundLead>(lead);
  const [save, setSave] = useState<SaveState>({ saving: false });
  const [showGates, setShowGates] = useState(false);

  const set = <K extends keyof InboundLead>(k: K, v: InboundLead[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

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

          leadSummary: d.leadSummary ?? prev.leadSummary,
          urgency: d.urgency ?? prev.urgency,
          pincode: d.pincode ?? prev.pincode,
          presalesOwner: d.presalesOwner ?? prev.presalesOwner,
          presalesClientType: d.presalesClientType ?? prev.presalesClientType,
          presalesMissedCalls: d.presalesMissedCalls ?? prev.presalesMissedCalls,
          qualificationTag: d.qualificationTag ?? prev.qualificationTag,
          leadCreatedAt: d.leadCreatedAt ?? prev.leadCreatedAt,
          phone: d.phone || prev.phone,

          contactName: d.contactName ?? prev.contactName,
          company: d.kylasName || prev.company,

          requirement: prev.requirement || d.requirement,
          selections: prev.selections?.length ? prev.selections : d.selections,
        }));
      })
      .finally(() => { if (alive) setDetailLoading(false); });
    return () => { alive = false; };
  }, [lead.id]);

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

        placedUnder: { ...(d.placedUnder || {}), bmName: res.bmName || d.placedUnder?.bmName },
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

    const nextStatus: InboundStatus =
      draft.stage === 'New' ? 'Follow up' : draft.stage;
    const updated: InboundLead = {
      ...draft,
      callAttempts: nextAttempts,
      followUpDate: logFollowUp,
      stage: nextStatus,
      statusChangedAt: nextStatus !== draft.stage ? new Date().toISOString() : draft.statusChangedAt,
    };

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

        <InboundDrawerHeader
        draft={draft}
        gaps={gaps}
        onClose={onClose}
        today={today}
      />

        <div className="p-5 flex flex-col gap-4">

          <InboundPresalesCard
        detailFailed={detailFailed}
        detailLoading={detailLoading}
        draft={draft}
        presalesTypeUnmapped={presalesTypeUnmapped}
      />

          <InboundClientCard
        draft={draft}
        presalesTypeUnmapped={presalesTypeUnmapped}
        set={set}
      />

          <InboundRequirementCard
        draft={draft}
        droppedSelections={droppedSelections}
        set={set}
      />

          <InboundCallsCard
        attemptNo={attemptNo}
        attempts={attempts}
        callLogs={callLogs}
        callsLoading={callsLoading}
        connected={connected}
        detailLoading={detailLoading}
        draft={draft}
        exhausted={exhausted}
        logAttempt={logAttempt}
        logDuration={logDuration}
        logError={logError}
        logFollowUp={logFollowUp}
        logNote={logNote}
        logOpen={logOpen}
        logOutcome={logOutcome}
        logging={logging}
        openCallSummary={openCallSummary}
        phoneId={phoneId}
        setDraft={setDraft}
        setLogDuration={setLogDuration}
        setLogError={setLogError}
        setLogFollowUp={setLogFollowUp}
        setLogNote={setLogNote}
        setLogOpen={setLogOpen}
        setLogOutcome={setLogOutcome}
      />

          <InboundStatusCard
        checkEnq={checkEnq}
        draft={draft}
        enq={enq}
        enqChecking={enqChecking}
        gateFor={gateFor}
        set={set}
        setDraft={setDraft}
        setShowGates={setShowGates}
      />

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

          <InboundEnrichCard
        deals={deals}
        dealsLoading={dealsLoading}
        draft={draft}
      />

          <InboundNotesCard
        addNote={addNote}
        kylasNotes={kylasNotes}
        noteText={noteText}
        notesLoading={notesLoading}
        savingNote={savingNote}
        setNoteText={setNoteText}
      />
        </div>

        <InboundDrawerFooter
        gaps={gaps}
        gateErrors={gateErrors}
        handleSave={handleSave}
        onClose={onClose}
        save={save}
        showGates={showGates}
      />
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
