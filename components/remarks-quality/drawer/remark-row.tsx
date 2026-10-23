'use client';

import { BNAME, BUCKET_TAG, STATUS_LABEL } from '../constants';
import type { Dicts, Remark, ScoreCtx } from '../types';
import { dlabel, hhmm } from '../utils/dates';
import { catList } from '../utils/filtering';
import { inr } from '../utils/format';
import { bucketOf, isCopy, ptOf } from '../utils/scoring';
import { FOCUS, PointerChips } from '../ui';

function Highlight({ text, q }: { text: string; q: string }) {
  const i = q ? text.toLowerCase().indexOf(q) : -1;
  if (i < 0) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="bg-yellow-200 rounded-sm px-px">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

export function RemarkRow({ r, dicts, ctx, text, q, onLead }: {
  r: Remark;
  dicts: Dicts;
  ctx: ScoreCtx;
  text: string | null | undefined;
  q: string;
  onLead: (cart: string) => void;
}) {
  const b = bucketOf(r, ctx);
  const status = dicts.status[r.status];
  const cats = catList(dicts, r.cats).join(', ');
  return (
    <div className="py-3 border-b border-gray-100 space-y-1.5">
      <div className="flex flex-wrap gap-1.5 items-center">
        <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${r.auto ? 'bg-gray-100 text-gray-500' : BUCKET_TAG[b]}`}>
          {r.auto ? 'SYSTEM' : BNAME[b].toUpperCase()} · {r.len}
        </span>
        {isCopy(r, ctx.thresholds) && <span className="text-[10px] font-bold rounded px-1.5 py-0.5 bg-purple-50 text-purple-700">COPY ×{r.copies} leads</span>}
        {!r.auto && <PointerChips p={ptOf(r, ctx)} />}
        {dicts.rk[r.rk] === 'first' && <span className="text-[10px] font-bold rounded px-1.5 py-0.5 bg-gray-100 text-gray-500" title="First remark on this lead">1ST</span>}
      </div>
      <div className="flex flex-wrap gap-x-2.5 gap-y-1 items-center text-[12px] text-gray-500">
        <span className="font-semibold text-[13px] text-gray-900">{dicts.person[r.author] || '(unknown)'}</span>
        <span className="tabular-nums">{dlabel(r.day)} · {hhmm(r.mins)}</span>
        {r.lead && (
          <button onClick={e => { e.stopPropagation(); onLead(r.lead); }} title="Click for the full history of this cart"
            className={`font-mono text-blue-700 underline decoration-dotted underline-offset-2 hover:text-blue-900 cursor-pointer ${FOCUS}`}>{r.lead}</button>
        )}
        <span className="bg-gray-100 rounded px-1.5 py-0.5 text-[11px]">{STATUS_LABEL[status] || status}</span>
        {r.value ? <span className="tabular-nums">{inr(r.value)}</span> : null}
        {cats && <span className="truncate max-w-[240px]" title={cats}>{cats}</span>}
      </div>
      <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed text-gray-800">
        {text === undefined ? <span className="inline-block h-3 w-2/3 rounded bg-gray-100 animate-pulse align-middle" aria-label="Loading text" />
          : text === null ? <span className="text-gray-400">Text did not load</span>
            : <Highlight text={text} q={q} />}
      </div>
    </div>
  );
}
