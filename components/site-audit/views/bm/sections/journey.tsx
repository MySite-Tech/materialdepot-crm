'use client';

import { JourneyEntry, MD_JOURNEY_STAGES, journeyStage } from '../../../data/audit-registry';
import { fmtLog, sbGet, sbPatch } from '../../../shared';
import { BmProfile } from '../types';
import { useState } from 'react';

export function JourneyTimeline({ entries }: { entries: JourneyEntry[] | null }) {
  if (entries === null) return <div className="text-[12.5px] text-gray-400">Loading…</div>;
  if (!entries.length) return <div className="text-[12.5px] text-gray-400">No journey entries logged yet.</div>;
  const sorted = entries.slice().sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
  return (
    <>
      {sorted.map((e) => {
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
    </>
  );
}

export function JourneyAddForm({ entries, orderId, bm, onSaved }: { entries: JourneyEntry[]; orderId: string; bm: BmProfile; onSaved: (m: string) => void }) {
  const [stage, setStage] = useState(MD_JOURNEY_STAGES[0].k);
  const cfg = journeyStage(stage);
  const priorChanges = entries.filter((e) => e.decision === 'changes_requested').length;
  const [round, setRound] = useState('');
  const [decision, setDecision] = useState('');
  const [refId, setRefId] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function add() {
    setErr(''); setBusy(true);
    try {
      const rows = await sbGet('audit_orders?id=eq.' + orderId + '&select=bm_journey');
      const fresh: JourneyEntry[] = Array.isArray(rows) && rows[0] && Array.isArray(rows[0].bm_journey) ? rows[0].bm_journey : [];
      fresh.push({
        id: 'j_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        ts: new Date().toISOString(),
        stage,
        round: cfg.hasRound ? parseInt(round || String(priorChanges + 1), 10) || null : null,
        decision: (cfg.hasDecision ? (decision || null) : null) as JourneyEntry['decision'],
        note: note.trim(), refId: cfg.hasRef ? refId.trim() : '',
        by: { email: bm.email || '', name: bm.name, role: 'bm' },
      });
      await sbPatch('audit_orders', orderId, { bm_journey: fresh });
      setNote(''); setRefId(''); setDecision(''); setRound('');
      onSaved('Journey entry added');
    } catch (e: any) {
      setErr('Failed — ' + (e?.message || 'try again'));
    }
    setBusy(false);
  }

  return (
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
      {err ? <div className="mb-1 text-[11.5px] text-red-600">{err}</div> : null}
      <button disabled={busy} onClick={add} className="rounded-md bg-green-700 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-60">{busy ? 'Saving…' : '+ Add entry'}</button>
    </div>
  );
}
