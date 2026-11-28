'use client';

import type { FlowLink, Journey, JourneyPath, JourneySide } from '@/lib/b2b/revenue/journey';
import { useMemo, useState } from 'react';
import { fmtL } from '../../../../../models/mock-data';
import { COLOR, ENTRY_NODES, PATH_LABEL } from '../constants';
import { FirmFocus, monthName } from '../utils';

const W = 960;
const H = 340;
const NODE_W = 12;
const GAP = 12;
const LEFT_X = 210;
const RIGHT_X = W - 210 - NODE_W;

interface Node {
  id: string;
  label: string;
  color: string;
  firms: number;
  value: number;
  y: number;
  h: number;
}

const leftId = (l: FlowLink) => (l.from === 'none' ? `e:${l.path}` : `a:${l.from}`);
const rightId = (l: FlowLink) => `b:${l.to}`;
const linkId = (l: FlowLink) => `${leftId(l)}>${rightId(l)}`;

function place(nodes: Omit<Node, 'y' | 'h'>[], scale: number): Node[] {
  const used = nodes.reduce((n, x) => n + Math.max(2, x.firms * scale), 0) + GAP * (nodes.length - 1);
  let y = (H - used) / 2;
  return nodes.map((n) => {
    const h = Math.max(2, n.firms * scale);
    const placed = { ...n, y, h };
    y += h + GAP;
    return placed;
  });
}

export function FirmFlow({ journey, focus, onFocus }: { journey: Journey; focus: FirmFocus | null; onFocus: (f: FirmFocus | null) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const a = monthName(journey.a);
  const b = monthName(journey.b);

  const layout = useMemo(() => {
    const links = journey.links.filter((l) => l.firms > 0);
    const sum = (pick: (l: FlowLink) => boolean, v: (l: FlowLink) => number) => links.filter(pick).reduce((n, l) => n + v(l), 0);
    const leftDefs: Omit<Node, 'y' | 'h'>[] = [
      ...(['studio', 'ec'] as const).map((s) => ({ id: `a:${s}`, label: `${s === 'studio' ? 'Studio' : 'EC Direct'} in ${a}`, color: COLOR[s] })),
      ...ENTRY_NODES.map((p) => ({ id: `e:${p}`, label: PATH_LABEL[p], color: COLOR[p as 'revived' | 'new' | 'returning' | 'storeBuyer'] })),
    ].map((n) => ({ ...n, firms: sum((l) => leftId(l) === n.id, (l) => l.firms), value: sum((l) => leftId(l) === n.id, (l) => l.valueA) }))
      .filter((n) => n.firms > 0);
    const rightDefs: Omit<Node, 'y' | 'h'>[] = ([
      { id: 'b:studio', label: `Studio in ${b}`, color: COLOR.studio },
      { id: 'b:ec', label: `EC Direct in ${b}`, color: COLOR.ec },
      { id: 'b:none', label: `No order in ${b}`, color: COLOR.none },
    ]).map((n) => ({ ...n, firms: sum((l) => rightId(l) === n.id, (l) => l.firms), value: sum((l) => rightId(l) === n.id, (l) => l.valueB) }))
      .filter((n) => n.firms > 0);
    const total = links.reduce((n, l) => n + l.firms, 0) || 1;
    const scale = (H - GAP * (Math.max(leftDefs.length, rightDefs.length) - 1)) / total;
    const left = place(leftDefs, scale);
    const right = place(rightDefs, scale);
    const order = (id: string, list: Node[]) => list.findIndex((n) => n.id === id);
    const outAt = new Map(left.map((n) => [n.id, n.y]));
    const inAt = new Map(right.map((n) => [n.id, n.y]));
    const ribbons = [...links]
      .sort((x, y) => order(leftId(x), left) - order(leftId(y), left) || order(rightId(x), right) - order(rightId(y), right))
      .map((l) => {
        const h = Math.max(1.5, l.firms * scale);
        const y0 = outAt.get(leftId(l))!;
        outAt.set(leftId(l), y0 + h);
        return { l, h, y0, color: left.find((n) => n.id === leftId(l))?.color ?? COLOR.none };
      });
    const byRight = [...ribbons].sort((x, y) => order(rightId(x.l), right) - order(rightId(y.l), right) || order(leftId(x.l), left) - order(leftId(y.l), left));
    const y1 = new Map<string, number>();
    for (const r of byRight) {
      const at = inAt.get(rightId(r.l))!;
      y1.set(linkId(r.l), at);
      inAt.set(rightId(r.l), at + r.h);
    }
    return { left, right, ribbons: ribbons.map((r) => ({ ...r, y1: y1.get(linkId(r.l))! })) };
  }, [journey, a, b]);

  const focusId = focus?.kind === 'link' ? `${focus.path && focus.from === 'none' ? `e:${focus.path}` : `a:${focus.from}`}>b:${focus.to}` : null;
  const shown = layout.ribbons.find((r) => linkId(r.l) === (hover ?? focusId));
  const nodeLabel = (n: Node) => `${n.firms} ${n.firms === 1 ? 'firm' : 'firms'}${n.value ? ` · ${fmtL(n.value)}` : ''}`;
  const toFocus = (l: FlowLink): FirmFocus => ({
    kind: 'link', from: l.from as JourneySide, to: l.to, path: l.from === 'none' ? l.path : null,
    label: `${l.from === 'none' ? PATH_LABEL[l.path as JourneyPath] : `${l.from === 'studio' ? 'Studio' : 'EC Direct'} in ${a}`} → ${l.to === 'none' ? `no order in ${b}` : `${l.to === 'studio' ? 'Studio' : 'EC Direct'} in ${b}`}`,
  });

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Where ${a}'s firms went by ${b}`}>
        {layout.ribbons.map((r) => {
          const id = linkId(r.l);
          const on = hover === id || focusId === id;
          const xm = (LEFT_X + NODE_W + RIGHT_X) / 2;
          const x0 = LEFT_X + NODE_W;
          const d = `M${x0},${r.y0} C${xm},${r.y0} ${xm},${r.y1} ${RIGHT_X},${r.y1} L${RIGHT_X},${r.y1 + r.h} C${xm},${r.y1 + r.h} ${xm},${r.y0 + r.h} ${x0},${r.y0 + r.h} Z`;
          return (
            <path
              key={id}
              d={d}
              fill={r.color}
              fillOpacity={on ? 0.55 : focusId ? 0.12 : 0.28}
              className="cursor-pointer transition-[fill-opacity]"
              onMouseEnter={() => setHover(id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onFocus(focusId === id ? null : toFocus(r.l))}
            />
          );
        })}
        {layout.left.map((n) => (
          <g key={n.id}>
            <rect x={LEFT_X} y={n.y} width={NODE_W} height={n.h} rx={3} fill={n.color} />
            <text x={LEFT_X - 10} y={n.y + n.h / 2 - 2} textAnchor="end" className="fill-gray-800 text-[12.5px] font-semibold">{n.label}</text>
            <text x={LEFT_X - 10} y={n.y + n.h / 2 + 13} textAnchor="end" className="fill-gray-500 text-[11px]">{nodeLabel(n)}</text>
          </g>
        ))}
        {layout.right.map((n) => (
          <g key={n.id}>
            <rect x={RIGHT_X} y={n.y} width={NODE_W} height={n.h} rx={3} fill={n.color} />
            <text x={RIGHT_X + NODE_W + 10} y={n.y + n.h / 2 - 2} className="fill-gray-800 text-[12.5px] font-semibold">{n.label}</text>
            <text x={RIGHT_X + NODE_W + 10} y={n.y + n.h / 2 + 13} className="fill-gray-500 text-[11px]">{nodeLabel(n)}</text>
          </g>
        ))}
      </svg>
      <div className="min-h-[34px] mt-1 text-[12px] text-gray-600 text-center">
        {shown ? (
          <span>
            <b className="text-gray-800">{toFocus(shown.l).label}</b>: {shown.l.firms} {shown.l.firms === 1 ? 'firm' : 'firms'}
            {(shown.l.valueA > 0 || shown.l.valueB > 0) && <>, {fmtL(shown.l.valueA)} in {a} → {fmtL(shown.l.valueB)} in {b}</>}.
            <span className="text-gray-400"> Click to list them below.</span>
          </span>
        ) : (
          <span className="text-gray-400">Hover a band to read it; click to list those firms.</span>
        )}
      </div>
    </div>
  );
}
