'use client';

import { useState } from 'react';
import { NPS_QUESTIONS } from '../constants';
import type { NpsKind, NpsRow } from '../types';
import { saveScore } from './utils';

function ScorePick({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-[12.5px] font-semibold text-gray-700">{label}</div>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button key={n} type="button" onClick={() => onChange(n)}
            className={`h-8 w-8 rounded-md border text-[13px] font-semibold ${value === n ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-400'}`}>
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ScoreModal({ kind, row, who, whoEmail, onClose, onSaved }: {
  kind: NpsKind; row: NpsRow; who: string; whoEmail?: string | null; onClose: () => void; onSaved: (warn: string | null) => void;
}) {
  const [idx, setIdx] = useState(() => Math.max(0, row.targets.findIndex((t) => t.q1 == null)));
  const [q1, setQ1] = useState(0);
  const [q2, setQ2] = useState(0);
  const [q3, setQ3] = useState(0);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const target = row.targets[idx];
  const [l1, l2, l3] = NPS_QUESTIONS[kind];

  async function save() {
    setErr('');
    if (!q1 || !q2 || !q3) { setErr('Pick all three scores.'); return; }
    setBusy(true);
    const res = await saveScore(kind, row, target, { q1, q2, q3 }, note, who, whoEmail);
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    onSaved(res.warn);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 text-lg font-bold text-gray-900">Add score</div>
        <div className="mb-4 text-[12.5px] text-gray-500">
          <span className="font-mono">{row.enq}</span> · {row.name || '—'} · {row.phone}
        </div>

        {row.targets.length > 1 ? (
          <div className="mb-3">
            <div className="mb-1 text-[12.5px] font-semibold text-gray-700">Which job?</div>
            <select value={idx} onChange={(e) => setIdx(Number(e.target.value))} className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-[13px]">
              {row.targets.map((t, i) => (
                <option key={t.orderId + (t.sjId || '')} value={i}>
                  {t.label} · {t.staffName || 'no installer'} · {t.q1 == null ? 'not scored yet' : `scored ${t.q1}`}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {target.q1 != null ? (
          <div className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
            Already scored {target.q1}. Saving adds a newer score, and the tab will show this one.
          </div>
        ) : null}

        <ScorePick label={l1} value={q1} onChange={setQ1} />
        <ScorePick label={l2} value={q2} onChange={setQ2} />
        <ScorePick label={l3} value={q3} onChange={setQ3} />

        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did the client say? (optional)"
          className="mb-2 min-h-[64px] w-full rounded-md border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-yellow-400" />
        {err ? <div className="mb-2 text-[12px] text-red-600">{err}</div> : null}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md border border-gray-200 px-3 py-1.5 text-[13px] font-semibold text-gray-600">Cancel</button>
          <button disabled={busy} onClick={save} className="rounded-md bg-[#1F3A5F] px-4 py-1.5 text-[13px] font-bold text-white disabled:opacity-60">
            {busy ? 'Saving…' : 'Save score'}
          </button>
        </div>
      </div>
    </div>
  );
}
