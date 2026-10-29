'use client';

import { InboundLead } from '../../../models/mock-data';
import { Empty, SectionCard, fmtLeadDateTime, inputCls } from '../../../ui/inbound-chips';
import { useCallLog } from '../hooks/use-call-log';

export function InboundNotesCard({ draft, calls }: {
  draft: InboundLead;
  calls: ReturnType<typeof useCallLog>;
}) {
  const notes = (draft.notes || []).slice().reverse();
  return (
    <SectionCard title="Team notes" owner="crm" subtitle="Written by the B2B team · travels to Outreach and the KAM">
      <textarea
        value={calls.noteText}
        onChange={(e) => calls.setNoteText(e.target.value)}
        placeholder="Anything the next person on this client should know…"
        rows={2}
        className={inputCls + ' resize-none'}
      />
      <button
        onClick={calls.addNote}
        disabled={calls.busy || !calls.noteText.trim()}
        className="mt-2 bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold disabled:opacity-50"
      >
        {calls.busy ? 'Saving…' : '+ Add note'}
      </button>
      <div className="mt-3 flex flex-col gap-2 max-h-[240px] overflow-y-auto pr-1">
        {notes.length === 0 ? <Empty>No team notes yet.</Empty>
          : notes.map((n, i) => (
            <div key={i} className="text-[11px] border border-gray-100 rounded-md p-2">
              <div className="text-gray-700 whitespace-pre-wrap">{n.text}</div>
              <div className="text-gray-400 mt-1">{n.author || 'Unknown'}{n.ts ? ` · ${fmtLeadDateTime(n.ts)}` : ''}</div>
            </div>
          ))}
      </div>
    </SectionCard>
  );
}
