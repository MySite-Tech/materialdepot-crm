'use client';

import { OutreachLead } from '../../models/mockData';
import { Empty, SectionCard } from '../../ui/inboundChips';
import { inputCls } from '../../utils/kams';
import { Dispatch, SetStateAction } from 'react';

export function OutreachNotesCard({ addNote, draft, noteText, setNoteText }: {
  addNote: () => void;
  draft: OutreachLead;
  noteText: string;
  setNoteText: Dispatch<SetStateAction<string>>;
}) {
  return (
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
  );
}
