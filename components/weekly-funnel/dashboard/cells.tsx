'use client';

export const pctCell = (v: number) => (
  <span className={`font-mono text-[11px] ${v >= 50 ? 'text-green-600' : v >= 25 ? 'text-yellow-600' : 'text-red-500'}`}>
    {v}%
  </span>
);
