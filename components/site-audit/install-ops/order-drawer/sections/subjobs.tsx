'use client';

import { typeLabel } from '../../../data/audit-registry';
import { STATUS } from '../../constants';
import { assigneeProgress, fmtDate, sjDeliveryDate } from '../../utils';
import { InstallOrder, Subjob } from '../../types';
import { useState } from 'react';

export function SubjobCrewProgress({ sj }: { sj: Subjob }) {
  const crew = assigneeProgress(sj);
  if (crew.length < 1) return null;
  const anyAhead = crew.some((c) => c.ahead);
  if (crew.length === 1 && !anyAhead) return null;
  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
      {crew.map((c, i) => {
        const st = STATUS[c.status] || { l: c.status || '—', badge: 'bg-gray-100 text-gray-600' };
        return (
          <span key={i} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ${st.badge}`}>
            {c.primary ? <span title="Primary — takes the customer signature">★</span> : null}
            {c.name}
            <span className="font-normal opacity-80">· {st.l}</span>
          </span>
        );
      })}
      {anyAhead ? (
        <span className="text-[11px] font-semibold text-gray-500">
          The badge above follows the primary installer — the order completes when they close the job card with the customer.
        </span>
      ) : null}
    </div>
  );
}

export function SplitPicker({ subjob: sj, onCancel, onSplit, toast }: { subjob: Subjob; onCancel: () => void; onSplit: (skus: string[]) => void; toast: (m: string) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (sku: string) => setPicked((p) => (p.includes(sku) ? p.filter((x) => x !== sku) : [...p, sku]));
  return (
    <div className="fixed inset-0 z-[950] flex items-center justify-center bg-black/45 p-4" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="w-full max-w-[440px] max-h-[86vh] overflow-auto rounded-2xl bg-white p-5">
        <div className="mb-1.5 text-base font-extrabold text-[#1F3A5F]">Split {typeLabel(sj.type).toLowerCase()} into separate visits</div>
        <div className="mb-3.5 text-[13px] text-gray-500">Tick the SKU(s) to move into a NEW sub-job (its own installer, date and delivery). Leave at least one here.</div>
        <div className="mb-4 flex flex-col gap-2">
          {(sj.items || []).map((it, i) => (
            <label key={i} className="flex cursor-pointer items-start gap-2.5 rounded-lg border-[1.5px] border-gray-200 p-2.5">
              <input type="checkbox" className="mt-0.5 h-[18px] w-[18px] accent-[#1F3A5F]" checked={picked.includes(it.sku)} onChange={() => toggle(it.sku)} />
              <span className="text-[13px]"><b>{it.sku || '—'}</b>{it.name ? ' · ' + it.name : ''}{it.sqft ? ' · ' + it.sqft + ' sq.ft' : ''}</span>
            </label>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_2fr] gap-2.5">
          <button className="rounded-xl border-[1.5px] border-gray-200 bg-white py-3 font-bold" onClick={onCancel}>Cancel</button>
          <button
            className="rounded-xl bg-[#1F3A5F] py-3 font-bold text-white"
            onClick={() => {
              if (!picked.length) { toast('Tick at least one SKU to move'); return; }
              if (picked.length >= (sj.items || []).length) { toast('Leave at least one SKU in the original sub-job'); return; }
              onSplit(picked);
            }}
          >
            Move to new sub-job
          </button>
        </div>
      </div>
    </div>
  );
}

export function SjDeliveryRow({ order: o, subjob: sj, onSave }: { order: InstallOrder; subjob: Subjob; onSave: (sjId: string, date: string) => Promise<void> }) {
  const eff = sjDeliveryDate(o, sj);
  const own = sj.deliveryDate !== undefined && sj.deliveryDate !== null;
  const [editing, setEditing] = useState(false);
  const [draftDate, setDraftDate] = useState(eff || '');
  if (!editing) {
    return (
      <div className="mb-2.5 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-gray-500">Delivery</span>
        <b className="text-gray-800">{fmtDate(eff)}</b>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${own ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}`}>
          {own ? 'this sub-job' : 'order date'}
        </span>
        <button className="text-[12px] font-semibold text-blue-700" onClick={() => { setDraftDate(eff || ''); setEditing(true); }}>Change</button>
      </div>
    );
  }
  return (
    <div className="mb-2.5 flex flex-wrap items-center gap-2">
      <input type="date" value={draftDate} onChange={(e) => setDraftDate(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1.5 text-[12.5px]" />
      <button className="rounded-md bg-[#1F3A5F] px-2.5 py-1.5 text-[12px] font-semibold text-white" onClick={async () => { await onSave(sj.id, draftDate); setEditing(false); }}>Save</button>
      {own ? (
        <button className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-gray-700" onClick={async () => { await onSave(sj.id, ''); setEditing(false); }}>
          Use order date
        </button>
      ) : null}
      <button className="text-[12px] font-semibold text-gray-500" onClick={() => setEditing(false)}>Cancel</button>
    </div>
  );
}
