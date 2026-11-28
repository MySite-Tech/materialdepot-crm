'use client';

import { useMemo } from 'react';
import { OutreachLead } from '../../../models/mock-data';
import { JourneyEvent, OUTREACH_SOURCES, OUTREACH_SOURCE_HINT, OutreachSource, WaitlistSignup } from '../../../models/outreach';
import { Empty, Field, SectionCard, fmtLeadDateTime } from '../../../ui/inbound-chips';
import { inputCls } from '../../../constants/ui';

const DOT: Partial<Record<JourneyEvent['kind'] | 'waitlist', string>> = {
  'meeting-held': '#22C55E',
  'order-verified': '#22C55E',
  'handover-accepted': '#22C55E',
  'meeting-postponed': '#F59E0B',
  'intake-rejected': '#EF4444',
  'handover-rejected': '#EF4444',
  waitlist: '#8B5CF6',
};

function Fact({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-[12px] leading-snug">
      <span className="w-[120px] shrink-0 text-gray-500">{label}</span>
      <span className="text-gray-800 min-w-0">{value}</span>
    </div>
  );
}

export function OutreachSourceCard({ draft, set }: {
  draft: OutreachLead;
  set: <K extends keyof OutreachLead>(k: K, v: OutreachLead[K]) => void;
}) {
  const i = draft.intake;
  const ec = draft.ecReferral;
  return (
    <SectionCard title="Source" info={draft.source ? OUTREACH_SOURCE_HINT[draft.source] : 'Where this lead came from.'}>
      <div className="flex flex-col gap-2.5">
        <Field label="Source" className="sm:max-w-[50%]" info={i ? 'Set by the intake, so it cannot be changed here.' : undefined}>
          <select value={draft.source || ''} onChange={(e) => set('source', (e.target.value || undefined) as OutreachSource | undefined)}
            disabled={!!i} className={inputCls}>
            <option value="">Select…</option>
            {OUTREACH_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <Fact label="Created" value={draft.createdAt ? fmtLeadDateTime(draft.createdAt) : undefined} />
        {i && (
          <>
            <Fact label="From Inbound" value={i.inboundOwner ? `${i.inboundOwner}${i.inboundStage ? `, at ${i.inboundStage}` : ''}` : undefined} />
            <Fact label="Assigned" value={`${fmtLeadDateTime(i.assignedAt)} by ${i.assignedBy}${i.how ? ` (${i.how})` : ''}`} />
            <Fact label="Accepted" value={i.acceptedAt ? fmtLeadDateTime(i.acceptedAt) : undefined} />
            <Fact label="Rejected" value={i.rejectedAt ? `${fmtLeadDateTime(i.rejectedAt)}${i.rejectedBy ? ` by ${i.rejectedBy}` : ''}${i.rejectReason ? `: ${i.rejectReason}` : ''}` : undefined} />
          </>
        )}
        {ec && <Fact label="Referred by EC" value={`${ec.by} at ${ec.ec}, ${fmtLeadDateTime(ec.at)}`} />}
      </div>
    </SectionCard>
  );
}

const fmt = (iso: string) => new Date(iso).toLocaleString('en-IN', {
  timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
});

export function OutreachJourneyCard({ lead, waitlist }: { lead: OutreachLead; waitlist: WaitlistSignup | null | undefined }) {
  const events = useMemo(() => {
    const list: (JourneyEvent | { at: string; by: string; kind: 'waitlist'; text: string })[] = [...(lead.journey || [])];
    if (waitlist) list.push({ at: waitlist.createdAt, by: waitlist.contactName, kind: 'waitlist', text: `Joined the Studio Space waitlist as ${waitlist.firmName}` });
    return list.sort((a, b) => b.at.localeCompare(a.at));
  }, [lead.journey, waitlist]);

  return (
    <SectionCard title="Journey" owner="derived" info="Every step logged as it happens, newest first. It shows what is saved, so edits appear after Save changes.">
      {!events.length ? (
        <Empty>Nothing logged yet. Steps are recorded from the next save on; earlier history is in the meetings and notes.</Empty>
      ) : (
        <ol className="relative border-l border-gray-200 ml-1.5">
          {events.map((e, i) => (
            <li key={`${e.at}-${i}`} className="ml-3.5 pb-2.5 last:pb-0">
              <span className="absolute -left-[4.5px] mt-1.5 w-2 h-2 rounded-full" style={{ background: DOT[e.kind] || '#9CA3AF' }} />
              <div className="text-[12px] text-gray-800 leading-snug">{e.text}</div>
              <div className="text-[11px] text-gray-400">{`${fmt(e.at)} · ${e.by}`}</div>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
