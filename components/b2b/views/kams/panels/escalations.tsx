'use client';

import { ESCALATION_CATEGORIES, ESCALATION_TIERS, Escalation, EscalationCategory, EscalationTier, HEALTH_META, scoreAccount } from '../../../models/account-health';
import { ClientEntity } from '../../../models/client';
import { newB2BId } from '../../../models/ids';
import { Field } from '../ui';
import { btnPrimary, inputCls } from '../../../constants/ui';
import { useState } from 'react';

export function EscalationSection({ client, today, onSave }: {
  client: ClientEntity;
  today: string;
  onSave: (escalations: Escalation[]) => Promise<string | null>;
}) {
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState<EscalationCategory>(ESCALATION_CATEGORIES[0]);
  const [tier, setTier] = useState<EscalationTier>(2);
  const [raisedAt, setRaisedAt] = useState(today);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const escalations = client.escalations || [];
  const health = scoreAccount(escalations, today);
  const meta = HEALTH_META[health.status];

  const write = async (next: Escalation[]) => {
    setError('');
    const err = await onSave(next);
    if (err) setError(err);
  };

  return (
    <div className="border-t border-gray-100 pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Escalations · {health.escalationCount}</span>
        <button onClick={() => setAdding((v) => !v)} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer">
          {adding ? 'Cancel' : '+ Log escalation'}
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-md px-3 py-2 mb-2" style={{ background: meta.color + '0F' }}>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: meta.color }}>
          <span className="w-2 h-2 rounded-full" style={{ background: meta.color }} />
          {meta.label}
        </span>
        <span className="text-[10px] text-gray-500 text-right">
          {health.reason}{health.daysToRecovery !== null && ` · recovers in ${health.daysToRecovery}d`}
        </span>
      </div>

      {adding && (
        <div className="border border-gray-200 rounded-md p-3 mb-2 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <Field label="Category">
              <select value={category} onChange={(e) => setCategory(e.target.value as EscalationCategory)} className={inputCls}>
                {ESCALATION_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Tier">
              <select value={tier} onChange={(e) => setTier(Number(e.target.value) as EscalationTier)} className={inputCls}>
                {ESCALATION_TIERS.map((t) => <option key={t} value={t}>Tier {t}{t === 1 ? ' — critical' : ''}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Raised on">
            <input type="date" max={today} value={raisedAt} onChange={(e) => setRaisedAt(e.target.value)} className={inputCls} />
          </Field>
          <Field label="What happened">
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls + ' resize-none'} />
          </Field>
          <div className="flex justify-end">
            <button
              onClick={async () => {
                await write([...escalations, {
                  id: newB2BId('ESC'), raisedAt: raisedAt || today, category, tier,
                  note: note.trim() || undefined, loggedBy: client.kam,
                }]);
                setAdding(false); setNote(''); setTier(2); setRaisedAt(today);
              }}
              className={btnPrimary}
            >
              Add escalation
            </button>
          </div>
        </div>
      )}

      {!escalations.length ? (
        <p className="text-[11px] text-gray-300">No escalations logged.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {[...escalations].sort((a, b) => b.raisedAt.localeCompare(a.raisedAt)).map((e) => (
            <div key={e.id} className="border border-gray-100 rounded-md p-2 text-[11px]">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="font-medium text-gray-700">{e.category}</span>
                  <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold"
                    style={{ background: e.tier === 1 ? '#EF444418' : '#6B728018', color: e.tier === 1 ? '#EF4444' : '#6B7280' }}>
                    T{e.tier}
                  </span>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    Raised {e.raisedAt}{e.resolvedAt ? ` · resolved ${e.resolvedAt}` : ' · open'}
                  </div>
                  {e.note && <div className="text-gray-600 mt-1 break-words">{e.note}</div>}
                </div>
                <button
                  onClick={() => write(escalations.map((x) => (x.id === e.id ? { ...x, resolvedAt: e.resolvedAt ? undefined : today } : x)))}
                  className="text-[10px] font-semibold text-[#0F766E] hover:underline cursor-pointer whitespace-nowrap"
                >
                  {e.resolvedAt ? 'Reopen' : 'Mark resolved'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && <p className="text-[11px] text-red-600 mt-1">Could not save: {error}</p>}
    </div>
  );
}
