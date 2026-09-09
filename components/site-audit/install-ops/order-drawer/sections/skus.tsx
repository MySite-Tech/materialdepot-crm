'use client';

import { typeLabel } from '../../../data/audit-registry';
import { rollHintText, skuQtyField } from '../../shared';
import { InstallCategory, ServiceSkuRow } from '../../types';
import { DraftState } from '../types';

export function SkuGroup({
  grp, label, draft, grpOn, toggleGrp, updateDraftField, delDraftRow, addDraftRow,
}: {
  grp: InstallCategory; label: string; draft: DraftState; grpOn: Record<InstallCategory, boolean>;
  toggleGrp: (g: InstallCategory) => void;
  updateDraftField: (g: InstallCategory, i: number, f: keyof ServiceSkuRow, v: string) => void;
  delDraftRow: (g: InstallCategory, i: number) => void;
  addDraftRow: (g: InstallCategory) => void;
}) {
  const on = grpOn[grp];
  return (
    <div className="mb-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-[13px] font-extrabold text-[#1F3A5F]">{label}</span>
        <div className={`relative w-9 h-5 rounded-full cursor-pointer ml-auto transition-colors ${on ? 'bg-green-600' : 'bg-gray-300'}`} onClick={() => toggleGrp(grp)}>
          <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
        </div>
      </div>
      {on ? (
        <div>
          {draft[grp].map((r, i) => <SkuRow key={i} r={r} grp={grp} i={i} onField={updateDraftField} onDel={delDraftRow} />)}
          <button className="border border-dashed border-blue-500 bg-white text-blue-600 rounded-md py-1.5 text-[12.5px] font-semibold w-full" onClick={() => addDraftRow(grp)}>+ Add {typeLabel(grp).toLowerCase()} SKU</button>
          {grp === 'wallpaper' ? <div className="text-[11px] text-gray-400 mt-1">Enter the area to be wallpapered — rolls are calculated automatically. Duration: 1–3 rolls = 3h (1 slot), 4–6 rolls = 6h (2 slots), 7+ rolls = 9h (3 slots).</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function SkuRow({
  r, grp, i, onField, onDel,
}: {
  r: ServiceSkuRow; grp: InstallCategory; i: number;
  onField: (g: InstallCategory, i: number, f: keyof ServiceSkuRow, v: string) => void;
  onDel: (g: InstallCategory, i: number) => void;
}) {
  const qf = skuQtyField(grp);
  const legacyRaw = grp === 'wallpaper' ? r.rolls : r.qty;
  const legacyNum = legacyRaw && !isNaN(parseFloat(legacyRaw)) ? parseFloat(legacyRaw) : null;
  const ph = !r.sqft && legacyNum !== null ? 'Previously: ' + legacyNum + (grp === 'wallpaper' ? ' rolls' : '') + ' — ' + qf.ph : qf.ph;
  return (
    <div className="relative bg-gray-50 rounded-lg px-3 py-2.5 pr-9 mb-2.5">
      <button className="absolute top-2 right-2 w-6 h-6 rounded-md bg-red-100 text-red-600 font-extrabold" onClick={() => onDel(grp, i)}>×</button>
      <div className="mb-2">
        <label className="block text-[10.5px] font-semibold text-gray-500 mb-1">SKU Code</label>
        <input placeholder="e.g. WF-OAK-12MM" value={r.sku || ''} onChange={(e) => onField(grp, i, 'sku', e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-[13px] bg-white" />
      </div>
      <div className="mb-2">
        <label className="block text-[10.5px] font-semibold text-gray-500 mb-1">Product Name</label>
        <input placeholder="Product name" value={r.name || ''} onChange={(e) => onField(grp, i, 'name', e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-[13px] bg-white" />
      </div>
      <div className="mb-2">
        <label className="block text-[10.5px] font-semibold text-gray-500 mb-1">{qf.label}</label>
        <input placeholder={ph} inputMode="decimal" value={r.sqft || ''} onChange={(e) => onField(grp, i, 'sqft', e.target.value)}
          onBlur={(e) => { const v = e.target.value.trim(); if (v && (isNaN(parseFloat(v)) || parseFloat(v) < 0)) onField(grp, i, 'sqft', ''); }}
          className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-[13px] bg-white" />
        {grp === 'wallpaper' ? <div className="text-[11px] text-purple-700 font-semibold mt-1">{rollHintText(r.sqft)}</div> : null}
      </div>
      {grp !== 'wallpaper' ? (
        <div>
          <label className="block text-[10.5px] font-semibold text-gray-500 mb-1">SKU Link <span className="font-medium text-gray-400">(optional)</span></label>
          <input placeholder="https://..." value={r.link || ''} onChange={(e) => onField(grp, i, 'link', e.target.value)} className="w-full px-2 py-1.5 border border-gray-200 rounded-md text-[13px] bg-white" />
        </div>
      ) : null}
    </div>
  );
}
