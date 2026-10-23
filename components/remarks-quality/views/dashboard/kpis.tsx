'use client';

import { BNAME, BUCKET_COLORS, COPY_COLOR, INK, MUTED, PDESC, PNAME, SCORE_COLORS } from '../../constants';
import type { Group, Thresholds } from '../../types';
import { avg1, avgColor, count, fmt, pct, pctText } from '../../utils/format';
import { KPI_GRID, Kpi } from '../../ui';

export function PointerKpis({ tot, people, copyNothing, onLeads, onCopies }: {
  tot: Group<string>;
  people: number;
  copyNothing: boolean;
  onLeads: (score: number) => void;
  onCopies: () => void;
}) {
  const L = tot.L;
  return (
    <>
      <div className={`${KPI_GRID} md:grid-cols-4 xl:grid-cols-7`}>
        <Kpi label="Leads with remarks" value={fmt(L.n)} sub={`${fmt(tot.n)} remarks · ${fmt(people)} people`} accent={INK}
          onClick={() => onLeads(-1)} title="Leads that got at least one remark in these filters · click to see their remarks grouped by lead">
          {L.n > 0 && (
            <div className="flex h-2 rounded overflow-hidden mt-2.5 bg-gray-100">
              {L.d.map((x, i) => <i key={i} className="block" style={{ width: `${(x * 100) / L.n}%`, background: SCORE_COLORS[i] }} />)}
            </div>
          )}
        </Kpi>
        <Kpi label="Avg score per lead" accent={INK} color={L.n ? avgColor(L.avg) : MUTED}
          title="Average number of the 4 pointers (Need, Stuck, Who, Next + date) covered per lead"
          value={!L.n ? '–' : <>{avg1(L.avg)} <small className="text-[15px] text-gray-400 font-semibold">/ 4</small></>}
          sub="pointers covered, averaged over leads" />
        {[4, 3, 2, 1, 0].map(s => (
          <Kpi key={s} label={s === 4 ? 'All 4 pointers' : s === 0 ? 'None of the 4' : `${s} of 4`} accent={SCORE_COLORS[s]}
            color={SCORE_COLORS[s]} value={pctText(L.d[s], L.n)} sub={count(L.d[s], 'leads')}
            onClick={() => onLeads(s)} title={`Share of leads whose remarks cover ${s === 4 ? 'all 4' : s === 0 ? 'none' : `exactly ${s}`} of the pointers · click to see their remarks`} />
        ))}
      </div>
      <div className={`${KPI_GRID} md:grid-cols-3 xl:grid-cols-5`}>
        {PNAME.map((x, i) => (
          <Kpi key={x} label={x} title={PDESC[i]} value={pctText(L.cov[i], L.n)} sub={`of leads · ${count(L.cov[i], 'leads')}`}>
            <div className="h-1.5 rounded bg-gray-100 mt-2.5 overflow-hidden"><i className="block h-full" style={{ width: `${pct(L.cov[i], L.n)}%`, background: INK }} /></div>
          </Kpi>
        ))}
        <Kpi label="Copy-pasted remarks" accent={COPY_COLOR} color={COPY_COLOR} value={pctText(tot.cp, tot.n)}
          sub={`${fmt(tot.cp)} remarks · ${copyNothing ? 'scored as 0 pointers' : 'same text on 2+ leads same day'}`}
          onClick={onCopies} title="Same BM, same text, 2+ different leads on the same day · click to see these remarks" />
      </div>
    </>
  );
}

export function LengthKpis({ tot, people, thresholds, autoCount, includeAuto, onBucket }: {
  tot: Group<string>;
  people: number;
  thresholds: Thresholds;
  autoCount: number;
  includeAuto: boolean;
  onBucket: (tab: number) => void;
}) {
  const [t1, t2, t3] = thresholds;
  const ranges = [`1–${t1}`, `${t1 + 1}–${t2}`, `${t2 + 1}–${t3}`, `${t3 + 1}+`];
  return (
    <div className={`${KPI_GRID} md:grid-cols-4 xl:grid-cols-7`}>
      <Kpi label="Remarks written" value={fmt(tot.n)}
        sub={`${fmt(tot.leads.size)} leads · ${fmt(people)} people · avg ${tot.n ? fmt(Math.round(tot.len / tot.n)) : '–'} chars`}>
        {tot.n > 0 && (
          <div className="flex h-2 rounded overflow-hidden mt-2.5 bg-gray-100">
            {tot.b.map((x, i) => <i key={i} className="block" style={{ width: `${(x * 100) / tot.n}%`, background: BUCKET_COLORS[i] }} />)}
          </div>
        )}
      </Kpi>
      {BNAME.map((name, i) => (
        <Kpi key={name} label={`${name} · ${ranges[i]} chars`} accent={BUCKET_COLORS[i]} color={BUCKET_COLORS[i]}
          value={pctText(tot.b[i], tot.n)} sub={count(tot.b[i], 'remarks')} onClick={() => onBucket(i)}
          title={`Remarks of ${ranges[i]} characters after trimming spaces · click to see them`} />
      ))}
      <Kpi label="Copy-pasted" accent={COPY_COLOR} color={COPY_COLOR} value={pctText(tot.cp, tot.n)}
        sub={`${fmt(tot.cp)} remarks · same text on 2+ leads same day`} onClick={() => onBucket(9)} title="Same BM, same text, 2+ different leads on the same day · click to see these remarks" />
      <Kpi label="System stamps" color={MUTED} value={fmt(autoCount)} title="Auto-written remarks such as order_placed or Deal marked lost"
        sub={includeAuto ? 'included above' : 'excluded (order_placed, marked lost…)'} />
    </div>
  );
}
