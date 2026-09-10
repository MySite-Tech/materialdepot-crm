'use client';

import { useEffect, useState } from 'react';
import {
  REP_ROLE_COLORS, fmtL,
  type TargetStore, type RepRole,
} from '../models/mock-data';
import { fetchB2BData, fetchTargets, istToday, saveTargets, type B2BData } from '@/lib/b2b';
import { computeTargets, type RepTargetRow } from '../models/analytics';

const numInput = 'w-14 px-1.5 py-0.5 text-[12px] text-right font-mono border border-gray-200 rounded outline-none focus:border-[#0F766E]';

function RoleBadge({ role }: { role: RepRole }) {
  const c = REP_ROLE_COLORS[role];
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: c + '1A', color: c }}>
      {role}
    </span>
  );
}

function MetricRow({
  label, actual, actualDisplay, target, unit, color, onTarget,
}: {
  label: string;
  actual: number;
  actualDisplay: string;
  target: number;
  unit?: string;
  color: string;
  onTarget: (v: number) => void;
}) {
  const pct = target > 0 ? Math.min((actual / target) * 100, 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] text-gray-500">{label}</span>
        <span className="flex items-center gap-1 text-[12px] shrink-0">
          <span className="font-mono font-semibold text-gray-800">{actualDisplay}</span>
          <span className="text-gray-300">/</span>
          <input
            type="number"
            min={0}
            value={target}
            onChange={(e) => onTarget(Number(e.target.value) || 0)}
            className={numInput}
          />
          {unit && <span className="text-gray-400">{unit}</span>}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 mt-1.5 overflow-hidden">
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function RepCard({ row, onGoal }: { row: RepTargetRow; onGoal: (key: 'revenueTargetL' | 'clientsTarget' | 'onboardingsTarget', v: number) => void }) {
  const revenueRow = (
    <MetricRow
      label="Revenue"
      actual={row.revenue / 100000}
      actualDisplay={fmtL(row.revenue)}
      target={row.revenueTargetL}
      unit="L"
      color="#0F766E"
      onTarget={(v) => onGoal('revenueTargetL', v)}
    />
  );
  const clientsRow = (
    <MetricRow
      label="Active Clients"
      actual={row.activeClients}
      actualDisplay={String(row.activeClients)}
      target={row.clientsTarget}
      color="#3B82F6"
      onTarget={(v) => onGoal('clientsTarget', v)}
    />
  );
  const onboardingRow = (
    <MetricRow
      label="New Onboardings"
      actual={row.newOnboardings}
      actualDisplay={String(row.newOnboardings)}
      target={row.onboardingsTarget}
      color="#EAB308"
      onTarget={(v) => onGoal('onboardingsTarget', v)}
    />
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[13px] font-bold text-gray-800">{row.rep}</span>
        <RoleBadge role={row.role} />
      </div>
      <div className="flex flex-col gap-3">
        {row.role === 'KAM' ? <>{revenueRow}{clientsRow}</> : <>{onboardingRow}{revenueRow}</>}
      </div>
    </div>
  );
}

export default function Targets() {
  const [data, setData] = useState<B2BData | null>(null);
  const [store, setStore] = useState<TargetStore | null>(null);
  const [targetsOk, setTargetsOk] = useState(true);
  const [saveError, setSaveError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([fetchB2BData(), fetchTargets()])
      .then(([d, t]) => { if (!alive) return; setData(d); setStore(t.store); setTargetsOk(t.ok); })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  if (loading || !data || !store) {
    return <div className="p-4 sm:p-6 text-sm text-gray-400">Loading targets…</div>;
  }

  const today = istToday();
  const month = { from: today.slice(0, 8) + '01', to: today };

  const rows = computeTargets(data, store, month);
  const achieved = rows.reduce((s, r) => s + r.revenue, 0);
  const targetRs = store.monthlyTargetL * 100000;
  const pct = targetRs > 0 ? Math.round((achieved / targetRs) * 100) : 0;

  const persist = async (next: TargetStore) => {
    setStore(next);
    const err = await saveTargets(next);
    setSaveError(err ? `Not saved: ${err}` : '');
  };

  const setMonthly = (v: number) => persist({ ...store, monthlyTargetL: v });

  const setRepGoal = (rep: string, key: 'revenueTargetL' | 'clientsTarget' | 'onboardingsTarget', v: number) => {
    const cur = store.reps[rep] || { revenueTargetL: 0, clientsTarget: 0, onboardingsTarget: 0 };
    persist({ ...store, reps: { ...store.reps, [rep]: { ...cur, [key]: v } } });
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-4">
        <h1 className="text-lg font-bold text-gray-800">Targets</h1>
        <p className="text-xs text-gray-400 mt-0.5">B2B target &amp; individual rep goals · achieved is this month only</p>
      </div>

      {!targetsOk && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-900">
          <span className="font-semibold">Targets could not be read.</span>{' '}
          The goals below are the built-in defaults, not what your team saved. Editing one will try to write again.
        </div>
      )}
      {!!data.failed.length && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-900">
          <span className="font-semibold">Partly loaded.</span>{' '}
          {data.failed.join(', ')}{' '}could not be read, so achieved figures are understated. Reload to retry.
        </div>
      )}
      {!!saveError && (
        <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-800">
          <span className="font-semibold">{saveError}</span>{' '}
          The number on screen is not stored — reload and try again.
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-4">
        <div className="flex items-start justify-between mb-3">
          <div className="text-xs font-bold uppercase tracking-wider text-gray-700">B2B Target</div>
          <div className="text-[11px] text-gray-400">Overall monthly revenue goal</div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <div className="font-mono text-2xl font-bold text-black">
              {fmtL(achieved)} <span className="text-sm font-normal text-gray-400">of {fmtL(targetRs)}</span>
            </div>
            <div className="h-2 rounded-full bg-gray-200 overflow-hidden mt-3 max-w-md">
              <div className="h-full bg-[#0F766E] rounded-full transition-[width] duration-500" style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <div className="text-[11px] text-gray-400 mt-2">{pct}% achieved</div>
          </div>
          <label className="block shrink-0">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Set Target (₹ Lacs)</span>
            <input
              type="number"
              min={0}
              value={store.monthlyTargetL}
              onChange={(e) => setMonthly(Number(e.target.value) || 0)}
              className="w-28 px-2.5 py-1.5 text-[13px] font-mono border border-gray-200 rounded-md outline-none focus:border-[#0F766E]"
            />
          </label>
        </div>
      </div>

      <div className="text-sm font-bold text-gray-700 mb-3">Individual Targets</div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {rows.map((row) => (
          <RepCard key={row.rep} row={row} onGoal={(key, v) => setRepGoal(row.rep, key, v)} />
        ))}
      </div>
    </div>
  );
}
