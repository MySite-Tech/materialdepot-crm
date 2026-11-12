'use client';

import { WeightedScore } from '../../../models/performance/utils';

const R = 26;
const C = 2 * Math.PI * R;

function ScoreRing({ score }: { score: number }) {
  const color = score >= 80 ? '#16A34A' : score >= 55 ? '#F59E0B' : '#EF4444';
  return (
    <svg width="68" height="68" viewBox="0 0 68 68" role="img" aria-label={`Weighted score ${score} out of 100`}>
      <circle cx="34" cy="34" r={R} fill="none" stroke="#F3F4F6" strokeWidth="7" />
      <circle cx="34" cy="34" r={R} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * C} ${C}`} transform="rotate(-90 34 34)" />
      <text x="34" y="39" textAnchor="middle" className="fill-gray-900" style={{ fontSize: 17, fontWeight: 700 }}>{score}</text>
    </svg>
  );
}

const initials = (name: string) => name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

export function Summary({ name, team, period, score, wholeMonth, manager }: {
  name: string;
  team: string;
  period: string;
  score: WeightedScore | null;
  wholeMonth: boolean;
  manager: boolean;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white to-gray-50 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3 min-w-0">
        <span className="w-11 h-11 rounded-full bg-[#1A1A1A] text-white flex items-center justify-center text-[14px] font-bold shrink-0">{initials(name)}</span>
        <div className="min-w-0">
          <div className="text-[16px] font-bold text-gray-900 truncate">{name}</div>
          <div className="text-[12px] text-gray-500">{team} · {period}</div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {score ? (
          <>
            <div className="text-right">
              <div className="text-[12px] font-semibold text-gray-700">Weighted KPI score</div>
              <div className="text-[11px] text-gray-400 max-w-[240px]">
                Each KPI&apos;s share of its target, paced to today and weighted as in the KPI sheet
                {score.covered < 100 ? ` · covers ${score.covered}% of the sheet's weight; the rest is not scored yet` : ''}
              </div>
            </div>
            <ScoreRing score={score.score} />
          </>
        ) : (
          <div className="text-[11.5px] text-gray-400 max-w-[260px] text-right">
            {wholeMonth ? 'No KPI with a target has a value yet.' : `The weighted score needs a whole month, because the sheet's targets are monthly. Pick This month or Last month${manager ? '' : ' to see yours'}.`}
          </div>
        )}
      </div>
    </section>
  );
}
