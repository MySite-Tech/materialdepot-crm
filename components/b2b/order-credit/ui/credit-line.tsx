'use client';

import { useState } from 'react';
import { B2B_TEAM_LABEL } from '@/lib/b2b/team/constants';
import { creditKey } from '@/lib/b2b/revenue';
import { TEAM_ORDER_OF } from '../constants';
import { useOrderCredits } from '../hooks/use-order-credits';

const control = 'px-2 py-1 text-[12px] border border-gray-200 rounded-md bg-white outline-none focus:border-[#0F766E]';

const fmtDay = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function OrderCreditLine({ enquiryId, rule }: { enquiryId: string; rule?: string }) {
  const { credits, state, canEdit, people, save, clear } = useOrderCredits();
  const credit = credits?.get(creditKey(enquiryId));
  const [editing, setEditing] = useState(false);
  const [pick, setPick] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = people.find((p) => `${p.phone}|${p.team}` === pick);

  const run = async (op: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await op();
      setEditing(false);
      setPick('');
      setReason('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const apply = () => chosen && reason.trim() && run(() => save({ enquiryId, name: chosen.name, phone: chosen.phone, team: chosen.team, reason: reason.trim() }));

  return (
    <div className={`rounded-md border px-3 py-2 text-[12px] ${credit ? 'border-teal-200 bg-teal-50/60' : 'border-gray-200 bg-white'}`}>
      <div className="flex items-center gap-x-2 gap-y-1 flex-wrap">
        <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Revenue credited to</span>
        {state === 'loading' || state === 'idle' ? (
          <span className="text-gray-400">…</span>
        ) : state === 'failed' ? (
          <span className="text-amber-700">Unknown — manual credits could not be read</span>
        ) : credit ? (
          <>
            <strong className="text-gray-900">{credit.name}</strong>
            {credit.team && <span className="text-[10px] font-semibold text-teal-800 bg-white border border-teal-200 rounded px-1.5">{B2B_TEAM_LABEL[credit.team]}</span>}
            <span className="text-gray-500">set by {credit.by} on {fmtDay(credit.at)}{credit.reason ? `: ${credit.reason}` : ''}</span>
            {!!credit.history.length && (
              <span className="text-gray-400" title={credit.history.map((h) => `${h.name} — ${h.by}, ${fmtDay(h.at)}: ${h.reason}`).join('\n')}>
                · changed {credit.history.length} time{credit.history.length === 1 ? '' : 's'} before
              </span>
            )}
          </>
        ) : (
          <span className="text-gray-700">
            {rule ? <strong>{rule}</strong> : <span className="text-gray-500">No one yet</span>}
            <span className="text-gray-400"> · by the rule: the B2B rep on the cart, else whoever holds this number</span>
          </span>
        )}
        {canEdit && state === 'ready' && !editing && (
          <span className="ml-auto flex items-center gap-3">
            <button onClick={() => setEditing(true)} className="font-semibold text-[#0F766E] hover:underline cursor-pointer">{credit ? 'Change' : 'Credit to someone'}</button>
            {credit && <button disabled={busy} onClick={() => run(() => clear(enquiryId))} className="text-gray-500 hover:underline cursor-pointer disabled:opacity-40">Back to the rule</button>}
          </span>
        )}
      </div>
      {editing && (
        <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto_auto] gap-2 mt-2 items-center">
          <select aria-label="Person to credit" value={pick} onChange={(e) => setPick(e.target.value)} className={control}>
            <option value="">Pick a person…</option>
            {TEAM_ORDER_OF.map((t) => {
              const list = people.filter((p) => p.team === t);
              return list.length ? (
                <optgroup key={t} label={B2B_TEAM_LABEL[t]}>
                  {list.map((p) => <option key={`${p.phone}|${p.team}`} value={`${p.phone}|${p.team}`}>{p.name}</option>)}
                </optgroup>
              ) : null;
            })}
          </select>
          <input aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why (required), e.g. Varun closed it with the store" className={control} />
          <button onClick={apply} disabled={busy || !chosen || !reason.trim()} className="px-3 py-1 rounded-md bg-[#0F766E] text-white font-semibold disabled:opacity-40 cursor-pointer">{busy ? 'Saving…' : 'Save'}</button>
          <button onClick={() => { setEditing(false); setError(null); }} className="px-3 py-1 rounded-md border border-gray-200 bg-white text-gray-600 cursor-pointer">Cancel</button>
        </div>
      )}
      {error && <p className="text-[11px] text-red-600 mt-1">{error}. Nothing was changed.</p>}
    </div>
  );
}
