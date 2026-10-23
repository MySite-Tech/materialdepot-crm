'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';

import { BUCKET_COLORS, COPY_COLOR, FLAG_BG, PAGE_SIZE, PDESC, SCORE_COLORS } from '../../constants';
import type { Group, ScoreMode } from '../../types';
import { Sort, SortKey, groupSortValue, nextSort, sortBy } from '../../utils/aggregate';
import { avg1, avgColor, fmt, pctText } from '../../utils/format';
import { BucketBar, Pager, Panel, ROW, ScoreBar, SortTh, TableScroll, Th, activate } from '../../ui';

export type NamedGroup = Group<number> & { name: string; ec?: string; people?: number };

interface Col { k?: SortKey; label: string; left?: boolean; title?: string; cell: (g: NamedGroup) => ReactNode }

const Cnt = ({ x, n, color }: { x: number; n: number; color?: string }) => (
  <><b style={color ? { color } : undefined}>{fmt(x)}</b><span className="text-gray-400 text-[12px] ml-1">{pctText(x, n)}</span></>
);
const Avg = ({ g }: { g: Group }) => (
  g.L.n ? <><b style={{ color: avgColor(g.L.avg) }}>{avg1(g.L.avg)}</b><span className="text-gray-400 text-[12px] ml-1">/ 4</span></> : <span className="text-gray-400">–</span>
);
const Flag = ({ copy }: { copy?: boolean }) => (
  <span className="inline-block text-[10px] font-bold rounded px-1.5 ml-1.5"
    title={copy ? '20%+ of their remarks are copy-pasted' : 'Too many weak remarks (see the table note)'}
    style={copy ? { background: FLAG_BG.copy, color: COPY_COLOR } : { background: FLAG_BG.bad, color: SCORE_COLORS[0] }}>
    {copy ? 'COPY' : '!'}
  </span>
);

const pointerCols = (bm: boolean): Col[] => [
  { k: 'name', label: bm ? 'BM' : 'Experience Centre', left: true, cell: g => (
    <><b>{g.name}</b>{bm && g.L.n >= 5 && g.L.d[0] / g.L.n >= 0.5 && <Flag />}{bm && g.cp >= 5 && g.cp / g.n >= 0.2 && <Flag copy />}</>
  ) },
  ...(bm ? [{ label: 'EC', left: true, cell: (g: NamedGroup) => <span className="text-gray-500 text-[12px]">{g.ec}</span> }] : []),
  { k: 'ln', label: 'Leads', title: 'Leads with at least one remark', cell: g => fmt(g.L.n) },
  ...(bm ? [{ k: 'n' as SortKey, label: 'Remarks', cell: (g: NamedGroup) => fmt(g.n) }] : []),
  { k: 'avgp', label: 'Avg score', title: 'Average pointers covered per lead, out of 4', cell: g => <Avg g={g} /> },
  { k: 'all4', label: 'All 4', title: 'Leads covering all 4 pointers', cell: g => <Cnt x={g.L.d[4]} n={g.L.n} color={SCORE_COLORS[4]} /> },
  { k: 'zero', label: 'None', title: 'Leads covering none of the 4 pointers', cell: g => <Cnt x={g.L.d[0]} n={g.L.n} color={SCORE_COLORS[0]} /> },
  ...(['Need', 'Stuck', 'Who', 'Next+date'] as const).map((label, i) => ({ k: `v${i}` as SortKey, label, title: `% of leads covering ${label}: ${PDESC[i]}`, cell: (g: NamedGroup) => pctText(g.L.cov[i], g.L.n) })),
  { k: 'pc', label: 'Copy-paste', title: 'Same text on 2+ leads by the same BM the same day', cell: g => <Cnt x={g.cp} n={g.n} color={COPY_COLOR} /> },
  ...(bm ? [] : [{ label: 'People', title: 'BMs who wrote remarks', cell: (g: NamedGroup) => (g.people === undefined ? '' : fmt(g.people)) }]),
  { label: 'Leads by score 0 → 4', title: 'Red = 0 pointers … green = all 4', left: true, cell: g => <ScoreBar d={g.L.d} n={g.L.n} /> },
];

const lengthCols = (bm: boolean): Col[] => [
  { k: 'name', label: bm ? 'BM' : 'Experience Centre', left: true, cell: g => (
    <><b>{g.name}</b>{bm && g.n >= 5 && g.b[0] / g.n > 0.5 && <Flag />}{bm && g.cp >= 5 && g.cp / g.n >= 0.2 && <Flag copy />}</>
  ) },
  ...(bm ? [{ label: 'EC', left: true, cell: (g: NamedGroup) => <span className="text-gray-500 text-[12px]">{g.ec}</span> }] : []),
  { k: 'n', label: 'Remarks', cell: g => fmt(g.n) },
  ...(bm ? [{ k: 'leads' as SortKey, label: 'Leads', cell: (g: NamedGroup) => fmt(g.leads.size) }] : []),
  ...(['Nothing', 'Minimal', 'Sufficient', 'Detailed'] as const).map((label, i) => ({ k: `p${i}` as SortKey, label, cell: (g: NamedGroup) => <Cnt x={g.b[i]} n={g.n} color={BUCKET_COLORS[i]} /> })),
  { k: 'pc', label: 'Copy-paste', title: 'Same text on 2+ leads by the same BM the same day', cell: g => <Cnt x={g.cp} n={g.n} color={COPY_COLOR} /> },
  { k: 'avg', label: 'Avg chars', title: 'Average remark length after trimming spaces', cell: g => (g.n ? fmt(Math.round(g.len / g.n)) : '–') },
  ...(bm ? [] : [{ label: 'People', title: 'BMs who wrote remarks', cell: (g: NamedGroup) => (g.people === undefined ? '' : fmt(g.people)) }]),
  { label: 'Mix', title: 'Nothing · Minimal · Sufficient · Detailed', left: true, cell: g => <BucketBar b={g.b} n={g.n} /> },
];

export function GroupTable({ title, hint, groups, total, mode, bm, onRow }: {
  title: string;
  hint: ReactNode;
  groups: NamedGroup[];
  total?: NamedGroup;
  mode: ScoreMode;
  bm: boolean;
  onRow: (g: NamedGroup) => void;
}) {
  const [sort, setSort] = useState<Sort>({ k: mode === 'pt' ? 'ln' : 'n', dir: -1 });
  const [page, setPage] = useState(1);
  useEffect(() => { setSort({ k: mode === 'pt' ? 'ln' : 'n', dir: -1 }); }, [mode]);
  useEffect(() => { setPage(1); }, [groups, sort]);

  const cols = mode === 'pt' ? pointerCols(bm) : lengthCols(bm);
  const sorted = useMemo(() => sortBy(groups, g => groupSortValue(g, sort.k), sort.dir), [groups, sort]);
  const rows = bm ? sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : sorted;
  const td = (c: Col) => `px-2.5 py-2 border-b border-gray-100 whitespace-nowrap tabular-nums ${c.left ? 'text-left' : 'text-right'}`;

  return (
    <Panel title={title} hint={hint}>
      <TableScroll>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {cols.map(c => c.k
                ? <SortTh key={c.label} k={c.k} label={c.label} left={c.left} title={c.title} sort={sort} onSort={k => setSort(s => nextSort(s, k, ['name']))} />
                : <Th key={c.label} label={c.label} left={c.left} title={c.title} />)}
            </tr>
          </thead>
          <tbody>
            {rows.map(g => (
              <tr key={g.k} {...activate(() => onRow(g))} className={ROW}>
                {cols.map(c => <td key={c.label} className={td(c)}>{c.cell(g)}</td>)}
              </tr>
            ))}
          </tbody>
          {total && total.n > 0 && (
            <tfoot>
              <tr className="font-bold bg-gray-50">
                {cols.map((c, i) => <td key={c.label} className={td(c)}>{i === 0 ? 'Total' : c.cell(total)}</td>)}
              </tr>
            </tfoot>
          )}
        </table>
      </TableScroll>
      {bm && <Pager page={page} total={sorted.length} onPage={setPage} />}
    </Panel>
  );
}
