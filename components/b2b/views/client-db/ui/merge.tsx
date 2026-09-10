'use client';

import { ClientEntity, DuplicateSuggestion, EVIDENCE_IS_EXACT, EVIDENCE_LABEL, MERGE_FIELD_LABEL, MergeChoices, contactNumbers, gstNumbers, mergeConflicts } from '../../../models/client';
import { Field } from '.';
import { btnGhost, btnPrimary, inputCls } from '../../../constants/ui';
import { useMemo, useState } from 'react';

export function MergeModal({ clients, suggestions, onClose, onMerge }: {
  clients: ClientEntity[];
  suggestions: DuplicateSuggestion[];
  onClose: () => void;
  onMerge: (sources: ClientEntity[], choices: MergeChoices) => Promise<string | null>;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [choices, setChoices] = useState<MergeChoices>({});
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const sources = useMemo(
    () => selected.map((id) => clients.find((c) => c.id === id)).filter((c): c is ClientEntity => !!c),
    [selected, clients],
  );
  const conflicts = useMemo(() => (sources.length >= 2 ? mergeConflicts(sources) : []), [sources]);
  const unresolved = conflicts.filter((c) => !(choices as Record<string, string | undefined>)[c.field]);

  const toggle = (id: string) => {
    setChoices({});
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const q = search.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [];
    const digits = q.replace(/\D/g, '');
    return clients.filter((c) =>
      c.company.toLowerCase().includes(q)
      || (digits.length >= 4 && contactNumbers(c.contacts).some((p) => p.includes(digits)))
      || gstNumbers(c.gsts).some((g) => g.toLowerCase().includes(q)));
  }, [clients, q]);

  const run = async () => {
    setBusy(true);
    setError('');
    const err = await onMerge(sources, choices);
    setBusy(false);
    if (err) setError(err); else onClose();
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[760px] bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-800">Merge Clients</h2>
            <p className="text-[11px] text-gray-400">
              One real client that has ordered under more than one number or GST · §4
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none cursor-pointer">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-4">
          <Field label="Search by company name, GST or contact number">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Metro / 27AAPFU… / 9900099013" className={inputCls} />
          </Field>

          {!!matches.length && (
            <div className="border border-gray-200 rounded-md divide-y divide-gray-100 max-h-[180px] overflow-y-auto">
              {matches.map((c) => (
                <label key={c.id} className="flex items-start gap-2 px-2 py-1.5 cursor-pointer hover:bg-gray-50">
                  <input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} className="mt-0.5" />
                  <span className="text-[12px]">
                    <span className="font-medium text-gray-700">{c.company}</span>
                    <span className="text-gray-400"> · {contactNumbers(c.contacts).join(', ') || 'no number'}</span>
                    {!!gstNumbers(c.gsts).length && <span className="text-gray-400 font-mono"> · {gstNumbers(c.gsts).join(', ')}</span>}
                  </span>
                </label>
              ))}
            </div>
          )}

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
              Likely duplicates · {suggestions.length}
            </div>
            {!suggestions.length ? (
              <p className="text-[11px] text-gray-300 py-2">Nothing looks duplicated.</p>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto">
                {suggestions.map((s, i) => {
                  const exact = s.evidence.some((e) => EVIDENCE_IS_EXACT[e]);
                  return (
                    <div key={i} className={`border rounded-md px-2 py-1.5 ${exact ? 'border-amber-200 bg-amber-50/50' : 'border-gray-200'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[12px] min-w-0">
                          <span className="font-medium text-gray-700">{s.a.company}</span>
                          <span className="text-gray-400"> ↔ </span>
                          <span className="font-medium text-gray-700">{s.b.company}</span>
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            {s.evidence.map((e) => EVIDENCE_LABEL[e]).join(' · ')}
                            {!!s.shared.length && <span className="font-mono text-gray-400"> — {s.shared.join(', ')}</span>}
                          </div>
                          {!exact && (
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              Name only. Two firms can have similar names — check before merging.
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => { setChoices({}); setSelected([s.a.id, s.b.id]); }}
                          className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer whitespace-nowrap"
                        >
                          Select both
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {sources.length >= 2 && (
            <div className="border-t border-gray-100 pt-4">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Merging {sources.length}{' '}records
              </div>
              <div className="text-[11px] text-gray-600 mb-3">
                {sources.map((c) => c.company).join(' + ')} → one entity keeping{' '}
                <span className="font-semibold">
                  {[...new Set(sources.flatMap((c) => contactNumbers(c.contacts)))].length}{' '}contact number(s)
                </span>{' '}and{' '}
                <span className="font-semibold">
                  {[...new Set(sources.flatMap((c) => gstNumbers(c.gsts)))].length}{' '}GST(s)
                </span>. Every historical Enquiry ID rolls up automatically, because order history is derived
                from those numbers and was never stored on the record.
              </div>

              {!conflicts.length ? (
                <p className="text-[11px] text-[#0F766E]">These records agree on everything — nothing to choose.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  <p className="text-[11px] text-amber-700">
                    These records disagree. PRD open question #1 asks which value should win; nothing is picked for
                    you, because a segment chosen by a machine changes how the account is targeted and nobody would
                    know it was guessed.
                  </p>
                  {conflicts.map((c) => (
                    <div key={c.field} className="flex items-start gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold text-gray-500 w-24 shrink-0 pt-1">{MERGE_FIELD_LABEL[c.field]}</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {c.options.map((o) => {
                          const active = (choices as Record<string, string | undefined>)[c.field] === o.value;
                          return (
                            <button
                              key={o.value}
                              onClick={() => setChoices((ch) => ({ ...ch, [c.field]: o.value } as MergeChoices))}
                              title={`From ${o.from.join(', ')}`}
                              className={`px-2 py-1 text-[11px] font-semibold rounded-md border cursor-pointer ${active ? 'bg-[#0F766E] text-white border-[#0F766E]' : 'bg-white text-gray-600 border-gray-200'}`}
                            >
                              {o.value}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {error && <p className="text-[12px] text-red-600 mt-2">{error}</p>}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-100">
          <span className="text-[11px] text-gray-400">
            {unresolved.length ? `Pick a value for ${unresolved.map((c) => MERGE_FIELD_LABEL[c.field]).join(', ')}.` : ''}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className={btnGhost}>Cancel</button>
            <button onClick={run} disabled={busy || sources.length < 2 || !!unresolved.length} className={btnPrimary}>
              {busy ? 'Merging…' : `Merge ${sources.length || ''} records`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
