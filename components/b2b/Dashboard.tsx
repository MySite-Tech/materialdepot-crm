'use client';

import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { INBOUND_STAGE_COLORS, fmtL } from './mockData';
import { fetchB2BData, fetchTargets } from '@/lib/b2bLeads';
import { computeDashboard, type DashboardMetrics } from './analytics';

const CLIENT_COLORS = ['#EAB308', '#C2410C'];
const SOURCE_COLORS = ['#1A1A1A', '#EAB308', '#0F766E'];

function MetricCard({ label, value, sub, subTone }: { label: string; value: string; sub?: string; subTone?: 'muted' | 'warn' }) {
  return (
    <div className="bg-white rounded-lg px-5 py-4 border border-gray-200">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className="font-mono text-[26px] leading-tight font-bold text-black mt-1">{value}</div>
      {sub && <div className={`text-[11px] mt-1 ${subTone === 'warn' ? 'text-red-500 font-medium' : 'text-gray-400'}`}>{sub}</div>}
    </div>
  );
}

function Panel({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-5 ${className}`}>
      <div className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-4">{title}</div>
      {children}
    </div>
  );
}

export default function B2BDashboard() {
  const [d, setD] = useState<DashboardMetrics | null>(null);
  const [monthlyTarget, setMonthlyTarget] = useState(0);
  const [runRate, setRunRate] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchB2BData(), fetchTargets()])
      .then(([data, targets]) => {
        if (!alive) return;
        const m = computeDashboard(data);
        const target = targets.monthlyTargetL * 100000;
        const now = new Date();
        const dayOfMonth = now.getDate();
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        setD(m);
        setMonthlyTarget(target);
        setRunRate(Math.round((m.revenueGenerated / dayOfMonth) * daysInMonth));
      })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  if (loading || !d) {
    return <div className="p-4 sm:p-6 text-sm text-gray-400">Loading dashboard…</div>;
  }

  const achievedPct = monthlyTarget > 0 ? Math.round((d.revenueGenerated / monthlyTarget) * 100) : 0;
  const vertical = d.pipelineByVertical;
  const overallPipeline = vertical.inbound + vertical.outbound + vertical.kam;
  const gap = runRate - monthlyTarget;

  const maxStage = Math.max(...d.pipelineByStage.map((s) => s.count), 1);
  const clientData = [
    { name: 'Active', value: d.clients.active },
    { name: 'Inactive', value: d.clients.inactive },
  ];

  const stageColor = (label: string): string =>
    label === 'Won' ? '#22C55E' : label === 'In Progress' ? '#F59E0B' : (INBOUND_STAGE_COLORS as Record<string, string>)[label] || '#EAB308';

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Dashboard</h1>
          <p className="text-xs text-gray-400 mt-0.5">Revenue, pipeline &amp; run rate</p>
        </div>
        <div className="text-[11px] text-gray-400">Target set on the <span className="font-semibold text-gray-600">Targets</span> tab</div>
      </div>

      {/* ── Top metric cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard label="Revenue Generated" value={fmtL(d.revenueGenerated)} sub={`of ${fmtL(monthlyTarget)} target`} />
        <MetricCard label="Target Achieved" value={`${achievedPct}%`} />
        <MetricCard label="Run Rate" value={fmtL(runRate)} sub={runRate < monthlyTarget ? 'Below required' : 'On track'} subTone={runRate < monthlyTarget ? 'warn' : 'muted'} />
        <MetricCard label="Month Projection" value={fmtL(runRate)} />
      </div>

      {/* ── Revenue vs Target ── */}
      <Panel title="Revenue vs Target" className="mt-3">
        <div className="font-mono text-lg font-bold text-black">
          {fmtL(d.revenueGenerated)} <span className="text-sm font-normal text-gray-400">of {fmtL(monthlyTarget)}</span>
        </div>
        <div className="h-2 rounded-full bg-gray-200 overflow-hidden mt-3">
          <div className="h-full bg-[#0F766E] rounded-full transition-[width] duration-500" style={{ width: `${achievedPct}%` }} />
        </div>
        <div className="text-[11px] text-gray-400 mt-2">{achievedPct}% of monthly target achieved</div>
      </Panel>

      {/* ── Pipeline by Stage ── */}
      <Panel title="Pipeline by Stage" className="mt-3">
        <div className="flex flex-col gap-3">
          {d.pipelineByStage.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <div className="w-24 text-[11px] font-semibold text-gray-500 shrink-0">{s.label}</div>
              <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
                <div
                  className="h-full rounded flex items-center px-2 text-[11px] font-bold text-white transition-[width] duration-500"
                  style={{ width: `${Math.max((s.count / maxStage) * 100, 8)}%`, background: stageColor(s.label) }}
                >
                  {s.count}
                </div>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      {/* ── Pipeline by Vertical ── */}
      <Panel title="Pipeline by Vertical — Overall Pipeline" className="mt-3">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Inbound Pipeline', value: vertical.inbound },
            { label: 'Outbound Pipeline', value: vertical.outbound },
            { label: 'KAM Pipeline', value: vertical.kam },
            { label: 'Overall Pipeline', value: overallPipeline, accent: true },
          ].map((v) => (
            <div key={v.label} className={`rounded-lg px-4 py-3 border ${v.accent ? 'border-[#0F766E]/30 bg-[#0F766E]/5' : 'border-gray-200'}`}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{v.label}</div>
              <div className={`font-mono text-lg font-bold mt-1 ${v.accent ? 'text-[#0F766E]' : 'text-black'}`}>{fmtL(v.value)}</div>
            </div>
          ))}
        </div>
      </Panel>

      {/* ── Client + Source pies ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
        <Panel title="Active vs Inactive Clients">
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="45%" height={150}>
              <PieChart>
                <Pie data={clientData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={30} outerRadius={62} paddingAngle={2}>
                  {clientData.map((_, i) => <Cell key={i} fill={CLIENT_COLORS[i % CLIENT_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 flex flex-col gap-2">
              {clientData.map((c, i) => (
                <div key={c.name} className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: CLIENT_COLORS[i] }} />
                    {c.name}
                  </span>
                  <span className="font-mono font-semibold">{c.value}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Revenue by Source">
          <div className="flex items-center gap-4">
            <ResponsiveContainer width="45%" height={150}>
              <PieChart>
                <Pie data={d.revenueBySource.filter((s) => s.value > 0)} dataKey="value" nameKey="source" cx="50%" cy="50%" innerRadius={30} outerRadius={62} paddingAngle={2}>
                  {d.revenueBySource.filter((s) => s.value > 0).map((_, i) => <Cell key={i} fill={SOURCE_COLORS[i % SOURCE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtL(Number(v))} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 flex flex-col gap-2">
              {d.revenueBySource.map((s, i) => (
                <div key={s.source} className="flex items-center justify-between text-[13px]">
                  <span className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: SOURCE_COLORS[i % SOURCE_COLORS.length] }} />
                    {s.source}
                  </span>
                  <span className="font-mono font-semibold">{fmtL(s.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>

      {/* ── Run rate vs required ── */}
      <Panel title="Run Rate vs Required Run Rate" className="mt-3">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Current Run Rate</div>
            <div className="font-mono text-xl font-bold text-black mt-1">{fmtL(runRate)}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Required Run Rate</div>
            <div className="font-mono text-xl font-bold text-black mt-1">{fmtL(monthlyTarget)}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Gap</div>
            <div className="font-mono text-xl font-bold text-red-500 mt-1">{gap < 0 ? '-' : ''}{fmtL(Math.abs(gap))}</div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
