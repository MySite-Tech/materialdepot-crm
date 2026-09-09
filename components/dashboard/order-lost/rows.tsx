'use client';

import { Fragment } from 'react';
import { BranchSummary, Grp } from '../types/order-lost';
import { fmtFull, fmtShort, pct } from '../utils/order-lost';

export function makeSummaryRows({ cols, totals, expanded, toggleExpand }: {
  cols: BranchSummary[];
  totals: BranchSummary;
  expanded: Set<string>;
  toggleExpand: (k: string) => void;
}) {
    const CountRow = ({ label, value, share, sub, indent, danger }: {
      label: string; value: (b: BranchSummary) => number; share?: (b: BranchSummary) => string;
      sub?: (b: BranchSummary) => string; indent?: boolean; danger?: boolean;
    }) => (
      <tr className="border-b border-gray-50 hover:bg-gray-50/60">
        <td className={`px-4 py-2.5 text-[13px] ${indent ? 'pl-8 text-gray-500' : 'font-medium text-gray-800'} ${danger ? 'text-red-600 font-semibold' : ''}`}>
          {indent && <span className="text-gray-300 mr-1.5">▸</span>}{danger && <span className="mr-1">⚠</span>}{label}
        </td>
        {[...cols, totals].map((b, i) => (
          <td key={i} className={`px-4 py-2.5 text-right ${i === cols.length ? 'bg-gray-50/60' : ''}`}>
            <div className={`text-[13px] ${indent ? 'text-gray-700' : 'font-semibold text-gray-900'} font-mono`}>{value(b).toLocaleString('en-IN')}</div>
            {(share || sub) && <div className="text-[10px] text-gray-400 font-mono">{sub ? sub(b) : share!(b)}</div>}
          </td>
        ))}
      </tr>
    );

    const ValueRow = ({ label, value, sub, indent, danger }: {
      label: string; value: (b: BranchSummary) => number; sub?: (b: BranchSummary) => string;
      indent?: boolean; danger?: boolean;
    }) => (
      <tr className="border-b border-gray-50 hover:bg-gray-50/60">
        <td className={`px-4 py-2.5 text-[13px] ${indent ? 'pl-8 text-gray-500' : 'font-medium text-gray-800'} ${danger ? 'text-red-600 font-semibold' : ''}`}>
          {indent && <span className="text-gray-300 mr-1.5">▸</span>}{danger && <span className="mr-1">⚠</span>}{label}
        </td>
        {[...cols, totals].map((b, i) => (
          <td key={i} className={`px-4 py-2.5 text-right ${i === cols.length ? 'bg-gray-50/60' : ''}`}>
            <div className={`text-[13px] ${indent ? 'text-gray-700' : 'font-semibold text-gray-900'} font-mono`}>{indent ? fmtShort(value(b)) : fmtFull(value(b))}</div>
            {sub && <div className="text-[10px] text-gray-400 font-mono">{sub(b)}</div>}
          </td>
        ))}
      </tr>
    );

    const reasonKeys = (group: Grp, kind: 'count' | 'value'): string[] => {
      const set = new Set<string>();
      [...cols, totals].forEach(b => {
        const src = kind === 'count' ? b.reasonCount : b.reasonValue;
        Object.keys(src?.[group] || {}).forEach(k => set.add(k));
      });
      return [...set].sort();
    };

    const GroupRows = ({ group, label, kind }: { group: Grp; label: string; kind: 'count' | 'value' }) => {
      const key = `${kind}:${group}`;
      const open = expanded.has(key);
      const groupTotal = (b: BranchSummary) => kind === 'count' ? b.groupCount[group] : b.groupValue[group];
      const denom = (b: BranchSummary) => kind === 'count' ? b.lostCount : b.lostValue;
      const suffix = kind === 'count' ? 'of lost' : 'of value lost';
      const reasonVal = (b: BranchSummary, reason: string) =>
        (kind === 'count' ? b.reasonCount : b.reasonValue)?.[group]?.[reason] || 0;
      const fmtGroup = (n: number) => kind === 'count' ? n.toLocaleString('en-IN') : fmtShort(n);
      return (
        <>
          <tr className="border-b border-gray-50 hover:bg-gray-50/60 cursor-pointer select-none" onClick={() => toggleExpand(key)}>
            <td className="px-4 py-2.5 text-[13px] pl-8 text-gray-500">
              <span className="text-gray-400 mr-1.5 inline-block transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>▸</span>{label}
            </td>
            {[...cols, totals].map((b, i) => (
              <td key={i} className={`px-4 py-2.5 text-right ${i === cols.length ? 'bg-gray-50/60' : ''}`}>
                <div className="text-[13px] text-gray-700 font-mono">{fmtGroup(groupTotal(b))}</div>
                <div className="text-[10px] text-gray-400 font-mono">{`${pct(groupTotal(b), denom(b))} ${suffix}`}</div>
              </td>
            ))}
          </tr>
          {open && reasonKeys(group, kind).map(reason => (
            <tr key={reason} className="border-b border-gray-50 bg-blue-50/20">
              <td className="px-4 py-1.5 text-[12px] pl-14 text-gray-400">{reason}</td>
              {[...cols, totals].map((b, i) => (
                <td key={i} className={`px-4 py-1.5 text-right ${i === cols.length ? 'bg-gray-50/60' : ''}`}>
                  <div className="text-[12px] text-gray-500 font-mono">{fmtGroup(reasonVal(b, reason))}</div>
                </td>
              ))}
            </tr>
          ))}
          {open && reasonKeys(group, kind).length === 0 && (
            <tr className="border-b border-gray-50 bg-blue-50/20">
              <td colSpan={cols.length + 2} className="px-4 py-1.5 pl-14 text-[11px] text-gray-300">No breakdown</td>
            </tr>
          )}
        </>
      );
    };
  return { CountRow, ValueRow, GroupRows };
}
