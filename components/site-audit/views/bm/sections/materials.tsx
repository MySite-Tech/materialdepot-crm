'use client';

import { categoryFor } from '../../../data/audit-registry';
import { sbGet, sbPatch } from '../../../shared';
import { BmProfile } from '../types';
import { useState } from 'react';

export function MaterialSection({ room, roomIdx, orderId, bm, onSaved }: { room: any; roomIdx: number; orderId: string; bm: BmProfile; onSaved: (m: string) => void }) {
  if (!(room?.v >= 2) || !Array.isArray(room.segments) || !room.segments.length) return null;
  const cat = categoryFor(room.category);
  const multi = !!(cat.segment && cat.segment.model === 'multi');
  return (
    <div className="mb-3.5 rounded-lg border border-dashed border-blue-400 bg-blue-50/40 p-2.5">
      <div className="mb-2 text-[12px] font-extrabold text-[#1F3A5F]">🎨 Material selection</div>
      {room.segments.map((s: any, si: number) => (
        <MaterialCard
          key={si}
          label={multi ? (cat.segment!.segLabel || 'Segment') + ' ' + (si + 1) + (s.facing ? ' — ' + s.facing : '') : (cat.segment?.segLabel || 'Area')}
          seg={s} roomIdx={roomIdx} segIdx={si} orderId={orderId} bm={bm} onSaved={onSaved}
        />
      ))}
    </div>
  );
}

function MaterialCard({ label, seg, roomIdx, segIdx, orderId, bm, onSaved }: {
  label: string; seg: any; roomIdx: number; segIdx: number; orderId: string; bm: BmProfile; onSaved: (m: string) => void;
}) {
  const [editing, setEditing] = useState(!seg.material);
  const [sku, setSku] = useState(seg.material?.sku || '');
  const [name, setName] = useState(seg.material?.productName || '');
  const [url, setUrl] = useState(seg.material?.url || '');
  const [image, setImage] = useState<string | null>(seg.material?.image || null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);

  if (!editing && seg.material) {
    return (
      <div className="mb-1.5 rounded-lg border border-gray-200 bg-white p-2">
        <div className="mb-1.5 text-[11.5px] font-bold text-[#1F3A5F]">{label}</div>
        <div className="flex items-center gap-2">
          {seg.material.image ? <img src={seg.material.image} alt="" className="h-11 w-11 shrink-0 rounded-md border border-gray-200 object-cover" /> : null}
          <div className="min-w-0 flex-1 text-[12px]">
            <div className="font-bold">{seg.material.productName || seg.material.sku || '—'}</div>
            {seg.material.sku ? <div className="text-[11px] text-gray-400">SKU: {seg.material.sku}</div> : null}
          </div>
          <button className="shrink-0 rounded-md bg-gray-100 px-3 py-1.5 text-[12px] font-bold text-[#1F3A5F]" onClick={() => setEditing(true)}>Edit</button>
        </div>
      </div>
    );
  }

  async function fetchImage() {
    setErr('');
    if (!url.trim()) { setErr('Paste a materialdepot.com product URL first.'); return; }
    setFetching(true);
    try {
      const r = await fetch('/api/site-audit/fetch-og-image?url=' + encodeURIComponent(url.trim()));
      const j = await r.json();
      if (j.image) setImage(j.image);
      else setErr(j.error ? 'Could not fetch an image from that page.' : 'No preview image found on that page.');
    } catch {
      setErr('Could not reach the image fetcher — try again.');
    }
    setFetching(false);
  }

  async function save() {
    setErr('');
    if (!sku.trim() && !name.trim() && !url.trim()) { setErr('Enter at least a SKU, product name, or URL.'); return; }
    setBusy(true);
    try {
      const rows = await sbGet('audit_orders?id=eq.' + orderId + '&select=audit_ticked');
      const fresh = Array.isArray(rows) && rows[0] ? rows[0].audit_ticked : null;
      if (!fresh || !Array.isArray(fresh.rooms)) throw new Error('Could not load the latest job card — reload and try again.');
      const room = fresh.rooms[roomIdx];
      if (!room || !(room.v >= 2) || !Array.isArray(room.segments) || !room.segments[segIdx]) throw new Error('That room/segment could not be found — reload and try again.');
      room.segments[segIdx].material = {
        sku: sku.trim(), productName: name.trim(), url: url.trim(), image: image || null,
        by: { email: bm.email || '', name: bm.name }, at: new Date().toISOString(),
      };
      await sbPatch('audit_orders', orderId, { audit_ticked: fresh });
      setEditing(false);
      onSaved('Material saved for ' + label);
    } catch (e: any) {
      setErr('Save failed — ' + (e?.message || 'try again'));
    }
    setBusy(false);
  }

  return (
    <div className="mb-1.5 rounded-lg border border-gray-200 bg-white p-2">
      <div className="mb-1.5 text-[11.5px] font-bold text-[#1F3A5F]">{label}</div>
      <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SKU code" className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Product name" className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
      <div className="mb-1.5 flex gap-1.5">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="materialdepot.com product URL" className="flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
        <button disabled={fetching} onClick={fetchImage} className="shrink-0 whitespace-nowrap rounded-md bg-[#1F3A5F] px-2.5 py-1.5 text-[12px] font-bold text-white disabled:opacity-60">{fetching ? 'Fetching…' : 'Fetch image'}</button>
      </div>
      <div className="mb-1.5">{image ? <img src={image} alt="" className="h-11 w-11 rounded-md border border-gray-200 object-cover" /> : <div className="text-[11px] text-gray-400">No image yet — paste a URL and click Fetch image.</div>}</div>
      <div className="flex gap-1.5">
        <button disabled={busy} onClick={save} className="rounded-md bg-green-700 px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
        {seg.material ? <button onClick={() => setEditing(false)} className="rounded-md bg-gray-100 px-3 py-1.5 text-[12px] font-bold text-gray-500">Cancel</button> : null}
      </div>
      {err ? <div className="mt-1 text-[11.5px] text-red-600">{err}</div> : null}
    </div>
  );
}
