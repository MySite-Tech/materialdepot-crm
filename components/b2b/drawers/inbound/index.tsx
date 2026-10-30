'use client';

import { InboundDrawerFooter } from './footer';
import { InboundDrawerHeader } from './header';

import { InboundCallsCard } from './cards/calls';
import { InboundClientCard } from './cards/client';
import { InboundNotesCard } from './cards/notes';
import { InboundOwnerCard } from './cards/owner';
import type { TeamMember } from '@/lib/b2b/team/types';
import { InboundPlacedUnderCard } from './cards/placed-under';
import { InboundAddedCard, InboundPresalesCard } from './cards/presales';
import { withRequirementHistory } from '../../models/requirement';
import { InboundRequirementCard } from './cards/requirement';
import { GateField, InboundStatusCard } from './cards/status';
import { InboundOutreachCard } from './cards/outreach';
import { useCallLog } from './hooks/use-call-log';
import { useInboundDetail } from './hooks/use-inbound-detail';

import { OutreachReferral, PlacedUnder, clientSpocs, isCrmAddedLead, closureReadiness, enrichmentGaps, hasConnected, istToday, kylasClientTypeIsAmbiguous, selectionsKylasWillDrop, statusGateErrors, withStatusStamps } from '../../models/inbound';
import { InboundLead } from '../../models/mock-data';
import { Spinner } from '../../ui/inbound-chips';
import { SaveState } from '../../types/inbound-drawer';
import { EnqLookup, lookupEnqId, upsertInboundLead } from '@/lib/b2b';
import { updateInboundLeadKylas } from '@/lib/api';
import { CreditPicker } from '../../ui/credit-picker';
import { RedirectToEc, uniquePhones } from '../../ui/redirect-to-ec';
import { creditOf } from '../../models/credit';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const GATE_TEXT: Record<GateField, string> = {
  followUpDate: 'follow-up date',
  enqId: 'Enq ID',
  lostReason: 'lost',
  invalidCalls: 'Log at least one call',
  invalidReason: 'invalid reason',
  invalidNote: 'invalid note',
};

const withContactDefaults = (l: InboundLead): InboundLead => ({
  ...l,
  primaryContactName: l.primaryContactName || l.contactName || undefined,
  primaryContactPhone: l.primaryContactPhone || l.phone || undefined,
});

export default function InboundDrawer({
  lead, onClose, onSaved, actorName, actorPhone, members, canReassign, canCredit,
}: {
  lead: InboundLead;
  onClose: () => void;
  actorName: string;
  actorPhone: string;
  members: TeamMember[];
  canReassign: boolean;
  canCredit: boolean;
  onSaved: (updated: InboundLead) => void;
}) {
  const [draft, setDraft] = useState<InboundLead>(() => withContactDefaults(lead));
  const [save, setSave] = useState<SaveState>({ saving: false });
  const [showGates, setShowGates] = useState(false);

  const set = <K extends keyof InboundLead>(k: K, v: InboundLead[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const crmOnly = isCrmAddedLead(lead);
  const detail = useInboundDetail(lead, setDraft);
  const today = istToday();

  const saved = useRef(lead);
  const withHistory = useCallback(
    (next: InboundLead) => withRequirementHistory(saved.current, next, actorName, new Date().toISOString()),
    [actorName],
  );
  const commit = useCallback((next: InboundLead) => { saved.current = next; setDraft(next); onSaved(next); }, [onSaved]);
  const calls = useCallLog(draft, actorName, actorPhone, withHistory, commit);

  const connected = hasConnected(draft.callAttempts);
  const readiness = useMemo(() => closureReadiness(draft, today),
    [draft.stage, draft.leadCreatedAt, draft.callAttempts, draft.outreachReferral, today]);

  const gateErrors = useMemo(() => statusGateErrors({
    status: draft.stage,
    followUpDate: draft.followUpDate,
    enqId: draft.enqId,
    lostReason: draft.lostReason,
    invalidReason: draft.invalidReason,
    invalidNote: draft.invalidNote,
    calls: draft.callAttempts?.length,
    connected,
    readiness,
  }), [draft.stage, draft.followUpDate, draft.enqId, draft.lostReason, draft.invalidReason, draft.invalidNote, draft.callAttempts, connected, readiness]);

  const gaps = useMemo(() => enrichmentGaps(draft), [draft]);

  const gateFor = (field: GateField): string | undefined => {
    if (!showGates) return undefined;
    return gateErrors.find((e) => e.toLowerCase().includes(GATE_TEXT[field].toLowerCase()));
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

  const setPlaced = (patch: Partial<PlacedUnder>) =>
    setDraft((d) => ({ ...d, placedUnder: { ...(d.placedUnder || {}), ...patch } }));

  const handleSave = async (extra?: Partial<InboundLead>) => {
    if (save.saving) return;
    if (gateErrors.length) { setShowGates(true); return; }
    setSave({ saving: true });

    const at = new Date().toISOString();
    const toSave: InboundLead = withRequirementHistory(saved.current, withStatusStamps(lead, {
      ...draft,
      ...extra,
      company: draft.companyName?.trim() || draft.company,
      value: Number(draft.orderValue) || 0,
      timeline: draft.urgency,
      requirementBrief: draft.leadSummary,
    }, at), actorName, at);

    const [kylasRes, dbErr] = await Promise.all([
      crmOnly
        ? Promise.resolve({ ok: true, dropped: [] as string[], error: undefined })
        : updateInboundLeadKylas(lead.id, { requirement: toSave.requirement, selections: toSave.selections }),
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
    saved.current = toSave;
    setDraft(toSave);
    onSaved(toSave);
    setSave({ saving: false, warning: notes.length ? notes.join(' ') : undefined });
    if (!notes.length) onClose();
  };

  const [summaryModal, setSummaryModal] = useState<{ loading: boolean; text?: string; error?: string } | null>(null);
  const openCallSummary = async (callLogId: string) => {
    setSummaryModal({ loading: true });
    try {
      const text = await detail.fetchCallLogSummary(callLogId);
      setSummaryModal({ loading: false, text: text || 'No summary available for this call.' });
    } catch {
      setSummaryModal({ loading: false, error: 'Failed to load call summary. Please try again.' });
    }
  };

  const spocs = useMemo(() => clientSpocs(draft, detail.outreach.data, detail.deals.data),
    [draft, detail.outreach.data, detail.deals.data]);
  const presalesTypeUnmapped = kylasClientTypeIsAmbiguous(draft.presalesClientType);

  return (
    <div className="fixed inset-0 z-[1200] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[780px] bg-[#F7F7F8] h-full overflow-y-auto shadow-2xl flex flex-col">
        <InboundDrawerHeader draft={draft} gaps={gaps} onClose={onClose} today={today} />

        <div className="p-5 flex flex-col gap-4">
          <InboundOwnerCard
            draft={draft}
            spocs={spocs}
            spocsLoading={detail.outreach.loading || detail.deals.loading}
            members={members}
            canReassign={canReassign}
            onReassigned={async (to) => {
              const owned = { owner: to.name, ownerId: to.kylasUserId ?? undefined };
              const next = { ...saved.current, ...owned };
              if (crmOnly) {
                const err = await upsertInboundLead(next);
                if (err) return `Logged, but the new owner was not saved: ${err}. Try again.`;
              }
              saved.current = next;
              setDraft((d) => ({ ...d, ...owned }));
              onSaved(next);
            }}
          />

          <InboundCallsCard
            draft={draft}
            calls={calls}
            readiness={readiness}
            onClose={(reason) => { setDraft((d) => ({ ...d, stage: 'Lost', lostReason: reason })); setShowGates(false); }}
          />

          <InboundClientCard draft={draft} presalesTypeUnmapped={presalesTypeUnmapped} set={set} />

          <InboundRequirementCard draft={draft} crmOnly={crmOnly} droppedSelections={crmOnly ? [] : selectionsKylasWillDrop(draft.selections)} set={set} />

          <InboundStatusCard
            checkEnq={checkEnq}
            draft={draft}
            enq={enq}
            enqChecking={enqChecking}
            gateFor={gateFor}
            set={set}
            setDraft={setDraft}
            setShowGates={setShowGates}
            deals={detail.deals}
            readiness={readiness}
            connected={connected}
          />

          {(draft.stage === 'PI Shared' || draft.stage === 'Closed') && (
            <InboundPlacedUnderCard draft={draft} setPlaced={setPlaced} />
          )}

          {draft.stage === 'Closed' && (
            <CreditPicker
              owner={draft.owner}
              credit={creditOf(draft.revenueCredit)}
              people={members.filter((m) => m.active)}
              canEdit={canCredit}
              actor={actorName}
              onChange={(c) => set('revenueCredit', c)}
            />
          )}

          <InboundOutreachCard
            draft={draft}
            actorName={actorName}
            today={today}
            saving={save.saving}
            onSend={(referral: OutreachReferral) => handleSave({ outreachReferral: referral })}
          />

          <RedirectToEc
            firm={draft.companyName || draft.company}
            contactName={draft.primaryContactName || draft.contactName}
            phones={uniquePhones([draft.primaryContactPhone, draft.phone, ...(draft.additionalContacts || []).map((c) => c.phone)])}
            sourceTeam="inbound"
            leadRef={draft.id}
          />

          <InboundNotesCard draft={draft} calls={calls} />

          {crmOnly ? <InboundAddedCard draft={draft} /> : <InboundPresalesCard
            detailFailed={detail.detailFailed}
            detailLoading={detail.detailLoading}
            draft={draft}
            presalesTypeUnmapped={presalesTypeUnmapped}
            calls={detail.presalesCalls}
            notes={detail.presalesNotes}
            openCallSummary={openCallSummary}
          />}
        </div>

        <InboundDrawerFooter gaps={gaps} gateErrors={gateErrors} handleSave={handleSave} onClose={onClose} save={save} showGates={showGates} />
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
