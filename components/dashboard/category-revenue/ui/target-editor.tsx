'use client';

import { useState } from 'react';

import { BUCKET_KEYS, BUCKET_LABEL } from '../constants';
import { BucketKey, CategoryTargets, StoreTarget } from '../types';
import { monthLabel, targetFor } from '../utils';

export function TargetEditor({ month, stores, targets, onClose, onSave }: {
  month: string;
  stores: string[];
  targets: CategoryTargets;
  onClose: () => void;
  onSave: (month: string, draft: Record<string, StoreTarget>) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<Record<string, StoreTarget>>(() => {
    const base: Record<string, StoreTarget> = {};
    for (const s of stores) base[s] = { ...targetFor(targets, month, s) };
    return base;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const set = (store: string, key: BucketKey, raw: string) => {
    const n = raw === '' ? 0 : Number(raw.replace(/[^0-9.]/g, ''));
    setDraft(d => ({ ...d, [store]: { ...d[store], [key]: Number.isFinite(n) ? n : 0 } }));
  };

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      await onSave(month, draft);
      onClose();
    } catch (e) {
      setErr((e as Error)?.message || 'Could not save — the app_settings table may be missing');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <div>
            <div className="text-[14px] font-bold text-gray-900">Store targets — {monthLabel(month)}</div>
            <div className="text-[11px] text-gray-400">Monthly revenue targets in ₹. Leave blank for no target.</div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 cursor-pointer bg-transparent border-none text-[18px] leading-none">✕</button>
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full text-[12px]">
            <thead className="sticky top-0 bg-gray-50">
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Store</th>
                {BUCKET_KEYS.map(k => (
                  <th key={k} className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400">{BUCKET_LABEL[k]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stores.map(s => (
                <tr key={s} className="border-b border-gray-50">
                  <td className="px-4 py-1.5 text-gray-800 font-medium whitespace-nowrap">{s}</td>
                  {BUCKET_KEYS.map(k => (
                    <td key={k} className="px-3 py-1.5 text-right">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={draft[s]?.[k] ? String(draft[s][k]) : ''}
                        placeholder="0"
                        onChange={e => set(s, k, e.target.value)}
                        className="w-28 border border-gray-200 rounded px-2 py-1 text-[12px] text-right font-mono text-gray-800 outline-none focus:border-gray-400"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
          {err && <span className="text-[11px] text-red-600 mr-auto">⚠ {err}</span>}
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg border border-gray-200 text-[12px] text-gray-600 hover:bg-gray-50 cursor-pointer bg-white">Cancel</button>
          <button onClick={submit} disabled={busy}
            className="px-4 py-1.5 rounded-lg bg-[#1A1A1A] text-white text-[12px] font-semibold cursor-pointer border-none disabled:opacity-50">
            {busy ? 'Saving…' : 'Save targets'}
          </button>
        </div>
      </div>
    </div>
  );
}
