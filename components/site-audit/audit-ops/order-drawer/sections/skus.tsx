'use client';

import { AuditSkuRow } from '../../types';

export function SkuGroup({
  grp, label, draft, grpOn, onToggle, onField, onAdd, onDel,
}: {
  grp: 'flooring' | 'wallpaper'; label: string;
  draft: { flooring: AuditSkuRow[]; wallpaper: AuditSkuRow[] };
  grpOn: { flooring: boolean; wallpaper: boolean };
  onToggle: (g: 'flooring' | 'wallpaper') => void;
  onField: (g: 'flooring' | 'wallpaper', i: number, f: keyof AuditSkuRow, v: string) => void;
  onAdd: (g: 'flooring' | 'wallpaper') => void;
  onDel: (g: 'flooring' | 'wallpaper', i: number) => void;
}) {
  const on = grpOn[grp];
  return (
    <div className="mb-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-[13px] font-extrabold text-[#1F3A5F]">{label}</span>
        <div className={`relative ml-auto h-5 w-9 cursor-pointer rounded-full transition-colors ${on ? 'bg-green-600' : 'bg-gray-300'}`} onClick={() => onToggle(grp)}>
          <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
        </div>
      </div>
      {on ? (
        <div>
          {draft[grp].map((r, i) => (
            <div key={i} className="relative mb-2.5 rounded-lg bg-gray-50 px-3 py-2.5 pr-9">
              <button className="absolute right-2 top-2 h-6 w-6 rounded-md bg-red-100 font-extrabold text-red-600" onClick={() => onDel(grp, i)}>×</button>
              <input placeholder="SKU Code" value={r.sku || ''} onChange={(e) => onField(grp, i, 'sku', e.target.value)} className="mb-1.5 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[13px]" />
              <input placeholder="SKU Name" value={r.name || ''} onChange={(e) => onField(grp, i, 'name', e.target.value)} className="mb-1.5 w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[13px]" />
              <input placeholder="SKU Link (optional)" value={r.link || ''} onChange={(e) => onField(grp, i, 'link', e.target.value)} className="w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[13px]" />
            </div>
          ))}
          <button className="w-full rounded-md border border-dashed border-blue-500 bg-white py-1.5 text-[12.5px] font-semibold text-blue-600" onClick={() => onAdd(grp)}>+ Add {label.toLowerCase()} SKU</button>
        </div>
      ) : null}
    </div>
  );
}
