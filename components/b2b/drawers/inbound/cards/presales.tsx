'use client';

import { CallLogEntry, InboundLead, LeadNote } from '../../../models/mock-data';
import { CollapsibleCard, Empty, Field, ReadValue, Spinner, fmtLeadDateTime } from '../../../ui/inbound-chips';
import { Loaded } from '../hooks/use-inbound-detail';

const sub = 'text-[10px] font-bold uppercase tracking-wider text-gray-400';

export function InboundPresalesCard({ detailFailed, detailLoading, draft, presalesTypeUnmapped, calls, notes, openCallSummary }: {
  detailFailed: boolean;
  detailLoading: boolean;
  draft: InboundLead;
  presalesTypeUnmapped: boolean;
  calls: Loaded<CallLogEntry[]>;
  notes: Loaded<LeadNote[]>;
  openCallSummary: (callLogId: string) => void;
}) {
  const summary = detailLoading ? 'loading…'
    : detailFailed ? 'Kylas unreachable'
      : [draft.qualificationTag, draft.presalesOwner && `by ${draft.presalesOwner}`, fmtLeadDateTime(draft.leadCreatedAt)].filter(Boolean).join(' · ');
  return (
    <CollapsibleCard title="From Presales" owner="kylas" subtitle="Read-only first reference · never overwritten by us" summary={summary}>
      {detailFailed && (
        <p className="text-[11px] text-red-600 mb-3 leading-snug">
          Kylas did not answer, so this block shows the last stored snapshot rather than live
          values. It is not evidence Presales left these blank.
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Field label="Contact number"><ReadValue v={draft.phone} /></Field>
        <Field label="Contact name"><ReadValue v={draft.contactName} /></Field>
        <Field label="Kylas owner"><ReadValue v={draft.owner} /></Field>
        <Field label="Lead date & time"><ReadValue v={fmtLeadDateTime(draft.leadCreatedAt)} /></Field>
        <Field label="Qualified as"><ReadValue v={draft.qualificationTag} /></Field>
        <Field label="Qualified by"><ReadValue v={draft.presalesOwner} /></Field>
        <Field label="Lead summary" className="col-span-2"><ReadValue v={draft.leadSummary} /></Field>
        <Field label="Urgency"><ReadValue v={draft.urgency} /></Field>
        <Field label="Pincode" hint={draft.pincode ? 'Sets the default City' : undefined}><ReadValue v={draft.pincode} /></Field>
        <Field label="Client type (Presales)" hint={presalesTypeUnmapped ? 'No exact match — pick one under Client' : undefined}>
          <ReadValue v={draft.presalesClientType} />
        </Field>
        <Field label="Missed calls (Presales)"><ReadValue v={draft.presalesMissedCalls} /></Field>
        <Field label="Source"><ReadValue v={draft.source} /></Field>
      </div>

      <div className="mt-4 border-t border-gray-100 pt-3">
        <div className="flex items-center gap-2 mb-1">
          <span className={sub}>Kylas call records</span>
          {!calls.loading && <span className="text-[10px] text-gray-400">{calls.data.length}</span>}
        </div>
        {calls.loading ? <Spinner label="Loading call records…" />
          : calls.data.length === 0 ? <Empty>No calls recorded in Kylas.</Empty>
            : (
              <div className="flex flex-col divide-y divide-gray-100 max-h-[220px] overflow-y-auto">
                {calls.data.map((c) => (
                  <div key={c.id} className="flex items-center gap-2.5 py-2">
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
                ))}
              </div>
            )}
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3">
        <div className="flex items-center gap-2 mb-1">
          <span className={sub}>Kylas notes</span>
          {!notes.loading && <span className="text-[10px] text-gray-400">{notes.data.length}</span>}
        </div>
        {notes.loading ? <Spinner label="Loading notes…" />
          : notes.data.length === 0 ? <Empty>No notes in Kylas.</Empty>
            : (
              <div className="flex flex-col gap-2 max-h-[200px] overflow-y-auto pr-1">
                {notes.data.map((n, i) => (
                  <div key={i} className="text-[11px] border border-gray-100 rounded-md p-2">
                    <div className="text-gray-700 whitespace-pre-wrap">{n.text}</div>
                    <div className="text-gray-400 mt-1">{n.author}{n.ts ? ` · ${n.ts}` : ''}</div>
                  </div>
                ))}
              </div>
            )}
      </div>
    </CollapsibleCard>
  );
}
