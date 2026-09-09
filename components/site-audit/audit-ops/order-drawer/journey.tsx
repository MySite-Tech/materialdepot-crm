'use client';

import { JourneyEntry, MD_JOURNEY_STAGES, journeyStage } from '../../data/auditRegistry';
import { fmtLog } from '../../siteAuditShared';
import { useState } from 'react';

export function JourneyBlock({ entries, onAdd }: { entries: JourneyEntry[] | null; onAdd: (e: Omit<JourneyEntry, 'id' | 'ts' | 'by'>) => Promise<void> }) {
  const [stage, setStage] = useState(MD_JOURNEY_STAGES[0].k);
  const [round, setRound] = useState('');
  const [decision, setDecision] = useState('');
  const [refId, setRefId] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const cfg = journeyStage(stage);
  const priorChanges = (entries || []).filter((e) => e.decision === 'changes_requested').length;

  async function submit() {
    setBusy(true);
    try {
      await onAdd({
        stage,
        round: cfg.hasRound ? parseInt(round || String(priorChanges + 1), 10) || null : null,
        decision: (cfg.hasDecision ? (decision || null) : null) as JourneyEntry['decision'],
        refId: cfg.hasRef ? refId.trim() : '',
        note: note.trim(),
      });
      setNote(''); setRefId(''); setDecision(''); setRound('');
    } catch { /* the caller toasts */ }
    setBusy(false);
  }

  return (
    <>
      {entries === null ? <div className="text-[12.5px] text-gray-400">Loading…</div>
        : !entries.length ? <div className="text-[12.5px] text-gray-400">No journey entries logged yet.</div>
          : entries.slice().sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime()).map((e) => {
            const st = journeyStage(e.stage);
            return (
              <div key={e.id} className="border-b border-gray-100 py-2 last:border-b-0">
                <div className="text-[13px] font-bold">
                  {st.icon} {st.label}
                  {e.round ? <span className="text-gray-400"> · Round {e.round}</span> : null}
                  {e.decision === 'approved' ? <span className="text-green-700"> ✓ Approved</span> : e.decision === 'changes_requested' ? <span className="text-red-600"> ✎ Changes requested</span> : null}
                </div>
                {e.note ? <div className="mt-0.5 text-[12px]">{e.note}</div> : null}
                {e.refId ? <div className="mt-0.5 text-[11.5px] text-gray-400">Ref: {e.refId}</div> : null}
                <div className="mt-0.5 text-[11.5px] text-gray-400">{e.by?.name ? e.by.name + ' · ' : ''}{fmtLog(e.ts)}{e.by?.role ? ' · ' + e.by.role : ''}</div>
              </div>
            );
          })}
      <div className="mt-2.5 rounded-lg border border-gray-200 bg-gray-50 p-2.5">
        <select value={stage} onChange={(e) => setStage(e.target.value)} className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]">
          {MD_JOURNEY_STAGES.map((s) => <option key={s.k} value={s.k}>{s.icon} {s.label}</option>)}
        </select>
        {cfg.hasRound ? <input type="number" min={1} value={round} onChange={(e) => setRound(e.target.value)} placeholder={'Round # (default ' + (priorChanges + 1) + ')'} className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" /> : null}
        {cfg.hasDecision ? (
          <select value={decision} onChange={(e) => setDecision(e.target.value)} className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]">
            <option value="">— Client decision —</option>
            <option value="approved">Approved</option>
            <option value="changes_requested">Changes requested</option>
          </select>
        ) : null}
        {cfg.hasRef ? <input value={refId} onChange={(e) => setRefId(e.target.value)} placeholder={cfg.refLabel || 'Reference'} className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" /> : null}
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="mb-1.5 min-h-[50px] w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
        <button disabled={busy} onClick={submit} className="rounded-md bg-green-700 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-60">{busy ? 'Saving…' : '+ Add entry'}</button>
      </div>
    </>
  );
}
