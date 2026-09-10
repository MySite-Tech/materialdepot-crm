'use client';

import { BUCKET_COLOR, BUCKET_KEYS, BUCKET_LABEL } from '../constants';
import { StoreActuals, StoreTarget } from '../types';
import { fmtShort, hasAnyTarget } from '../utils';

function ProgressBar({ actual, target, color, pace }: {
  actual: number; target: number; color: string; pace: number;
}) {
  const ratio = target > 0 ? actual / target : 0;
  const behind = target > 0 && ratio < pace;
  return (
    <div className="relative h-2 rounded-full bg-gray-100">
      <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(100, ratio * 100)}%`, background: color }} />
      {target > 0 && (
        <div
          className="absolute top-[-2px] h-3 w-[2px] rounded"
          style={{ left: `calc(${Math.min(100, pace * 100)}% - 1px)`, background: behind ? '#EF4444' : '#9CA3AF' }}
          title={`Month pace: ${(pace * 100).toFixed(0)}%`}
        />
      )}
    </div>
  );
}

export function StoreTargetCard({ store, actuals, target, pace }: {
  store: string; actuals: StoreActuals; target: StoreTarget; pace: number;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3.5">
      <div className="flex items-baseline justify-between mb-3 gap-2">
        <div className="font-bold text-[13px] text-gray-900">{store}</div>
        {!hasAnyTarget(target) && (
          <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 whitespace-nowrap">No target set</span>
        )}
      </div>
      <div className="space-y-2.5">
        {BUCKET_KEYS.map(k => {
          const a = actuals[k];
          const t = target[k] || 0;
          const known = a != null;
          return (
            <div key={k}>
              <div className="flex items-baseline justify-between mb-1 gap-2">
                <span className={`text-[11px] ${k === 'total' ? 'font-semibold text-gray-800' : 'text-gray-500'}`}>{BUCKET_LABEL[k]}</span>
                <span className="text-[11px] font-mono text-gray-700 whitespace-nowrap">
                  {known ? fmtShort(a) : 'Unknown'}
                  <span className="text-gray-400">{' '}/ {t > 0 ? fmtShort(t) : '—'}</span>
                  {known && t > 0 && (
                    <span className={`ml-1.5 font-semibold ${a >= t ? 'text-green-600' : 'text-gray-500'}`}>
                      {((a / t) * 100).toFixed(0)}%
                    </span>
                  )}
                </span>
              </div>
              <ProgressBar actual={known ? a : 0} target={known ? t : 0} color={BUCKET_COLOR[k]} pace={pace} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
