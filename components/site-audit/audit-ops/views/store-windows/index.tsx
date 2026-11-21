'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { saveSetting, type CityFilter } from '../../../shared';
import { TH } from '../../constants';
import { Head } from '../cells';
import { STANDARD_WINDOWS, STORE_POOLS, STORE_WINDOWS_SETTING } from './constants';
import type { StoreWindowsValue, WindowRow } from './types';
import { clockLabel, hhmm, minutesOf, readStoreWindows, sortWindows, windowsError } from './utils';

export function StoreWindowsView({ city, toast }: { city: CityFilter; toast: (m: string) => void }) {
  const pools = useMemo(() => STORE_POOLS.filter((p) => city === 'all' || p.city === city), [city]);
  const [poolId, setPoolId] = useState(pools[0]?.id || '');
  const [saved, setSaved] = useState<StoreWindowsValue | null>(null);
  const [failed, setFailed] = useState(false);
  const [draft, setDraft] = useState<WindowRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setFailed(false);
    const r = await readStoreWindows();
    if (!r) { setFailed(true); return; }
    setSaved(r.value);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!pools.some((p) => p.id === poolId)) setPoolId(pools[0]?.id || ''); }, [pools, poolId]);

  const custom = !!saved && Array.isArray(saved[poolId]) && saved[poolId].length > 0;
  useEffect(() => {
    if (!saved) return;
    setDraft(custom ? sortWindows(saved[poolId]) : STANDARD_WINDOWS);
    setErr('');
  }, [saved, poolId, custom]);

  async function write(next: WindowRow[] | null) {
    setErr('');
    if (next) {
      const e = windowsError(next);
      if (e) { setErr(e); return; }
    }
    setBusy(true);
    try {
      const fresh = await readStoreWindows();
      if (!fresh) throw new Error('could not re-read the saved hours');
      const value: StoreWindowsValue = { ...fresh.value };
      if (next) value[poolId] = sortWindows(next);
      else delete value[poolId];
      await saveSetting(STORE_WINDOWS_SETTING, value, fresh.id);
      setSaved(value);
      toast(next ? 'Store hours saved' : 'Back to standard hours');
    } catch (e: any) {
      setErr('Not saved: ' + (e?.message || 'unknown error'));
    } finally {
      setBusy(false);
    }
  }

  function addWindow() {
    const last = draft[draft.length - 1];
    const start = last ? minutesOf(last.end) ?? 600 : 600;
    setDraft([...draft, { start: hhmm(start), end: hhmm(start + 60) }]);
  }

  const setRow = (i: number, k: keyof WindowRow, v: string) => setDraft((d) => d.map((r, ri) => (ri === i ? { ...r, [k]: v } : r)));
  const pool = pools.find((p) => p.id === poolId);

  return (
    <>
      <Head
        title="Slots & timings"
        sub="Audit visit windows for each store. Store booking and the customer app offer exactly these. A booking also holds the next window, for the auditor's travel."
      />

      {failed ? (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[13px] font-semibold text-red-700">
          <span>⚠ Couldn&apos;t load store hours. Nothing can be saved until they load.</span>
          <button className="ml-auto rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-bold text-red-700" onClick={load}>Retry</button>
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2.5">
        <select value={poolId} onChange={(e) => setPoolId(e.target.value)} className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-semibold outline-none focus:border-yellow-400">
          {pools.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        {saved ? (
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${custom ? 'bg-sky-100 text-sky-800' : 'bg-gray-100 text-gray-600'}`}>
            {custom ? 'Custom hours' : 'Standard hours'}
          </span>
        ) : null}
        <div className="ml-auto flex gap-2">
          <button disabled={!saved || busy} onClick={addWindow} className="rounded-md border border-blue-500 bg-white px-2.5 py-1 text-xs font-semibold text-blue-600 disabled:opacity-50">+ Add window</button>
          {custom ? (
            <button disabled={busy} onClick={() => { if (window.confirm(`Put ${pool?.label} back on the standard hours?`)) write(null); }}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-semibold text-gray-600 disabled:opacity-50">Reset to standard</button>
          ) : null}
          <button disabled={!saved || busy} onClick={() => write(draft)} className="rounded-md bg-[#1F3A5F] px-3 py-1 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {err ? <div className="mb-3 text-[12.5px] font-semibold text-red-600">{err}</div> : null}

      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
        <table className="w-full">
          <thead><tr>{['Window', 'Start', 'End', ''].map((h) => <th key={h} className={TH}>{h}</th>)}</tr></thead>
          <tbody>
            {saved ? draft.map((r, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-3 py-2 text-[13px] font-bold">Window {i + 1}</td>
                <td className="px-3 py-2"><input type="time" value={r.start} onChange={(e) => setRow(i, 'start', e.target.value)} className="rounded-md border border-gray-200 px-2 py-1.5 text-[13px]" /></td>
                <td className="px-3 py-2"><input type="time" value={r.end} onChange={(e) => setRow(i, 'end', e.target.value)} className="rounded-md border border-gray-200 px-2 py-1.5 text-[13px]" /></td>
                <td className="px-3 py-2">
                  <button onClick={() => setDraft((d) => d.filter((_, ri) => ri !== i))} className="rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-600">Delete</button>
                </td>
              </tr>
            )) : (
              <tr><td colSpan={4} className="border-t border-gray-100 py-8 text-center text-[13px] text-gray-400">{failed ? '—' : 'Loading store hours…'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[12px] text-gray-500">
        Saved hours reach store booking and the customer app within about two minutes. Bookings already made keep their time.
        {draft.length ? ' Preview: ' + sortWindows(draft).map((r) => clockLabel(r.start) + '–' + clockLabel(r.end)).join(', ') + '.' : ''}
      </p>
    </>
  );
}
