'use client';

import { useState } from 'react';
import { callTally } from '../../../models/inbound';
import { LeadNote, OutreachLead } from '../../../models/mock-data';
import { fmtFollowUp } from '../../../models/reminders';
import { CallAttempt, CallAttemptOutcome } from '../../../types/inbound';
import { Empty, GateErrors, fmtLeadDateTime, inputCls } from '../../../ui/inbound-chips';
import { Hint } from '../../../ui/info-tip';
import { noteMs } from '../utils';

const btn = 'px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap disabled:opacity-50';

const SAME_NOTE_MS = 15 * 60 * 1000;

type Item =
  | { kind: 'call'; ms: number; call: CallAttempt }
  | { kind: 'note'; ms: number; note: LeadNote; unsaved: boolean };

const callMs = (iso: string | undefined) => {
  const ms = Date.parse(iso || '');
  return Number.isNaN(ms) ? 0 : ms;
};

function timeline(calls: CallAttempt[], notes: LeadNote[], savedNotes: number): Item[] {
  const repeats = (n: LeadNote, ms: number) => calls.some((c) =>
    c.note?.trim() && c.note.trim() === n.text.trim() && Math.abs(callMs(c.at) - ms) < SAME_NOTE_MS);
  const noteItems = notes.flatMap((note, i): Item[] => {
    const ms = noteMs(note.ts);
    return note.text?.trim() && !repeats(note, ms) ? [{ kind: 'note', ms: ms || i - notes.length, note, unsaved: i >= savedNotes }] : [];
  });
  return [...calls.map((call): Item => ({ kind: 'call', ms: callMs(call.at), call })), ...noteItems].sort((a, b) => b.ms - a.ms);
}

function CallRow({ a }: { a: CallAttempt }) {
  const connected = a.outcome === 'Connected';
  return (
    <>
      <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${connected ? 'bg-[#0F766E] text-white' : 'bg-red-50 text-red-600 border border-red-200'}`}>{a.n}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[12.5px] font-medium text-gray-900">{connected ? 'Connected' : 'RNR'}</span>
          <span className="text-[11px] text-gray-400">{fmtLeadDateTime(a.at)}{a.by ? ` · ${a.by}` : ''}</span>
        </div>
        {a.note && <p className="text-[12px] text-gray-700 mt-0.5 whitespace-pre-wrap">{a.note}</p>}
      </div>
    </>
  );
}

function NoteRow({ n, unsaved }: { n: LeadNote; unsaved: boolean }) {
  const ms = noteMs(n.ts);
  const when = ms ? fmtLeadDateTime(new Date(ms).toISOString()) : n.ts;
  return (
    <>
      <span className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center bg-gray-100 text-gray-500 text-[11px]" aria-hidden>✎</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[12.5px] font-medium text-gray-900">Note</span>
          <span className="text-[11px] text-gray-400">{when}{n.author ? ` · ${n.author}` : ''}</span>
          {unsaved && <span className="text-[11px] text-amber-700">not saved yet</span>}
        </div>
        <p className="text-[12px] text-gray-700 mt-0.5 whitespace-pre-wrap">{n.text}</p>
      </div>
    </>
  );
}

export function OutreachActivity({ draft, savedNotes, today, onLog, noteText, setNoteText, addNote, onFollowUp }: {
  draft: OutreachLead;
  savedNotes: number;
  today: string;
  onLog: (outcome: CallAttemptOutcome, note: string) => Promise<string | null>;
  noteText: string;
  setNoteText: (v: string) => void;
  addNote: () => void;
  onFollowUp: () => void;
}) {
  const attempts = draft.callAttempts || [];
  const tally = callTally(attempts);
  const items = timeline(attempts, draft.notes || [], savedNotes);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closed = draft.status === 'Closed' || draft.status === 'Lost';

  const log = async (outcome: CallAttemptOutcome) => {
    if (busy) return;
    if (outcome === 'Connected' && !note.trim()) { setError('Write what was discussed before saving a connected call.'); return; }
    setBusy(true);
    setError(null);
    const err = await onLog(outcome, outcome === 'Connected' ? note.trim() : '');
    setBusy(false);
    if (err) { setError(err); return; }
    setOpen(false);
    setNote('');
  };

  return (
    <section className="bg-white rounded-lg border border-gray-200">
      <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-b border-gray-100">
        <div className="text-[12.5px] min-w-0">
          {!closed && (
            <>
              <span className="text-gray-500">Next follow-up </span>
              <button onClick={onFollowUp} className="hover:underline">
                {draft.followUpDate
                  ? <span className={`font-semibold ${draft.followUpDate < today ? 'text-red-600' : 'text-gray-900'}`}>{fmtFollowUp(draft.followUpDate, draft.followUpTime)}</span>
                  : <span className="font-semibold text-gray-500">not set</span>}
              </button>
              <span className="text-gray-400"> · </span>
            </>
          )}
          <span className="text-gray-400">
            {tally.total ? `${tally.total} call${tally.total === 1 ? '' : 's'}, ${tally.connected} connected, ${tally.rnr} RNR` : 'no calls yet'}
          </span>
        </div>
        {!open && (
          <div className="flex items-center gap-2">
            <button onClick={() => log('RNR')} disabled={busy} className={`${btn} bg-white border border-red-200 text-red-600 hover:bg-red-50`}>
              {busy ? 'Saving…' : 'RNR'}
            </button>
            <button onClick={() => { setOpen(true); setError(null); }} disabled={busy} className={`${btn} bg-[#0F766E] text-white`}>Connected…</button>
            <Hint text={'Log every call to this client here. A call saves at once and counts on your scorecard.\nRNR: ring, no response. Connected asks what was discussed.'} />
          </div>
        )}
      </div>

      <div className="px-4 py-3 flex flex-col gap-3">
        {open && (
          <div className="rounded-md border border-[#0F766E]/30 bg-[#0F766E]/[0.03] p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-semibold text-gray-900">Connected call {attempts.length + 1}</span>
              <button onClick={() => { setOpen(false); setError(null); }} aria-label="Cancel" className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
            </div>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              placeholder="What was discussed: requirement, next meeting, who decides, what you promised" className={inputCls + ' resize-none'} />
            <div>
              <button onClick={() => log('Connected')} disabled={busy} className={`${btn} bg-[#0F766E] text-white`}>{busy ? 'Saving…' : 'Save call'}</button>
            </div>
          </div>
        )}
        {error && <GateErrors errors={[error]} />}

        <div className="flex items-start gap-2">
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note for the next person on this client"
            rows={noteText ? 3 : 1}
            className={inputCls + ' resize-none flex-1'}
          />
          <button
            onClick={addNote}
            disabled={!noteText.trim()}
            className={`${btn} border border-gray-200 bg-white text-gray-700 hover:border-gray-400`}
          >
            Add note
          </button>
          <Hint text="A note is kept with the lead when you press Save changes below. Calls save at once." />
        </div>

        {items.length === 0 ? <Empty>No calls or notes yet.</Empty> : (
          <ol className="flex flex-col divide-y divide-gray-100 max-h-[480px] overflow-y-auto -mx-1 px-1">
            {items.map((it, i) => (
              <li key={`${it.kind}-${it.ms}-${i}`} className="flex items-start gap-3 py-2.5">
                {it.kind === 'call' ? <CallRow a={it.call} /> : <NoteRow n={it.note} unsaved={it.unsaved} />}
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
