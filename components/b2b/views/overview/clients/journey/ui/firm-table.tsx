'use client';

import type { FirmRow, Journey, JourneyPath } from '@/lib/b2b/revenue/journey';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { fmtL } from '../../../../../models/mock-data';
import { COLOR, FIRM_PAGE, PATH_COLOR, PATH_HINT, PATH_LABEL } from '../constants';
import { FirmFocus, fmtK, inFocus, monthName, signedL } from '../utils';

type Sort = 'drop' | 'gain' | 'a' | 'b';

const SORTS: [Sort, string][] = [['drop', 'Biggest drop'], ['gain', 'Biggest gain'], ['a', 'Biggest in first month'], ['b', 'Biggest in second month']];

const PATH_ORDER: JourneyPath[] = ['stayedStudio', 'ecToStudio', 'stayedEc', 'studioToEc', 'lostStudio', 'lostEc', 'new', 'revived', 'returning', 'storeBuyer'];

function Spark({ values, keys, a, b }: { values: number[]; keys: string[]; a: string; b: string }) {
  const top = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-[3px] h-6" title={keys.map((k, i) => `${monthName(k)} ${fmtL(values[i])}`).join(' · ')}>
      {values.map((v, i) => (
        <div
          key={keys[i]}
          className="w-[7px] rounded-t-[2px]"
          style={{ height: `${Math.max(v ? 3 : 1, (24 * v) / top)}px`, background: v ? COLOR.studio : '#E5E7EB', opacity: keys[i] === a || keys[i] === b ? 1 : 0.45 }}
        />
      ))}
    </div>
  );
}

function Chip({ path }: { path: JourneyPath }) {
  return (
    <span title={PATH_HINT[path]} className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-gray-700 whitespace-nowrap">
      <span className="w-2 h-2 rounded-full" style={{ background: PATH_COLOR[path] }} />
      {PATH_LABEL[path]}
    </span>
  );
}

function Detail({ r, keys }: { r: FirmRow; keys: string[] }) {
  return (
    <div className="grid sm:grid-cols-3 gap-4 text-[11.5px]">
      <div>
        <div className="font-semibold text-gray-500 mb-1">Every month</div>
        {keys.map((k, i) => (
          <div key={k} className="flex justify-between tabular-nums"><span className="text-gray-500">{monthName(k, true)}</span><span className="text-gray-800">{r.spark[i] ? fmtL(r.spark[i]) : '—'}</span></div>
        ))}
      </div>
      <div>
        <div className="font-semibold text-gray-500 mb-1">Categories</div>
        <div className="text-gray-700"><span className="text-gray-400">First month:</span> {r.a.categories.join(', ') || '—'}</div>
        <div className="text-gray-700 mt-1"><span className="text-gray-400">Second month:</span> {r.b.categories.join(', ') || '—'}</div>
      </div>
      <div>
        <div className="font-semibold text-gray-500 mb-1">Who holds it</div>
        <div className="text-gray-700">{r.owner || 'No B2B person on its orders'}</div>
        <div className="text-gray-500 mt-1">{r.source || '—'}</div>
        <div className="text-gray-500 mt-1">{PATH_HINT[r.path]}</div>
      </div>
    </div>
  );
}

export function FirmTable({ journey, focus, onFocus }: { journey: Journey; focus: FirmFocus | null; onFocus: (f: FirmFocus | null) => void }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('drop');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | null>(null);
  const keys = journey.months.map((m) => m.key);
  const a = monthName(journey.a);
  const b = monthName(journey.b);

  const visible = useMemo(
    () => journey.firms.filter((r) => focus || r.a.value || r.b.value),
    [journey.firms, focus],
  );
  const counts = useMemo(() => {
    const c = new Map<JourneyPath, number>();
    for (const r of visible) c.set(r.path, (c.get(r.path) ?? 0) + 1);
    return c;
  }, [visible]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = visible.filter((r) => inFocus(r, focus) && (!q || r.name.toLowerCase().includes(q) || r.owner.toLowerCase().includes(q)));
    const by: Record<Sort, (x: FirmRow, y: FirmRow) => number> = {
      drop: (x, y) => x.delta - y.delta,
      gain: (x, y) => y.delta - x.delta,
      a: (x, y) => y.a.value - x.a.value,
      b: (x, y) => y.b.value - x.b.value,
    };
    return [...list].sort(by[sort]);
  }, [visible, focus, query, sort]);
  useEffect(() => { setPage(0); }, [focus, query, sort, journey]);

  const pages = Math.max(1, Math.ceil(rows.length / FIRM_PAGE));
  const start = page * FIRM_PAGE;
  const shown = rows.slice(start, start + FIRM_PAGE);
  const sumA = rows.reduce((n, r) => n + r.a.value, 0);
  const sumB = rows.reduce((n, r) => n + r.b.value, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a firm or a person"
          className="h-8 w-56 rounded-lg border border-gray-200 px-2.5 text-[12px] outline-none focus:border-gray-400"
        />
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-8 rounded-lg border border-gray-200 px-2 text-[12px] bg-white cursor-pointer">
          {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
        {focus && (
          <button onClick={() => onFocus(null)} className="h-8 inline-flex items-center gap-1.5 rounded-lg bg-gray-900 text-white px-2.5 text-[11.5px] font-semibold cursor-pointer">
            {focus.label} <span aria-hidden>×</span>
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {PATH_ORDER.filter((p) => counts.get(p)).map((p) => {
          const active = focus?.kind === 'path' && focus.path === p;
          return (
            <button
              key={p}
              onClick={() => onFocus(active ? null : { kind: 'path', path: p, label: PATH_LABEL[p] })}
              title={PATH_HINT[p]}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold cursor-pointer ${active ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
            >
              <span className="w-2 h-2 rounded-full" style={{ background: PATH_COLOR[p] }} />
              {PATH_LABEL[p]} <span className={active ? 'text-gray-300' : 'text-gray-400'}>{counts.get(p)}</span>
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[880px]">
          <thead>
            <tr className="text-left text-[10.5px] text-gray-400 border-b border-gray-100">
              <th className="py-1.5 pr-3 font-semibold">Firm</th>
              <th className="py-1.5 pr-3 font-semibold">Journey</th>
              <th className="py-1.5 pr-3 font-semibold text-right">{a}</th>
              <th className="py-1.5 pr-3 font-semibold text-right">{b}</th>
              <th className="py-1.5 pr-3 font-semibold text-right">Change</th>
              <th className="py-1.5 pr-3 font-semibold text-right">Avg order</th>
              <th className="py-1.5 pr-3 font-semibold">Trend</th>
              <th className="py-1.5 font-semibold">Categories</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <Fragment key={r.key}>
                <tr onClick={() => setOpen(open === r.key ? null : r.key)} className={`border-b border-gray-50 cursor-pointer align-top ${open === r.key ? 'bg-gray-50' : 'hover:bg-gray-50'}`}>
                  <td className="py-2 pr-3 max-w-[220px]">
                    <div className="font-semibold text-gray-800 truncate" title={r.name}>{r.name}</div>
                    <div className="text-[10.5px] text-gray-400 truncate">{r.owner || 'No B2B person'}</div>
                  </td>
                  <td className="py-2 pr-3"><Chip path={r.path} /></td>
                  <td className="py-2 pr-3 text-right tabular-nums text-gray-700">{r.a.value ? fmtL(r.a.value) : '—'}<div className="text-[10px] text-gray-400">{r.a.orders} {r.a.orders === 1 ? 'order' : 'orders'}</div></td>
                  <td className="py-2 pr-3 text-right tabular-nums text-gray-700">{r.b.value ? fmtL(r.b.value) : '—'}<div className="text-[10px] text-gray-400">{r.b.orders} {r.b.orders === 1 ? 'order' : 'orders'}</div></td>
                  <td className={`py-2 pr-3 text-right tabular-nums font-semibold ${r.delta < 0 ? 'text-red-700' : r.delta > 0 ? 'text-emerald-700' : 'text-gray-400'}`}>{r.delta ? signedL(r.delta) : '—'}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-gray-600 whitespace-nowrap">{r.a.aov ? fmtK(r.a.aov) : '—'} → {r.b.aov ? fmtK(r.b.aov) : '—'}</td>
                  <td className="py-2 pr-3"><Spark values={r.spark} keys={keys} a={journey.a} b={journey.b} /></td>
                  <td className="py-2 text-[10.5px] max-w-[240px]">
                    {r.stopped.length > 0 && <div className="text-red-700 truncate" title={r.stopped.join(', ')}>Stopped: {r.stopped.join(', ')}</div>}
                    {r.started.length > 0 && <div className="text-emerald-700 truncate" title={r.started.join(', ')}>Started: {r.started.join(', ')}</div>}
                    {!r.stopped.length && !r.started.length && <span className="text-gray-400 truncate">{r.b.categories.slice(0, 3).join(', ') || '—'}</span>}
                  </td>
                </tr>
                {open === r.key && (
                  <tr className="bg-gray-50 border-b border-gray-100"><td colSpan={8} className="px-3 py-3"><Detail r={r} keys={keys} /></td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p className="text-[12px] text-gray-400 py-4">No firms match.</p>}
      <div className="flex items-center justify-between mt-2 text-[11px] text-gray-500 flex-wrap gap-2">
        <span className="tabular-nums">
          {rows.length ? `Showing ${start + 1}–${Math.min(start + FIRM_PAGE, rows.length)} of ${rows.length}` : ''}
          {rows.length > 0 && <> · these firms: {fmtL(sumA)} in {a} → {fmtL(sumB)} in {b}</>}
        </span>
        <div className="flex gap-2">
          <button onClick={() => setPage((p) => p - 1)} disabled={page === 0} className="px-2 py-1 border border-gray-200 rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-default">Prev</button>
          <button onClick={() => setPage((p) => p + 1)} disabled={page >= pages - 1} className="px-2 py-1 border border-gray-200 rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-default">Next</button>
        </div>
      </div>
    </div>
  );
}
