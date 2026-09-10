'use client';

import { ReasonMap } from './types';

export const normalizeReason = (r: string): string => (r || '').toLowerCase().replace(/[^a-z0-9]/g, '');

export const fmtFull = (n: number): string => '₹' + Math.round(n || 0).toLocaleString('en-IN');

export const fmtShort = (n: number): string => {
  const v = n || 0;
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)} Cr`;
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)} L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(0)}k`;
  return `₹${Math.round(v)}`;
};

export const pct = (part: number, whole: number): string => (whole > 0 ? `${((part / whole) * 100).toFixed(1)}%` : '—');

export const fmtDetailDate = (d: string | null | undefined): string => {
  if (!d) return '—';
  const dt = new Date((d.length <= 10 ? d + 'T00:00:00' : d));
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const daysBetween = (from: string | null | undefined, to: string | null | undefined): number | null => {
  if (!from || !to) return null;
  const a = new Date(from), b = new Date(to);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 864e5));
};

export const fmtRangeVal = (n: number): string => {
  if (n >= 100000) { const l = n / 100000; return `₹${Number.isInteger(l) ? l : l.toFixed(1)}L`; }
  if (n >= 1000) return `₹${Math.round(n / 1000)}k`;
  return `₹${Math.round(n)}`;
};

export const fmtChipDate = (d: string) => { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}`; };

export const emptyGroups = () => ({ Category: 0, Retail: 0, Other: 0 });

export const emptyReasons = (): ReasonMap => ({ Category: {}, Retail: {}, Other: {} });

const csvEscape = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export const triggerDownload = (rows: string[][], filename: string) => {
  const csv = rows.map(r => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
