'use client';

import { fmtShortINR } from '../../../../models/mock-data';
import { FIRM_KIND_LABEL } from '@/lib/b2b/client-import/constants';
import type { RejectedFirm, ReviewFirm } from '@/lib/b2b/client-import/types';
import { Fragment } from 'react';

const day = (iso: string) => (iso
  ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
  : '—');

const KIND_CHIP: Record<ReviewFirm['kind'], string> = {
  company: 'bg-indigo-50 text-indigo-700',
  partnership: 'bg-teal-50 text-teal-700',
  proprietor: 'bg-amber-50 text-amber-800',
  other: 'bg-gray-100 text-gray-600',
};

const th = 'px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap';
const td = 'px-3 py-2 align-top';

function Detail({ f }: { f: ReviewFirm }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 text-[12px]">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Latest orders</p>
        {f.recent.map((o) => (
          <p key={o.id} className="text-gray-700">
            {day(o.at)} · {o.store} · <span className="font-mono">{fmtShortINR(o.value)}</span> · {o.status}
            <span className="text-gray-400 font-mono"> · {o.id}</span>
          </p>
        ))}
        {f.orders > f.recent.length && <p className="text-gray-400">and {f.orders - f.recent.length} earlier</p>}
      </div>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Numbers on these orders</p>
        {f.contacts.map((c) => (
          <p key={c.number} className="text-gray-700"><span className="font-mono">{c.number}</span>{c.name ? ` · ${c.name}` : ''}</p>
        ))}
        <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mt-2 mb-1">Stores</p>
        <p className="text-gray-700">{f.stores.map((s) => `${s.name} (${s.orders})`).join(', ')}</p>
        <p className="text-gray-400 mt-2">First order {day(f.firstOrder)}</p>
      </div>
    </div>
  );
}

export function ReviewTable({ rows, picked, onPick, onPickPage, open, onOpen, onUndo }: {
  rows: (ReviewFirm | RejectedFirm)[];
  picked?: Set<string>;
  onPick: (key: string) => void;
  onPickPage: () => void;
  open: string | null;
  onOpen: (key: string | null) => void;
  onUndo?: (key: string) => void;
}) {
  const allOnPage = !!picked && rows.length > 0 && rows.every((f) => picked.has(f.key));
  const cols = 7 + (picked ? 1 : 0) + (onUndo ? 1 : 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50/60">
            {picked && <th className="pl-3 w-6"><input type="checkbox" checked={allOnPage} onChange={onPickPage} aria-label="Select this page" /></th>}
            {['Firm', 'Type', 'Number', 'Orders', 'Value', 'Last order', 'Stores'].map((h) => <th key={h} className={th}>{h}</th>)}
            {onUndo && <th className={th}>Marked</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((f) => {
            const expanded = open === f.key;
            const decision = 'decision' in f ? f.decision : null;
            return (
              <Fragment key={f.key}>
                <tr
                  onClick={() => onOpen(expanded ? null : f.key)}
                  className={`border-b border-gray-50 cursor-pointer hover:bg-gray-50 ${picked?.has(f.key) ? 'bg-teal-50/40' : ''}`}
                >
                  {picked && (
                    <td className="pl-3 align-top pt-2.5" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={picked.has(f.key)} onChange={() => onPick(f.key)} aria-label={`Select ${f.name}`} />
                    </td>
                  )}
                  <td className={td}>
                    <p className="font-semibold text-gray-800">{f.name}</p>
                    <p className="text-[10.5px] text-gray-400 font-mono">{f.gstins.join(', ')} · {f.state}</p>
                  </td>
                  <td className={td}>
                    <span className={`px-1.5 py-0.5 rounded text-[10.5px] font-semibold whitespace-nowrap ${KIND_CHIP[f.kind]}`}>{FIRM_KIND_LABEL[f.kind]}</span>
                  </td>
                  <td className={`${td} font-mono whitespace-nowrap`}>
                    {f.contacts[0].number}
                    {f.contacts.length > 1 && <span className="text-gray-400"> +{f.contacts.length - 1}</span>}
                  </td>
                  <td className={`${td} text-right`}>{f.orders}</td>
                  <td className={`${td} text-right font-mono whitespace-nowrap`}>{fmtShortINR(f.value)}</td>
                  <td className={`${td} whitespace-nowrap`}>{day(f.lastOrder)}</td>
                  <td className={`${td} text-gray-600`}>
                    {f.stores.slice(0, 2).map((s) => s.name).join(', ')}
                    {f.stores.length > 2 && <span className="text-gray-400"> +{f.stores.length - 2}</span>}
                  </td>
                  {onUndo && decision && (
                    <td className={`${td} whitespace-nowrap`} onClick={(e) => e.stopPropagation()}>
                      <span className="text-gray-500">{decision.decided_by}, {day(decision.decided_at)}</span>
                      <button onClick={() => onUndo(f.key)} className="ml-2 text-[11px] font-semibold text-[#0F766E] hover:underline">Undo</button>
                    </td>
                  )}
                </tr>
                {expanded && (
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <td colSpan={cols} className="px-4 py-3"><Detail f={f} /></td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
