'use client';

import { RankBadge, Th } from './ui';
import { fmtMoney, fmtNum, fmtPct } from '../utils/report-card';
import { PipelineCartRow, RankingRow, ReportCardData, WalkinRow } from '@/lib/mockApi';

export function WalkinTable({ w }: { w: ReportCardData['walkin_analysis'] }) {
  const total = w.total;
  const rows: { key: keyof ReportCardData['walkin_analysis']; label: string; sub: string; tint: string; color: string; row: WalkinRow }[] = [
    { key: 'total', label: 'Total Unique Walkins', sub: 'All footfall attended · date range', tint: 'bg-amber-50/40', color: 'text-amber-600', row: w.total },
    { key: 'new', label: 'New Walkins', sub: 'First-time visitors', tint: 'bg-green-50/40', color: 'text-green-700', row: w.new },
    { key: 'old', label: 'Old Walkins', sub: 'Repeat visitors (2nd visit onwards)', tint: 'bg-blue-50/40', color: 'text-blue-700', row: w.old },
    { key: 'no_walkin', label: 'No Walkins', sub: 'Orders placed remotely without store visit', tint: '', color: 'text-gray-400', row: w.no_walkin },
  ];
  const pct = (n: number, d: number) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '0%');
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
      <table className="w-full min-w-[860px] border-collapse">
        <thead className="border-b border-gray-100">
          <tr>
            <Th>Walkin Type</Th><Th right>Walkins</Th><Th right>Carts Created</Th><Th right>Cart Creation %</Th>
            <Th right>Total Orders</Th><Th right>Total Sale Value</Th><Th right>Avg AOV</Th><Th right>Conversion %</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, label, sub, tint, color, row }) => (
            <tr key={key} className={`border-b border-gray-50 last:border-0 ${tint}`}>
              <td className="px-4 py-3">
                <div className={`text-[13px] font-bold ${key === 'total' ? 'text-gray-900' : color}`}>{label}</div>
                <div className="text-[11px] text-gray-400">{sub}</div>
              </td>
              <td className={`px-4 py-3 text-right font-mono text-[13px] font-semibold ${color}`}>
                {fmtNum(row.walkins)}
                {key !== 'total' && <div className="text-[10px] text-gray-400 font-normal">{pct(row.walkins, total.walkins)} of total</div>}
              </td>
              <td className={`px-4 py-3 text-right font-mono text-[13px] font-semibold ${color}`}>
                {fmtNum(row.carts_created)}
                {key !== 'total' && key !== 'no_walkin' && <div className="text-[10px] text-gray-400 font-normal">{pct(row.carts_created, total.carts_created)} of total carts</div>}
              </td>
              <td className={`px-4 py-3 text-right font-mono text-[13px] font-semibold ${color}`}>{fmtPct(row.cart_creation_pct)}</td>
              <td className={`px-4 py-3 text-right font-mono text-[13px] font-semibold ${color}`}>
                {fmtNum(row.total_orders)}
                {key !== 'total' && key !== 'no_walkin' && <div className="text-[10px] text-gray-400 font-normal">{pct(row.total_orders, total.total_orders)} of orders</div>}
              </td>
              <td className={`px-4 py-3 text-right font-mono text-[13px] font-semibold ${color}`}>
                {row.total_sale_value ? fmtMoney(row.total_sale_value) : '₹0'}
                {key !== 'total' && key !== 'no_walkin' && <div className="text-[10px] text-gray-400 font-normal">{pct(row.total_sale_value, total.total_sale_value)} of value</div>}
              </td>
              <td className={`px-4 py-3 text-right font-mono text-[13px] font-semibold ${color}`}>{row.avg_aov ? fmtMoney(row.avg_aov) : '—'}</td>
              <td className={`px-4 py-3 text-right font-mono text-[13px] font-semibold ${color}`}>{row.total_orders ? fmtPct(row.conversion_pct) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PipelineTable({ p }: { p: ReportCardData['pipeline_carts'] }) {
  const rows: { key: keyof ReportCardData['pipeline_carts']; label: string; sub: string; tint: string; color: string; row: PipelineCartRow }[] = [
    { key: 'total', label: 'Total Carts', sub: 'Open carts — not lost, not ordered', tint: 'bg-blue-50/30', color: 'text-blue-700', row: p.total },
    { key: 'active', label: 'Active Carts', sub: '0 – 7 days since last update', tint: 'bg-green-50/30', color: 'text-green-700', row: p.active },
    { key: 'warm', label: 'Warm Carts', sub: '8 – 14 days since last update', tint: 'bg-green-50/20', color: 'text-green-600', row: p.warm },
    { key: 'cold', label: 'Cold Carts', sub: '15 – 30 days since last update', tint: '', color: 'text-blue-600', row: p.cold },
    { key: 'dead', label: 'Dead Carts', sub: '> 30 days since last update', tint: 'bg-red-50/30', color: 'text-red-600', row: p.dead },
  ];
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white max-w-lg">
      <table className="w-full min-w-[420px] border-collapse">
        <thead className="border-b border-gray-100">
          <tr><Th>Cart Category</Th><Th right>No. of Carts</Th><Th right>Live Pipeline Value</Th></tr>
        </thead>
        <tbody>
          {rows.map(({ key, label, sub, tint, color, row }) => (
            <tr key={key} className={`border-b border-gray-50 last:border-0 ${tint}`}>
              <td className="px-4 py-3">
                <div className={`text-[13px] font-bold ${key === 'total' ? 'text-gray-900' : color}`}>{label}</div>
                <div className="text-[11px] text-gray-400">{sub}</div>
              </td>
              <td className={`px-4 py-3 text-right font-mono text-[13px] font-semibold ${color}`}>
                {fmtNum(row.count)}<div className="text-[10px] text-gray-400 font-normal">({row.count_pct}%)</div>
              </td>
              <td className={`px-4 py-3 text-right font-mono text-[13px] font-semibold ${color}`}>
                {fmtMoney(row.value)}<div className="text-[10px] text-gray-400 font-normal">({row.value_pct}%)</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function OrdersLostTable({ o }: { o: ReportCardData['orders_lost'] }) {
  return (
    <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white max-w-lg">
      <table className="w-full min-w-[420px] border-collapse">
        <thead className="border-b border-gray-100">
          <tr><Th>Reason</Th><Th right>No. of Orders Lost</Th><Th right>Value Lost</Th></tr>
        </thead>
        <tbody>
          <tr className="border-b border-gray-50 bg-red-50/40">
            <td className="px-4 py-3 text-[13px] font-bold text-red-600">Total Orders Lost</td>
            <td className="px-4 py-3 text-right font-mono text-[13px] font-bold text-red-600">{fmtNum(o.total.count)}<div className="text-[10px] text-gray-400 font-normal">(100%)</div></td>
            <td className="px-4 py-3 text-right font-mono text-[13px] font-bold text-red-600">{fmtMoney(o.total.value)}<div className="text-[10px] text-gray-400 font-normal">(100%)</div></td>
          </tr>
          {o.reasons.length === 0 && (
            <tr><td colSpan={3} className="px-4 py-6 text-center text-[12px] text-gray-400">No lost orders in range</td></tr>
          )}
          {o.reasons.map(r => (
            <tr key={r.key} className="border-b border-gray-50 last:border-0">
              <td className="px-4 py-3 text-[13px] text-gray-700">{r.label}</td>
              <td className="px-4 py-3 text-right font-mono text-[13px] font-semibold text-gray-800">{fmtNum(r.count)}<div className="text-[10px] text-gray-400 font-normal">({r.count_pct}%)</div></td>
              <td className="px-4 py-3 text-right font-mono text-[13px] font-semibold text-gray-800">{fmtMoney(r.value)}<div className="text-[10px] text-gray-400 font-normal">({r.value_pct}%)</div></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AvgWalkinCard({ label, bm, store, accent, range }: { label: string; bm: number; store: number; accent: string; range: string }) {
  return (
    <div className="flex-1 min-w-[220px] bg-white border border-gray-200 rounded-xl overflow-hidden">
      <div className="h-1" style={{ background: accent }} />
      <div className="p-4">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
        <div className="flex items-end gap-6 mt-2">
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">This BM</div>
            <div className="font-mono text-4xl font-bold" style={{ color: accent }}>{bm.toFixed(1)}</div>
          </div>
          <div className="pb-1 border-l border-gray-100 pl-6">
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">Store Avg</div>
            <div className="font-mono text-2xl font-bold text-gray-400">{store.toFixed(1)}</div>
          </div>
        </div>
        <div className="text-[10px] text-gray-400 mt-3">{range}</div>
      </div>
    </div>
  );
}

export function CrmAdherenceSection({ c, range }: { c: ReportCardData['crm_adherence']; range: string }) {
  const metrics = [
    { label: 'Follow Up Completion %', sub: "% of this BM's carts updated with a follow-up date", value: fmtPct(c.follow_up_completion_pct) },
    { label: 'User Info Completion %', sub: "% of this BM's carts with client details filled", value: fmtPct(c.user_info_completion_pct) },
    { label: 'TAT', sub: 'Avg. time from walkin to CRM entry', value: `${c.tat_hours} hrs` },
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="border border-gray-200 rounded-xl bg-white overflow-hidden">
        <table className="w-full border-collapse">
          <thead className="border-b border-gray-100"><tr><Th>CRM Metric</Th><Th right>Value</Th></tr></thead>
          <tbody>
            {metrics.map(m => (
              <tr key={m.label} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-3"><div className="text-[13px] font-semibold text-gray-800">{m.label}</div><div className="text-[11px] text-gray-400">{m.sub}</div></td>
                <td className="px-4 py-3 text-right font-mono text-[14px] font-bold text-green-600">{m.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-4 flex-wrap">
        <AvgWalkinCard label="Avg Weekday Walkin" bm={c.avg_weekday_walkin.bm} store={c.avg_weekday_walkin.store} accent="#3B82F6" range={`per weekday · ${range}`} />
        <AvgWalkinCard label="Avg Weekend Walkin" bm={c.avg_weekend_walkin.bm} store={c.avg_weekend_walkin.store} accent="#F59E0B" range={`per weekend day · ${range}`} />
      </div>
    </div>
  );
}

export function RankingTable({ title, rows, showStore }: { title: string; rows: RankingRow[]; showStore?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">{title}</div>
      <div className="overflow-x-auto border border-gray-200 rounded-xl bg-white">
        <table className="w-full min-w-[520px] border-collapse">
          <thead className="border-b border-gray-100">
            <tr>
              <Th>Rank</Th><Th>BM Name</Th>{showStore && <Th>Store</Th>}
              <Th right>Walkins</Th><Th right>Conv %</Th><Th right>Cart %</Th><Th right>Sale Value</Th><Th right>FU %</Th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={showStore ? 8 : 7} className="px-4 py-6 text-center text-[12px] text-gray-400">No data</td></tr>}
            {rows.map(r => (
              <tr key={`${r.rank}-${r.bm_name}`} className={`border-b border-gray-50 last:border-0 ${r.is_selected ? 'bg-amber-50/60' : ''}`}>
                <td className="px-4 py-2.5"><RankBadge rank={r.rank} /></td>
                <td className={`px-4 py-2.5 text-[13px] font-semibold ${r.is_selected ? 'text-amber-600' : 'text-gray-800'}`}>{r.bm_name}</td>
                {showStore && <td className="px-4 py-2.5 text-[12px] text-gray-400">{r.store}</td>}
                <td className={`px-4 py-2.5 text-right font-mono text-[12px] ${r.is_selected ? 'text-amber-600 font-semibold' : 'text-gray-700'}`}>{fmtNum(r.walkins)}</td>
                <td className={`px-4 py-2.5 text-right font-mono text-[12px] ${r.is_selected ? 'text-amber-600 font-semibold' : 'text-gray-700'}`}>{fmtPct(r.conv_pct)}</td>
                <td className={`px-4 py-2.5 text-right font-mono text-[12px] ${r.is_selected ? 'text-amber-600 font-semibold' : 'text-gray-700'}`}>{fmtPct(r.cart_pct)}</td>
                <td className={`px-4 py-2.5 text-right font-mono text-[12px] ${r.is_selected ? 'text-amber-600 font-semibold' : 'text-gray-700'}`}>{fmtMoney(r.sale_value)}</td>
                <td className={`px-4 py-2.5 text-right font-mono text-[12px] ${r.is_selected ? 'text-amber-600 font-semibold' : 'text-gray-700'}`}>{fmtPct(r.fu_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
