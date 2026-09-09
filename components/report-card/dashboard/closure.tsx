'use client';

import { CLOSURE_PAGE_SIZE } from '../constants/report-card';
import { MultiDropdown } from './dropdowns';
import { PhoneCell, Th, stagePill } from './ui';
import { fmtDate, fmtDateShort, fmtMoney } from '../utils/report-card';
import { ClosureClient } from '@/lib/mockApi';
import { useEffect, useMemo, useState } from 'react';

export function ClosurePipelineSection({
  clients, catOptions,
}: { clients: ClosureClient[]; catOptions: string[] }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [cat, setCat] = useState<string[]>([]);
  const [stage, setStage] = useState<string[]>([]);
  const [min, setMin] = useState('');
  const [max, setMax] = useState('');

  const filtered = useMemo(() => {
    const catLower = cat.map(x => x.toLowerCase());
    return clients.filter(c => {
      if (from && c.closure_date < from) return false;
      if (to && c.closure_date > to) return false;
      if (catLower.length && !c.categories.some(x => catLower.includes(x.toLowerCase()))) return false;
      if (stage.length && !stage.includes(c.stage)) return false;
      const vL = c.cart_value / 100000;
      if (min && vL < parseFloat(min)) return false;
      if (max && vL > parseFloat(max)) return false;
      return true;
    });
  }, [clients, from, to, cat, stage, min, max]);

  const totalPipeline = filtered.reduce((s, c) => s + c.cart_value, 0);

  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [from, to, cat, stage, min, max, clients]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / CLOSURE_PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const pageRows = filtered.slice((pageClamped - 1) * CLOSURE_PAGE_SIZE, pageClamped * CLOSURE_PAGE_SIZE);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Closure Date</span>
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] text-gray-700" />
        <span className="text-gray-300">—</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border border-gray-200 rounded-lg px-2 py-1.5 text-[12px] text-gray-700" />
        <MultiDropdown values={cat} placeholder="All Categories" onChange={setCat}
          options={catOptions.map(c => ({ label: c, value: c }))} searchable />
        <MultiDropdown values={stage} placeholder="All Stages" onChange={setStage}
          options={(['HOT', 'WARM', 'COLD', 'DEAD'] as const).map(s => ({ label: s, value: s }))} />
        <input value={min} onChange={e => setMin(e.target.value)} placeholder="Min" className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-[12px]" />
        <span className="text-gray-300 text-[11px]">Cart Value (L) —</span>
        <input value={max} onChange={e => setMax(e.target.value)} placeholder="Max" className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-[12px]" />
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
        <table className="w-full min-w-[980px] border-collapse">
          <thead className="border-b border-gray-100">
            <tr>
              <Th>Client Name</Th><Th>Phone</Th><Th>Categories</Th><Th>Closure Date</Th>
              <Th right>Cart Value</Th><Th>BM</Th><Th>Store</Th><Th>Stage</Th><Th>Last Follow-up</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-[12px] text-gray-400">No clients match these filters</td></tr>
            )}
            {pageRows.map((c, i) => (
              <tr key={`${c.phone}-${(pageClamped - 1) * CLOSURE_PAGE_SIZE + i}`} className={`border-b border-gray-50 last:border-0 ${c.stage === 'HOT' ? 'bg-red-50/20' : ''}`}>
                <td className="px-4 py-3 text-[13px] font-semibold text-gray-800">{c.client_name}</td>
                <td className="px-4 py-3"><PhoneCell phone={c.phone} /></td>
                <td className="px-4 py-3 text-[12px] text-gray-600">{c.categories.join(' · ') || '—'}</td>
                <td className="px-4 py-3 text-[12px] font-mono text-gray-700">{fmtDate(c.closure_date)}</td>
                <td className="px-4 py-3 text-right font-mono text-[12px] font-semibold text-gray-800">{fmtMoney(c.cart_value)}</td>
                <td className="px-4 py-3 text-[12px] text-gray-600">{c.bm}</td>
                <td className="px-4 py-3 text-[12px] text-gray-600">{c.store}</td>
                <td className="px-4 py-3"><span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wide ${stagePill[c.stage]}`}>{c.stage}</span></td>
                <td className="px-4 py-3 text-[12px] font-mono text-gray-500">{fmtDateShort(c.last_followup)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] text-gray-400">
          {filtered.length === 0
            ? 'No clients'
            : `Showing ${(pageClamped - 1) * CLOSURE_PAGE_SIZE + 1}–${Math.min(pageClamped * CLOSURE_PAGE_SIZE, filtered.length)} of ${filtered.length}`}
          {' · '}Total pipeline: {fmtMoney(totalPipeline)}
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={pageClamped <= 1}
              className="px-2.5 py-1 text-[12px] rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50">
              Prev
            </button>
            <span className="text-[11px] text-gray-500 px-1">Page {pageClamped} of {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={pageClamped >= totalPages}
              className="px-2.5 py-1 text-[12px] rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50">
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
