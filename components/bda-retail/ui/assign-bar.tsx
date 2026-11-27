'use client';

import { useState } from 'react';
import type { BdaPerson, LeadView } from '@/lib/bda-retail/types';
import { dealRoundRobin, isOpen } from '@/lib/bda-retail/utils';

const ROUND_ROBIN = 'round-robin';

export function AssignBar({ bdas, shown, views, picked, setPicked, onAssign }: {
  bdas: BdaPerson[];
  shown: LeadView[];
  views: LeadView[];
  picked: Set<string>;
  setPicked: (next: Set<string>) => void;
  onAssign: (assignments: Array<{ key: string; phone: string }>, step: (s: string) => void) => Promise<number>;
}) {
  const [to, setTo] = useState(ROUND_ROBIN);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  if (bdas.length === 0) {
    return (
      <div className="px-4 py-2 text-[12px] text-amber-900 bg-amber-50 border-b border-amber-100">
        Nobody has the BDA Retail role yet, so there is no one to assign leads to. Give it under Admin &gt; Users, then reload this tab.
      </div>
    );
  }

  const chosen = views.filter((l) => picked.has(l.key) && isOpen(l));
  const moving = chosen.filter((l) => l.claim).length;

  const assign = async () => {
    if (!chosen.length || busy) return;
    const keys = chosen.map((l) => l.key);
    const plan = to === ROUND_ROBIN ? dealRoundRobin(keys, bdas.map((b) => b.phone), views) : keys.map((key) => ({ key, phone: to }));
    setNote(null);
    try {
      const n = await onAssign(plan, setBusy);
      const who = to === ROUND_ROBIN ? `round robin across ${bdas.length} BDA${bdas.length > 1 ? 's' : ''}` : bdas.find((b) => b.phone === to)?.name;
      setNote({ tone: 'ok', text: `${n.toLocaleString('en-IN')} lead${n === 1 ? '' : 's'} assigned, ${who}. They are in each BDA's My queue under Assigned to you.` });
      setPicked(new Set());
    } catch (err) {
      setNote({ tone: 'err', text: `Assigning stopped: ${err instanceof Error ? err.message : 'unknown error'}. Leads assigned before the error keep their BDA.` });
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="border-b border-gray-100">
      <div className="flex items-center gap-2.5 px-4 py-2 flex-wrap bg-teal-50/40 text-[12px]">
        <span className="text-gray-700"><strong>{picked.size.toLocaleString('en-IN')}</strong> selected</span>
        {picked.size < shown.length && (
          <button onClick={() => setPicked(new Set(shown.map((l) => l.key)))} className="text-[#0F766E] font-semibold underline">
            Select all {shown.length.toLocaleString('en-IN')} shown
          </button>
        )}
        {picked.size > 0 && <button onClick={() => setPicked(new Set())} className="text-gray-500 underline">Clear</button>}
        <span className="ml-auto text-gray-500">Assign to</span>
        <select value={to} onChange={(e) => setTo(e.target.value)} className="px-2 py-1 text-[12px] border border-gray-200 rounded-md bg-white">
          <option value={ROUND_ROBIN}>Round robin across every BDA ({bdas.length})</option>
          {bdas.map((b) => <option key={b.phone} value={b.phone}>{b.name}</option>)}
        </select>
        <button
          onClick={() => void assign()}
          disabled={!chosen.length || !!busy}
          className="bg-[#0F766E] text-white px-3 py-1.5 rounded-md text-[12px] font-semibold disabled:opacity-40"
        >
          {busy || `Assign ${chosen.length.toLocaleString('en-IN')}`}
        </button>
      </div>
      {moving > 0 && !busy && (
        <p className="px-4 py-1.5 text-[11.5px] text-amber-800 bg-amber-50">
          {moving.toLocaleString('en-IN')} of these already sit with a BDA and will move. Calls already logged stay with whoever made them.
        </p>
      )}
      {picked.size > chosen.length && (
        <p className="px-4 py-1.5 text-[11.5px] text-gray-500">{(picked.size - chosen.length).toLocaleString('en-IN')} closed or unreachable leads are left out.</p>
      )}
      {note && (
        <p className={`px-4 py-1.5 text-[12px] ${note.tone === 'ok' ? 'text-teal-900 bg-teal-50' : 'text-red-700 bg-red-50'}`}>{note.text}</p>
      )}
    </div>
  );
}
