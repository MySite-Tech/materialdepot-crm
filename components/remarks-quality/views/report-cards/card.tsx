'use client';

import { BAR_IDLE, INK, MUTED, PNAME, RANK_LAST, RANK_TOP, SCORE_COLORS } from '../../constants';
import type { Dicts, ScoreCtx } from '../../types';
import { DOW, DOW_LONG, dayOfWeek, dlabel } from '../../utils/dates';
import { avg1, avgColor, coverageColor, fmt, grade, pct, pctText, walkinBoxColor } from '../../utils/format';
import { bits, ptOf } from '../../utils/scoring';
import { ScoreBar } from '../../ui';
import type { Card } from './utils';

const delta = (dlt: number, step: number) =>
  dlt >= step ? ['text-green-700', '▲ +'] : dlt <= -step ? ['text-red-700', '▼ '] : ['', '● '];

function RankTag({ label, rank, of }: { label: string; rank: number; of: number }) {
  const color = rank <= 2 ? RANK_TOP : rank === of ? RANK_LAST : '#fff';
  return (
    <div className="text-[10px] uppercase tracking-wide text-gray-400">
      {label}
      <b className="block text-[19px] leading-tight normal-case tracking-normal" style={{ color }}>
        #{rank} <span className="text-[11px] font-semibold text-gray-400">out of {of} ECs</span>
      </b>
    </div>
  );
}

function CoverageBox({ c }: { c: Card }) {
  const p = c.cov * 100;
  const color = walkinBoxColor(p);
  const d7 = c.cov7 === null ? null : c.cov - c.cov7;
  const [cls, arrow] = d7 === null ? ['', ''] : delta(d7, 0.02);
  return (
    <div className="border-2 border-gray-900 rounded-xl px-3 py-2.5 mb-3.5">
      <div className="flex items-baseline gap-2.5">
        <span className="text-[30px] font-bold" style={{ color }}>{c.cv.n ? `${Math.round(p)}%` : '–'}</span>
        <span className="text-[13px]">
          <b>{fmt(c.cv.rem)} of {fmt(c.cv.n)}</b> walk-ins got a remark
          {c.cv.n - c.cv.rem > 0 && <> · <span className="font-bold text-red-700">{fmt(c.cv.n - c.cv.rem)} missed</span></>}
        </span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded overflow-hidden my-1.5"><i className="block h-full" style={{ width: `${p}%`, background: color }} /></div>
      <div className="text-[12px] text-gray-500">
        walk-in remarks filled the same day
        {d7 !== null && <> · vs last 7 days {Math.round(c.cov7! * 100)}% <span className={`font-bold ${cls}`}>{arrow}{Math.round(d7 * 100)}</span></>}
      </div>
    </div>
  );
}

export function ReportCard({ c, total, day, dicts, ctx, bestText }: {
  c: Card;
  total: number;
  day: string;
  dicts: Dicts;
  ctx: ScoreCtx;
  bestText: string | null | undefined;
}) {
  const { L } = c;
  const [gname, gcol] = L.n ? grade(L.avg) : ['No remarks', SCORE_COLORS[0]];
  const dlt = c.L7.n ? L.avg - c.L7.avg : null;
  const [dcls, darrow] = dlt === null ? ['', ''] : delta(dlt, 0.05);
  const topOk = c.bms.filter(g => g.att >= 3 || (g.L && g.L.n >= 3));
  const star = topOk.length && topOk[0].L ? topOk[0].k : null;
  const push = topOk.length > 1 ? topOk[topOk.length - 1].k : null;
  const bestBits = c.best ? bits(ptOf(c.best, ctx)) : 0;

  return (
    <article className="bg-white border border-gray-200 rounded-xl overflow-hidden max-w-[520px] min-w-0">
      <div className="bg-gray-900 text-white px-4 py-3.5 flex flex-wrap items-start gap-2.5">
        <div className="min-w-0">
          <h3 className="text-[19px] font-bold break-words">{c.name}</h3>
          <div className="text-[12px] text-gray-400 mt-0.5">CRM remarks report card · {DOW_LONG[dayOfWeek(day)]}, {dlabel(day)}</div>
        </div>
        <div className="ml-auto flex flex-col gap-1.5 text-right">
          <RankTag label="Remarks filled" rank={c.cr} of={total} />
          <RankTag label="Remarks quality" rank={c.qr} of={total} />
        </div>
      </div>
      <div className="px-4 pt-3.5 pb-4">
        <CoverageBox c={c} />
        <div className="flex items-center gap-4 mb-3">
          <div>
            <div className="text-[44px] font-bold leading-none tracking-tight" style={{ color: gcol }}>
              {L.n ? avg1(L.avg) : '–'}<small className="text-[18px] text-gray-400 font-semibold"> / 4</small>
            </div>
            <span className="inline-block mt-1.5 text-[11px] font-bold rounded px-2 py-0.5 text-white uppercase tracking-wide" style={{ background: gcol }}>{gname}</span>
            <div className="text-[12px] text-gray-500 mt-1">
              remark quality · {dlt === null ? 'no data for the previous 7 days' : <>vs last 7 days {avg1(c.L7.avg)}{' '}<span className={`font-bold ${dcls}`}>{darrow}{Math.abs(dlt) < 0.05 ? '0.0' : avg1(Math.abs(dlt))}</span></>}
            </div>
          </div>
          <div className="ml-auto flex items-end gap-[3px] h-[46px]" title="Avg score, last 7 days">
            {c.trend.map(t => (
              <div key={t.d} className="w-3 flex flex-col items-center justify-end h-full">
                <i className="block w-full rounded-t-sm" title={`${dlabel(t.d)}: ${t.L ? avg1(t.L.avg) : '–'}`}
                  style={{ height: t.L ? Math.max(3, (t.L.avg / 4) * 34) : 0, background: t.d === day ? INK : BAR_IDLE }} />
                <span className="text-[9px] text-gray-400 mt-0.5">{DOW[dayOfWeek(t.d)][0]}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-[1fr_1fr_1fr_1.45fr] gap-2 mb-3 text-[10px] uppercase tracking-wide font-semibold text-gray-500">
          <div className="bg-gray-50 rounded-lg px-2 py-1.5"><b className="block text-[17px] text-gray-900 normal-case tabular-nums">{fmt(L.n)}</b>Leads scored{c.skipped ? ` · +${c.skipped} done earlier` : ''}</div>
          <div className="bg-gray-50 rounded-lg px-2 py-1.5"><b className="block text-[17px] tabular-nums" style={{ color: SCORE_COLORS[4] }}>{pctText(L.d[4], L.n)}</b>All 4 covered</div>
          <div className="bg-gray-50 rounded-lg px-2 py-1.5"><b className="block text-[17px] tabular-nums" style={{ color: SCORE_COLORS[0] }}>{pctText(L.d[0], L.n)}</b>None covered</div>
          <div className="bg-gray-50 rounded-lg px-2 py-1.5" title="Avg score of leads getting their first-ever remark vs leads getting a follow-up remark">
            Avg score
            {([['New leads', c.first], ['Follow-ups', c.fol]] as const).map(([label, s]) => (
              <div key={label} className="flex justify-between items-baseline mt-0.5 normal-case tracking-normal">
                <em className="not-italic text-[11px] text-gray-900">{label}</em>
                <b className="text-[15px]" style={{ color: s.n ? avgColor(s.avg) : MUTED }}>{s.n ? avg1(s.avg) : '–'}</b>
              </div>
            ))}
          </div>
        </div>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">Pointer covered in % of leads</h4>
        <div className="grid grid-cols-[auto_1fr_auto] gap-x-2.5 gap-y-1.5 items-center text-[13px] mb-3">
          {PNAME.map((x, i) => {
            const v = pct(L.cov[i], L.n);
            return [
              <span key={`${x}l`}>{x}</span>,
              <div key={`${x}b`} className="h-2 bg-gray-100 rounded overflow-hidden"><i className="block h-full rounded" style={{ width: `${v}%`, background: coverageColor(v) }} /></div>,
              <span key={`${x}v`} className="font-bold text-right min-w-[38px] tabular-nums">{L.n ? `${Math.round(v)}%` : '–'}</span>,
            ];
          })}
        </div>
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">By BM · walk-ins remarked · quality score</h4>
        <div className="overflow-x-auto">
        <table className="w-full text-[13px] tabular-nums">
          <tbody>
            {c.bms.map(g => (
              <tr key={g.k} className="border-b border-gray-100">
                <td className="py-1 pr-1 whitespace-nowrap">
                  {g.k === star && <span className="text-amber-500">★ </span>}<b>{g.name}</b>
                  {g.k === push && <span className="ml-1 text-[11px] font-bold text-red-700">NEEDS PUSH</span>}
                </td>
                <td className="py-1 px-1 text-right whitespace-nowrap">
                  {g.att ? <><b>{fmt(g.rem)}/{fmt(g.att)}</b>{' '}<span className={g.cov! < 0.5 ? 'font-bold text-red-700' : 'text-gray-500'}>{Math.round(g.cov! * 100)}%</span></> : <span className="text-gray-400">–</span>}
                </td>
                <td className="py-1 px-1 text-right">{g.L ? <b style={{ color: avgColor(g.L.avg) }}>{avg1(g.L.avg)}</b> : <b className="text-red-700">–</b>}</td>
                <td className="py-1 pl-1 w-[34%]">{g.L ? <ScoreBar d={g.L.d} n={g.L.n} /> : <div className="h-2.5 rounded bg-gray-100" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        {c.best && bestBits >= 2 && (
          <div className="bg-amber-50 border-l-[3px] border-amber-400 rounded-md px-3 py-2 text-[13px] mt-3">
            <b>Remark of the day</b> · {bestBits}/4
            <div className="mt-1">
              {bestText === undefined ? '…' : bestText === null ? <span className="text-gray-400">Text did not load</span> : `“${bestText.length > 260 ? `${bestText.slice(0, 257)}…` : bestText}”`}
            </div>
            <div className="text-[11px] text-gray-500 mt-1">— {dicts.person[c.best.author] || ''} · {c.best.lead}</div>
          </div>
        )}
      </div>
      <div className="border-t border-gray-200 px-4 py-2 text-[11px] text-gray-500">
        Every walk-in gets a remark: <b>Need · Stuck · Who · Next + date</b>
      </div>
    </article>
  );
}
