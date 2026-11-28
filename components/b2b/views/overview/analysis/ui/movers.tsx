'use client';

import { fmtL } from '../../../../models/mock-data';
import { Hint } from '../../../../ui/info-tip';
import { DIM_META, DROP, GAIN } from '../constants';
import type { ChangeRow, DimKey } from '../types';
import { signedL } from '../utils';

function MoveCell({ row, color, onPick }: { row: ChangeRow | null; color: string; onPick: (key: string) => void }) {
  if (!row) return <td className="px-3 py-2 text-[11px] text-gray-300">—</td>;
  return (
    <td className="px-3 py-1.5 min-w-0 max-w-[280px]">
      <button onClick={() => onPick(row.key)} title={`Filter to ${row.key}`} className="w-full text-left cursor-pointer group">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="truncate font-semibold text-gray-900 group-hover:underline">{row.key}</span>
          <span className="ml-auto tabular-nums font-semibold whitespace-nowrap" style={{ color }}>{signedL(row.delta, fmtL)}</span>
        </div>
        <div className="text-[10.5px] text-gray-400 tabular-nums">
          {`${fmtL(row.focus.value)} from ${fmtL(row.compare.value)} · ${row.focus.orders} order${row.focus.orders === 1 ? '' : 's'} from ${row.compare.orders}`}
        </div>
      </button>
    </td>
  );
}

export function Movers({ rows, focusLabel, compareLabel, onPick }: {
  rows: { dim: DimKey; gain: ChangeRow | null; drop: ChangeRow | null }[];
  focusLabel: string;
  compareLabel: string;
  onPick: (dim: DimKey, key: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <h3 className="text-[13px] font-bold text-gray-800">What moved it</h3>
        <Hint text={`For every way of slicing revenue, the one value that gained most and the one that lost most between ${compareLabel} and ${focusLabel}. Click one to filter the page to it and keep digging.`} />
      </div>
      <div className="rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-[12px] min-w-[640px]">
          <thead className="text-[10px] uppercase tracking-wider text-gray-400">
            <tr>
              <th className="text-left font-semibold px-3 py-2 w-[150px]">By</th>
              <th className="text-left font-semibold px-3 py-2">Biggest gain</th>
              <th className="text-left font-semibold px-3 py-2">Biggest drop</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.dim} className="border-t border-gray-100 align-top">
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{DIM_META[r.dim].label}</td>
                <MoveCell row={r.gain} color={GAIN} onPick={(key) => onPick(r.dim, key)} />
                <MoveCell row={r.drop} color={DROP} onPick={(key) => onPick(r.dim, key)} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
