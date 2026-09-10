'use client';

import { AuditOrder } from '../types';
import { categoriesAreFromStore, mapUrl, orderCategories } from '../utils';

export function Empty({ cols, msg }: { cols: number; msg: string }) {
  return <tr><td colSpan={cols} className="border-t border-gray-100 py-8 text-center text-[13px] text-gray-400">{msg}</td></tr>;
}

export function Head({ title, sub, right }: { title: string; sub: string; right?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        <p className="mt-0.5 text-[13px] text-gray-500">{sub}</p>
      </div>
      {right ? <div className="ml-auto flex gap-2">{right}</div> : null}
    </div>
  );
}

export function Customer({ o }: { o: AuditOrder }) {
  return <div><b>{o.name || '—'}</b><div className="text-gray-500">{o.phone}</div></div>;
}

export function Cats({ o }: { o: AuditOrder }) {
  const cats = orderCategories(o);
  if (!cats.length) return <span className="text-gray-400">—</span>;
  return (
    <span className="flex flex-wrap gap-1" title={categoriesAreFromStore(o) ? 'From the store pre-booking' : undefined}>
      {cats.map((c) => <span key={c} className="rounded bg-yellow-50 px-1.5 py-0.5 text-[10px] font-bold text-yellow-800">{c}</span>)}
    </span>
  );
}

export function Addr({ o }: { o: AuditOrder }) {
  return o.addr
    ? <a className="text-blue-600" href={mapUrl(o.addr)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>{o.addr}</a>
    : <span className="text-gray-400">—</span>;
}
