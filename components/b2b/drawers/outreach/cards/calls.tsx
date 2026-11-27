'use client';

import { callTally } from '../../../models/inbound';
import { OutreachLead } from '../../../models/mock-data';
import { CallAttemptOutcome } from '../../../types/inbound';
import { Empty, GateErrors, SectionCard, fmtLeadDateTime, inputCls } from '../../../ui/inbound-chips';
import { useState } from 'react';

const btn = 'px-3 py-1.5 rounded-md text-[12px] font-semibold whitespace-nowrap disabled:opacity-50';

export function OutreachCallsCard({ draft, onLog }: {
  draft: OutreachLead;
  onLog: (outcome: CallAttemptOutcome, note: string) => Promise<string | null>;
}) {
  const attempts = draft.callAttempts || [];
  const tally = callTally(attempts);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <SectionCard
      title="Calls"
      owner="crm"
      subtitle={tally.total ? `${tally.total} call${tally.total === 1 ? '' : 's'} · ${tally.connected} connected · ${tally.rnr} RNR` : 'No calls logged yet'}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap rounded-md bg-gray-50 border border-gray-100 px-3 py-2 mb-3">
        <p className="text-[11.5px] text-gray-500 leading-snug">
          Log every call to this client here. It saves at once and counts on your scorecard.
        </p>
        {!open && (
          <div className="flex items-center gap-2">
            <button onClick={() => log('RNR')} disabled={busy} title="Ring, no response. Saves now."
              className={`${btn} bg-white border border-red-200 text-red-600 hover:bg-red-50`}>
              {busy ? 'Saving…' : 'RNR'}
            </button>
            <button onClick={() => { setOpen(true); setError(null); }} disabled={busy} className={`${btn} bg-[#0F766E] text-white`}>
              Connected…
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="rounded-md border border-[#0F766E]/30 bg-[#0F766E]/[0.03] p-3 mb-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-gray-700">Connected call {attempts.length + 1}</span>
            <button onClick={() => { setOpen(false); setError(null); }} className="text-gray-400 hover:text-gray-700 text-lg leading-none">×</button>
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
            placeholder="What was discussed: requirement, next meeting, who decides, what you promised…" className={inputCls + ' resize-none'} />
          <div>
            <button onClick={() => log('Connected')} disabled={busy} className={`${btn} bg-[#0F766E] text-white`}>
              {busy ? 'Saving…' : 'Save call'}
            </button>
          </div>
        </div>
      )}
      {error && <div className="mb-3"><GateErrors errors={[error]} /></div>}

      {attempts.length === 0 ? <Empty>No calls logged on this lead yet.</Empty> : (
        <ol className="flex flex-col divide-y divide-gray-100 max-h-[300px] overflow-y-auto">
          {attempts.slice().reverse().map((a, i) => (
            <li key={`${a.n}-${i}`} className="flex items-start gap-3 py-2.5">
              <span className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                a.outcome === 'Connected' ? 'bg-[#0F766E] text-white' : 'bg-red-50 text-red-600 border border-red-200'
              }`}>{a.n}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[12px] font-semibold text-gray-800">{a.outcome}</span>
                  <span className="text-[10.5px] text-gray-400">{fmtLeadDateTime(a.at)}{a.by ? ` · ${a.by}` : ''}</span>
                </div>
                {a.note && <p className="text-[11.5px] text-gray-700 mt-0.5 whitespace-pre-wrap">{a.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
