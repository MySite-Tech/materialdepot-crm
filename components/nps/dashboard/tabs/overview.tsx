'use client';

import { C } from '../constants';
import { Metrics } from '../types';
import { fmtSigned } from '../utils';
import { ChartCard, Delta, EmptyChart, KpiTile } from '../ui';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export function NpsOverviewTab({ bmChartData, chartHeight, cur, dist, distHasData, mixData, prev, reasonData, responseTotals, storeNpsData, storeResponseData, trend, trendHasData }: {
  bmChartData: { bm: string; nps: number; count: number; }[];
  chartHeight: number;
  cur: Metrics;
  dist: { score: number; count: number; }[];
  distHasData: boolean;
  mixData: { store: string; nps: number | null; count: number; promoter: number; passive: number; detractor: number; }[];
  prev: Metrics;
  reasonData: { data: { reason: string; value: number; }[]; hasData: boolean; max: number; };
  responseTotals: { footfalls: number; responses: number; pending: number; rate: number; };
  storeNpsData: { store: string; nps: number; count: number; }[];
  storeResponseData: { store: string; footfalls: number; responses: number; pending: number; rate: number; }[];
  trend: { date: string; nps: number | null; responses: number; }[];
  trendHasData: boolean;
}) {
  return (
    <div className="mt-5 space-y-5">
    
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiTile label="NPS Score" accent={C.line}
          value={cur.nps == null ? '—' : fmtSigned(cur.nps)}
          valueClass={cur.nps == null ? '' : cur.nps >= 0 ? 'text-green-600' : 'text-red-600'}
          delta={<Delta cur={cur.nps} prev={prev.nps} unit=" pts" dir={1} />} />
        <KpiTile label="Avg Score" accent={C.bm}
          value={cur.avg == null ? '—' : cur.avg.toFixed(1)}
          delta={<Delta cur={cur.avg} prev={prev.avg} dec={1} dir={1} />} />
        <KpiTile label="Total Responses" accent="#14B8A6"
          value={String(cur.total)}
          delta={<Delta cur={cur.total} prev={prev.total} dir={1} />} />
        <KpiTile label="Conversion %" accent={C.passive}
          value={cur.responseRate == null ? '—' : `${cur.responseRate}%`}
          delta={<Delta cur={cur.responseRate} prev={prev.responseRate} unit=" pp" dir={1} />} />
        <KpiTile label="Promoters" accent={C.promoter}
          value={cur.promoterPct == null ? '—' : `${cur.promoterPct}%`}
          valueClass="text-green-600"
          delta={<Delta cur={cur.promoterPct} prev={prev.promoterPct} unit=" pp" dir={1} />} />
        <KpiTile label="Detractors" accent={C.detractor}
          value={cur.detractorPct == null ? '—' : `${cur.detractorPct}%`}
          valueClass="text-red-600"
          delta={<Delta cur={cur.detractorPct} prev={prev.detractorPct} unit=" pp" dir={-1} />} />
      </div>
    
      <ChartCard title="Daily NPS trend" caption="Net Promoter Score by day, for the selected filters">
        {trendHasData ? (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trend} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} minTickGap={20} />
              <YAxis domain={[-100, 100]} ticks={[-100, -50, 0, 50, 100]} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
              <ReferenceLine y={0} stroke="#D1D5DB" />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                formatter={(v: unknown, n: unknown) => [n === 'nps' ? (v == null ? 'no data' : fmtSigned(Number(v))) : v as number, n === 'nps' ? 'NPS' : 'Responses']} />
              <Line type="monotone" dataKey="nps" stroke={C.line} strokeWidth={2} dot={{ r: 2.5, fill: C.line }} activeDot={{ r: 5 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : <EmptyChart msg="No completed responses in this range." />}
      </ChartCard>
    
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
    
        <ChartCard title="NPS by store" caption="Sorted highest to lowest">
          {storeNpsData.length ? (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={storeNpsData} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={C.grid} />
                <XAxis type="number" domain={[-100, 100]} ticks={[-100, -50, 0, 50, 100]} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="store" width={90} tick={{ fontSize: 12, fill: '#374151' }} tickLine={false} axisLine={false} />
                <ReferenceLine x={0} stroke="#D1D5DB" />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                  formatter={(v: unknown) => [fmtSigned(Number(v)), 'NPS']} />
                <Bar dataKey="nps" radius={[3, 3, 3, 3]} barSize={18} isAnimationActive={false}>
                  {storeNpsData.map((d, i) => <Cell key={i} fill={d.nps >= 0 ? C.promoter : C.detractor} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart msg="No data for this selection." />}
        </ChartCard>
    
        <ChartCard title="NPS by BM (salesperson)" caption="Top 10 by response volume">
          {bmChartData.length ? (
            <ResponsiveContainer width="100%" height={Math.max(160, bmChartData.length * 42 + 20)}>
              <BarChart data={bmChartData} layout="vertical" margin={{ top: 4, right: 28, left: 8, bottom: 0 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke={C.grid} />
                <XAxis type="number" domain={[-100, 100]} ticks={[-100, -50, 0, 50, 100]} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="bm" width={90} tick={{ fontSize: 12, fill: '#374151' }} tickLine={false} axisLine={false} />
                <ReferenceLine x={0} stroke="#D1D5DB" />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                  formatter={(v: unknown) => [fmtSigned(Number(v)), 'NPS']} />
                <Bar dataKey="nps" radius={[3, 3, 3, 3]} barSize={18} isAnimationActive={false}>
                  {bmChartData.map((d, i) => <Cell key={i} fill={d.nps >= 0 ? C.promoter : C.detractor} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart msg="No data for this selection." />}
        </ChartCard>
      </div>
    
      <ChartCard title="Conversion by store" caption="Unique customers who reviewed vs unique footfall · sorted highest to lowest">
        {storeResponseData.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="px-4 py-2.5">Store</th>
                  <th className="px-4 py-2.5 text-right">Customers</th>
                  <th className="px-4 py-2.5 text-right">Reviews</th>
                  <th className="px-4 py-2.5 text-right">Pending</th>
                  <th className="px-4 py-2.5 text-right">Conversion %</th>
                  <th className="px-4 py-2.5 w-[180px]"></th>
                </tr>
              </thead>
              <tbody>
                {storeResponseData.map(d => (
                  <tr key={d.store} className="border-b border-gray-50 last:border-0">
                    <td className="px-4 py-3 text-[13.5px] font-semibold text-gray-900">{d.store}</td>
                    <td className="px-4 py-3 text-[13.5px] text-gray-600 text-right tabular-nums">{d.footfalls}</td>
                    <td className="px-4 py-3 text-[13.5px] text-gray-900 font-semibold text-right tabular-nums">{d.responses}</td>
                    <td className="px-4 py-3 text-[13.5px] text-gray-500 text-right tabular-nums">{d.pending}</td>
                    <td className={`px-4 py-3 text-[13.5px] font-bold text-right tabular-nums ${d.rate >= 70 ? 'text-green-600' : d.rate >= 40 ? 'text-amber-600' : 'text-red-600'}`}>{d.rate}%</td>
                    <td className="px-4 py-3">
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${d.rate}%`, background: d.rate >= 70 ? C.promoter : d.rate >= 40 ? C.passive : C.detractor }} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50/60">
                  <td className="px-4 py-3 text-[13.5px] font-bold text-gray-900">Total</td>
                  <td className="px-4 py-3 text-[13.5px] font-semibold text-gray-700 text-right tabular-nums">{responseTotals.footfalls}</td>
                  <td className="px-4 py-3 text-[13.5px] font-bold text-gray-900 text-right tabular-nums">{responseTotals.responses}</td>
                  <td className="px-4 py-3 text-[13.5px] font-semibold text-gray-600 text-right tabular-nums">{responseTotals.pending}</td>
                  <td className="px-4 py-3 text-[13.5px] font-bold text-gray-900 text-right tabular-nums">{responseTotals.rate}%</td>
                  <td className="px-4 py-3"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : <EmptyChart msg="No footfalls in this selection." />}
      </ChartCard>
    
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
    
        <ChartCard title="Score distribution" caption="Count of responses per 0–10 rating">
          {distHasData ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dist} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke={C.grid} />
                <XAxis dataKey="score" tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: C.axis }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.03)' }} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                  formatter={(v: unknown) => [v as number, 'Responses']} labelFormatter={(l: unknown) => `Score ${l}`} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {dist.map((d, i) => <Cell key={i} fill={d.score >= 9 ? C.promoter : d.score >= 7 ? C.passive : C.detractor} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyChart msg="No completed responses in this selection." />}
          <div className="flex gap-4 mt-3 text-[12px] text-gray-500">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.promoter }} />Promoter (9–10)</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.passive }} />Passive (7–8)</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.detractor }} />Detractor (0–6)</span>
          </div>
        </ChartCard>
    
        <ChartCard title="Why we didn't understand the requirement" caption="Among responses where Q2 = No">
          {reasonData.hasData ? (
            <div className="space-y-3 pt-1">
              {reasonData.data.map(d => (
                <div key={d.reason} className="flex items-center gap-3">
                  <div className="w-[180px] shrink-0 text-[12.5px] text-gray-700 font-medium text-right">{d.reason}</div>
                  <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(d.value / reasonData.max) * 100}%`, background: C.line }} />
                  </div>
                  <div className="w-8 text-[13px] font-semibold text-gray-700 tabular-nums text-right">{d.value}</div>
                </div>
              ))}
            </div>
          ) : <EmptyChart msg={'No "No" responses in this selection.'} />}
        </ChartCard>
      </div>
    
      <ChartCard title="Response mix by store" caption="Share of promoters, passives and detractors per store · sorted by net sentiment">
        {mixData.length ? (
          <>
            <div className="space-y-3 pt-1">
              {mixData.map(d => {
                const total = d.promoter + d.passive + d.detractor;
                const seg = (n: number) => (total ? (n / total) * 100 : 0);
                const cells: { v: number; bg: string; tx: string }[] = [
                  { v: seg(d.promoter), bg: C.promoter, tx: '#fff' },
                  { v: seg(d.passive), bg: C.passive, tx: '#3a2c00' },
                  { v: seg(d.detractor), bg: C.detractor, tx: '#fff' },
                ];
                return (
                  <div key={d.store} className="flex items-center gap-3">
                    <div className="w-[90px] shrink-0 text-[12.5px] text-gray-700 font-semibold text-right">{d.store}</div>
                    <div className="flex-1 h-7 rounded-md overflow-hidden flex">
                      {cells.map((c, i) => c.v > 0 && (
                        <div key={i} className="h-full flex items-center justify-center text-[11px] font-bold" style={{ width: `${c.v}%`, background: c.bg, color: c.tx }}>
                          {c.v >= 12 ? `${Math.round(c.v)}%` : ''}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 mt-4 text-[12px] text-gray-500">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.promoter }} />Promoter</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.passive }} />Passive</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: C.detractor }} />Detractor</span>
            </div>
          </>
        ) : <EmptyChart msg="No completed responses in this selection." />}
      </ChartCard>
    </div>
  );
}
