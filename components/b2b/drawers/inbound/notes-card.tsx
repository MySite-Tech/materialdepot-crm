'use client';

import { LeadNote } from '../../models/mockData';
import { Empty, SectionCard, Spinner } from '../../ui/inboundChips';
import { inputCls } from '../../utils/kams';
import { Dispatch, SetStateAction } from 'react';

export function InboundNotesCard({ addNote, kylasNotes, noteText, notesLoading, savingNote, setNoteText }: {
  addNote: () => Promise<void>;
  kylasNotes: LeadNote[];
  noteText: string;
  notesLoading: boolean;
  savingNote: boolean;
  setNoteText: Dispatch<SetStateAction<string>>;
}) {
  return (
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
  );
}
