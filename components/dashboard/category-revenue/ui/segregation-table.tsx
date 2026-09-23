'use client';

import { SEGREGATION_ACCENT, SEGREGATION_BUCKET, SEGREGATION_NOTE } from '../constants';
import { BucketResult, Metrics, SegregationTable, StoreTarget } from '../types';
import { fmtFull, fmtShort, pctOfTarget, pctStr, ZERO_METRICS } from '../utils';

function TargetCell({ actual, target }: { actual: number | null; target: number }) {
  const pct = pctOfTarget(actual, target);
  if (!pct) {
    return (
      <td className="px-3 py-2 text-right font-mono text-gray-300" title={target > 0 ? undefined : 'No target set for this month'}>—</td>
    );
  }
  return (
    <td className={`px-3 py-2 text-right font-mono font-semibold ${(actual as number) >= target ? 'text-green-600' : 'text-gray-600'}`}>
      {pct}
      <span className="text-gray-400 font-normal">{' '}of {fmtShort(target)}</span>
    </td>
  );
}

function MetricCells({ m }: { m: Metrics }) {
  return (
    <>
      <td className="px-3 py-2 text-right font-mono text-gray-300">—</td>
      <td className="px-3 py-2 text-right font-mono text-gray-700">{m.carts.toLocaleString('en-IN')}</td>
      <td className="px-3 py-2 text-right font-mono text-gray-700">{m.orders.toLocaleString('en-IN')}</td>
      <td className="px-3 py-2 text-right font-mono text-gray-900 font-semibold">{fmtFull(m.revenue)}</td>
      <td className="px-3 py-2 text-right font-mono text-gray-700">{pctStr(m.orders, m.carts)}</td>
    </>
  );
}

export function SegregationSection({ table, result, stores, loading, targetFor, targetNote }: {
  table: SegregationTable;
  result: BucketResult | undefined;
  stores: string[];
  loading: boolean;
  targetFor: ((store: string) => StoreTarget) | null;
  targetNote: string;
}) {
  const unmatched = table.rows.filter(r => r.unmatched);
  const bucket = SEGREGATION_BUCKET[table.segregation];
  const cols = targetFor ? 7 : 6;
  const targetTotal = targetFor ? stores.reduce((s, store) => s + (targetFor(store)[bucket] || 0), 0) : 0;
  const storesRevenue = result ? stores.reduce((s, store) => s + (result.byStore[store]?.revenue ?? 0), 0) : 0;
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2 flex-wrap">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: SEGREGATION_ACCENT[table.segregation] }} />
        <h3 className="text-[13px] font-bold text-gray-900">{table.segregation}</h3>
        <span className="text-[11px] text-gray-400">{SEGREGATION_NOTE[table.segregation]}</span>
      </div>

      <div className="flex flex-wrap gap-1 mb-2">
        {table.rows.map(r => (
          <span
            key={r.name}
            className={`text-[10px] rounded px-1.5 py-0.5 border ${
              r.unmatched
                ? 'bg-amber-50 text-amber-700 border-amber-200'
                : 'bg-gray-50 text-gray-600 border-gray-200'
            }`}
          >
            {r.name}{r.unmatched ? ' · not a CRM category' : ''}
          </span>
        ))}
        {table.rows.length === 0 && <span className="text-[11px] text-gray-400">No categories in this segregation</span>}
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">Store</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400">Distinct Clients</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400">Carts</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400">Orders</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400">Revenue</th>
                <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400">Order Conv %</th>
                {targetFor && (
                  <th className="px-3 py-2 text-right text-[10px] font-semibold uppercase tracking-wider text-gray-400" title={targetNote}>% of Target</th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={cols} className="px-4 py-5 text-center text-[12px] text-gray-400">Loading…</td></tr>
              )}
              {!loading && !result && (
                <tr><td colSpan={cols} className="px-4 py-5 text-center text-[12px] text-gray-400">Unknown — the request for this segregation did not return</td></tr>
              )}
              {!loading && result && stores.map(store => (
                <tr key={store} className="border-b border-gray-50 hover:bg-gray-50/60">
                  <td className="px-4 py-2 text-gray-800">{store}</td>
                  <MetricCells m={result.byStore[store] ?? ZERO_METRICS} />
                  {targetFor && (
                    <TargetCell
                      actual={(result.byStore[store] ?? ZERO_METRICS).revenue}
                      target={targetFor(store)[bucket] || 0}
                    />
                  )}
                </tr>
              ))}
            </tbody>
            {!loading && result && (
              <tfoot>
                <tr className="bg-gray-50 border-t border-gray-200 font-bold text-gray-900">
                  <td className="px-4 py-2">{table.segregation} total</td>
                  <td className="px-3 py-2 text-right font-mono text-gray-300">—</td>
                  <td className="px-3 py-2 text-right font-mono">{result.overall.carts.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2 text-right font-mono">{result.overall.orders.toLocaleString('en-IN')}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtFull(result.overall.revenue)}</td>
                  <td className="px-3 py-2 text-right font-mono">{pctStr(result.overall.orders, result.overall.carts)}</td>
                  {targetFor && <TargetCell actual={storesRevenue} target={targetTotal} />}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {unmatched.length > 0 && (
        <div className="text-[11px] text-amber-700 mt-1.5">
          {unmatched.map(r => r.name).join(', ')}{' '}
          {unmatched.length === 1 ? 'is' : 'are'} on the segregation sheet but not a CRM category, so
          nothing above counts toward{' '}{unmatched.length === 1 ? 'it' : 'them'}.
        </div>
      )}
    </div>
  );
}
