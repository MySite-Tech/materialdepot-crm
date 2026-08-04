'use client';

import { useEffect, useState } from 'react';
import { INBOUND_STAGE_COLORS, fmtL } from './mockData';
import { fetchB2BData } from '@/lib/b2bLeads';
import { computeLeadership, type LeadershipData } from './analytics';

function Panel({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-5 ${className}`}>
      <div className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-4">{title}</div>
      {children}
    </div>
  );
}

function FunnelBar({ label, count, max, color }: { label: string; count: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 text-[11px] font-semibold text-gray-500 shrink-0">{label}</div>
      <div className="flex-1 h-6 bg-gray-100 rounded overflow-hidden">
        <div
          className="h-full rounded flex items-center px-2 text-[11px] font-bold text-white transition-[width] duration-500"
          style={{ width: `${Math.max((count / max) * 100, 6)}%`, background: color }}
        >
          {count}
        </div>
      </div>
    </div>
  );
}

export default function LeadershipBoard() {
  const [data, setData] = useState<LeadershipData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchB2BData()
      .then((d) => { if (alive) setData(computeLeadership(d, new Date())); })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  if (loading || !data) {
    return <div className="p-4 sm:p-6 text-sm text-gray-400">Loading leadership board…</div>;
  }

  const maxFunnel = Math.max(...data.inboundFunnel.map((s) => s.count), 1);
  const maxWon = Math.max(...data.orderWonFunnel.map((s) => s.count), 1);

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-800">Leadership Board</h1>
        <p className="text-xs text-gray-400 mt-0.5">Team &amp; funnel performance</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* ── Rep Leaderboard ── */}
        <Panel title="Rep Leaderboard — Inbound / Outbound / Revenue">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] min-w-[420px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="text-left font-semibold py-2">Rep</th>
                  <th className="text-left font-semibold py-2">Inbound</th>
                  <th className="text-left font-semibold py-2">Outbound</th>
                  <th className="text-left font-semibold py-2">Clients</th>
                  <th className="text-left font-semibold py-2">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {data.leaderboard.map((r, i) => (
                  <tr key={r.rep} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 font-semibold text-gray-800">
                      {i === 0 && r.revenue > 0 ? '🏆 ' : ''}{r.rep}
                    </td>
                    <td className="py-2.5 text-gray-600">{r.inbound}</td>
                    <td className="py-2.5 text-gray-600">{r.outbound}</td>
                    <td className="py-2.5 text-gray-600">{r.clients}</td>
                    <td className="py-2.5 font-mono font-semibold text-gray-800">{fmtL(r.revenue)}</td>
                  </tr>
                ))}
                {data.leaderboard.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-gray-300 text-[12px]">No reps yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* ── Closing Expected This Week ── */}
        <Panel title="Closing Expected This Week">
          <div className="flex flex-col gap-3">
            {data.closingThisWeek.map((c, i) => (
              <div key={`${c.company}-${i}`} className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[13px] font-semibold text-gray-800">{c.company}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">Expected {c.expected}</div>
                </div>
                <span className="text-[12px] font-mono font-semibold text-[#0F766E] whitespace-nowrap">{fmtL(c.value)}</span>
              </div>
            ))}
            {data.closingThisWeek.length === 0 && (
              <div className="text-[12px] text-gray-300 py-4 text-center">Nothing expected to close this week</div>
            )}
          </div>
        </Panel>

        {/* ── Inbound Pipeline Funnel ── */}
        <Panel title="Inbound Pipeline Funnel">
          <div className="flex flex-col gap-3">
            {data.inboundFunnel.map((s) => (
              <FunnelBar key={s.label} label={s.label} count={s.count} max={maxFunnel} color={INBOUND_STAGE_COLORS[s.label]} />
            ))}
          </div>
        </Panel>

        {/* ── Leads → Order Won Funnel ── */}
        <Panel title="Leads → Order Won Funnel">
          <div className="flex flex-col gap-3">
            {data.orderWonFunnel.map((s) => (
              <FunnelBar key={s.label} label={s.label} count={s.count} max={maxWon} color="#0F766E" />
            ))}
          </div>
        </Panel>

        {/* ── Top Clients by Revenue ── */}
        <Panel title="Top Clients by Revenue">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] min-w-[360px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="text-left font-semibold py-2">Client</th>
                  <th className="text-left font-semibold py-2">KAM</th>
                  <th className="text-left font-semibold py-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {data.topClientsByRevenue.map((c, i) => (
                  <tr key={`${c.client}-${i}`} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 font-semibold text-gray-800">{c.client}</td>
                    <td className="py-2.5 text-gray-600">{c.kam}</td>
                    <td className="py-2.5 font-mono font-semibold text-gray-800">{fmtL(c.value)}</td>
                  </tr>
                ))}
                {data.topClientsByRevenue.length === 0 && (
                  <tr><td colSpan={3} className="py-6 text-center text-gray-300 text-[12px]">No clients yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* ── Top Clients by Number of Orders ── */}
        <Panel title="Top Clients by Number of Orders">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] min-w-[280px]">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
                  <th className="text-left font-semibold py-2">Client</th>
                  <th className="text-left font-semibold py-2">Orders</th>
                </tr>
              </thead>
              <tbody>
                {data.topClientsByOrders.map((c, i) => (
                  <tr key={`${c.client}-${i}`} className="border-b border-gray-50 last:border-0">
                    <td className="py-2.5 font-semibold text-gray-800">{c.client}</td>
                    <td className="py-2.5 font-mono font-semibold text-gray-800">{c.orders}</td>
                  </tr>
                ))}
                {data.topClientsByOrders.length === 0 && (
                  <tr><td colSpan={2} className="py-6 text-center text-gray-300 text-[12px]">No orders yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
