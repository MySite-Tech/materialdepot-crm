'use client';

import { useState } from 'react';
import { sbGet, sbPatchLong } from '../siteAuditShared';

type SkuSaveResult = { ok: boolean; card?: any; error?: string; unchanged?: boolean };
type SkuSaver = (value: string) => Promise<SkuSaveResult>;

function logEntry(label: string, sku: string, prev: string, attribution: string) {
  return {
    t: sku
      ? label + ' SKU set to ' + sku + (prev ? ' (was ' + prev + ')' : '')
      : label + ' SKU cleared' + (prev ? ' (was ' + prev + ')' : ''),
    d: new Date().toISOString(),
    by: 'manual' as const,
    who: attribution,
  };
}

export function auditRoomSkuSaver(orderId: string, roomIdx: number, attribution: string): SkuSaver {
  return async (value: string) => {
    const sku = value.trim();
    try {
      const rows = await sbGet('audit_orders?id=eq.' + orderId + '&select=audit_ticked,log');
      const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
      const fresh = row ? row.audit_ticked : null;
      if (!fresh || !Array.isArray(fresh.rooms) || !fresh.rooms[roomIdx]) {
        return { ok: false, error: 'Could not load the latest job card — reopen the order and try again' };
      }
      const prev = String(fresh.rooms[roomIdx].sku || '').trim();
      if (prev === sku) return { ok: true, card: fresh, unchanged: true };
      fresh.rooms[roomIdx].sku = sku;
      const label = 'Room ' + (roomIdx + 1) + (fresh.rooms[roomIdx].name ? ' (' + fresh.rooms[roomIdx].name + ')' : '');
      const log = [...(Array.isArray(row.log) ? row.log : []), logEntry(label, sku, prev, attribution)];
      await sbPatchLong('audit_orders', orderId, { audit_ticked: fresh, log });
      return { ok: true, card: fresh };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'try again' };
    }
  };
}

export function installRoomSkuSaver(orderId: string, subjobId: string, roomIdx: number, attribution: string): SkuSaver {
  return async (value: string) => {
    const sku = value.trim();
    try {
      const rows = await sbGet('install_orders?id=eq.' + orderId + '&select=subjobs,log');
      const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
      const subjobs = row && Array.isArray(row.subjobs) ? row.subjobs : null;
      const sj = subjobs ? subjobs.find((s: any) => s && String(s.id) === String(subjobId)) : null;
      const rooms = sj && sj.jobcard && Array.isArray(sj.jobcard.rooms) ? sj.jobcard.rooms : null;
      if (!rooms || !rooms[roomIdx]) {
        return { ok: false, error: 'Could not load the latest job card — reopen the order and try again' };
      }
      const prev = String(rooms[roomIdx].sku || '').trim();
      if (prev === sku) return { ok: true, card: sj.jobcard, unchanged: true };
      rooms[roomIdx].sku = sku;
      const label = String(sj.type || 'install').toUpperCase() + ' · Room ' + (roomIdx + 1)
        + (rooms[roomIdx].name ? ' (' + rooms[roomIdx].name + ')' : '');
      const log = [...(Array.isArray(row.log) ? row.log : []), logEntry(label, sku, prev, attribution)];
      await sbPatchLong('install_orders', orderId, { subjobs, log });
      return { ok: true, card: sj.jobcard };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'try again' };
    }
  };
}

export default function RoomSkuEditor({ room, save, onSaved, toast }: {
  room: any;
  save: SkuSaver;
  onSaved: (card: any) => void;
  toast?: (m: string) => void;
}) {
  const cur = String(room?.sku || '').trim();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(cur);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function commit() {
    setBusy(true);
    setErr('');
    const res = await save(draft);
    setBusy(false);
    if (!res.ok) { setErr(res.error || 'Save failed'); return; }
    onSaved(res.card);
    if (toast) toast(res.unchanged ? 'No change' : (draft.trim() ? 'Room SKU saved' : 'Room SKU cleared'));
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="-mt-1.5 mb-3 flex flex-wrap items-center gap-2 pl-1 text-[12px]">
        <span className="text-gray-500">SKU on card</span>
        {cur
          ? <b className="font-mono text-gray-800">{cur}</b>
          : <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-bold text-amber-800">not entered — prints as NA</span>}
        <button className="font-semibold text-blue-700" onClick={() => { setDraft(cur); setErr(''); setEditing(true); }}>
          {cur ? 'Change' : 'Add SKU'}
        </button>
      </div>
    );
  }
  return (
    <div className="-mt-1.5 mb-3 pl-1">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !busy) commit(); }}
          placeholder="e.g. WF-OAK-1220"
          className="min-w-[180px] rounded-md border border-gray-200 px-2.5 py-1.5 font-mono text-[12.5px] outline-none focus:border-[#0F766E]"
        />
        <button disabled={busy} onClick={commit} className="rounded-md bg-[#1F3A5F] px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60">
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button className="text-[12px] font-semibold text-gray-500" onClick={() => setEditing(false)}>Cancel</button>
      </div>
      {err ? <div className="mt-1 text-[11.5px] text-red-600">{err}</div> : null}
    </div>
  );
}
