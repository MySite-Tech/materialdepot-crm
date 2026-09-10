'use client';

import { CatAnalyticsApi } from '../../../data/cat-analytics';
import { useMemo } from 'react';

export function BookExecSection({
  api,
  from,
  to,
  bookings,
  executions,
  tats,
  bookLabel,
  execLabel,
  tatLabel,
  tatNote,
}: {
  api: CatAnalyticsApi | null;
  from: string;
  to: string;
  bookings: Array<{ date: string | null }>;
  executions: Array<{ date: string | null }>;
  tats: Array<number | null>;
  bookLabel: string;
  execLabel: string;
  tatLabel: string;
  tatNote: string;
}) {
  const html = useMemo(() => {
    if (!api) return '';
    const buckets = api.mdAnBuckets(from, to).map((b) => ({
      ...b,
      vals: [
        bookings.filter((x) => x.date && x.date >= b.from && x.date <= b.to).length,
        executions.filter((x) => x.date && x.date >= b.from && x.date <= b.to).length,
      ],
    }));
    const nb = bookings.length;
    const ne = executions.length;
    const days = Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000) + 1;
    const series = [
      { label: 'Booked (' + bookLabel + ')', color: '#5b3aa6' },
      { label: 'Executed (' + execLabel + ')', color: '#0f6e74' },
    ];
    const gap = nb - ne;
    return `
    <div class="an-sub-head">Bookings vs executions</div>
    <div class="an-deliv-row">
      <div class="an-deliv-stat"><div class="an-deliv-val" style="color:var(--purple)">${nb}</div><div class="an-deliv-lbl">Booked in range<br><span style="font-weight:400">${api.mdAnNum1(nb / days)} / day</span></div></div>
      <div class="an-deliv-stat"><div class="an-deliv-val" style="color:var(--teal)">${ne}</div><div class="an-deliv-lbl">Executed in range<br><span style="font-weight:400">${api.mdAnNum1(ne / days)} / day</span></div></div>
      <div class="an-deliv-stat"><div class="an-deliv-val" style="color:${gap > 0 ? 'var(--amber)' : 'var(--green)'}">${gap > 0 ? '+' : ''}${gap}</div><div class="an-deliv-lbl">Booked minus executed<br><span style="font-weight:400">${gap > 0 ? 'work flowing into the queue' : 'queue drained in this window'}</span></div></div>
      <div style="font-size:11.5px;color:var(--muted);align-self:center;max-width:340px;line-height:1.55">A booking counts on the day it was <b>sold</b>; an execution counts on the day the work was <b>done</b>. The two rarely land in the same bucket, which is the whole point of splitting them.</div>
    </div>
    <div style="padding:14px 20px 4px">${api.mdAnGrouped(buckets, series, 160)}</div>
    <div style="overflow-x:auto;padding:0 0 6px"><table class="an-inst-table">
      <thead><tr><th>${buckets.length && buckets[0].days === 1 ? 'Day' : 'Bucket'}</th><th style="text-align:right">Days</th>
        <th style="text-align:right">Booked</th><th style="text-align:right">Booked / day</th>
        <th style="text-align:right">Executed</th><th style="text-align:right">Executed / day</th></tr></thead>
      <tbody>${buckets
        .map(
          (b) => `<tr><td style="font-weight:700;white-space:nowrap">${b.label}</td>
        <td style="text-align:right;color:var(--muted)">${b.days}</td>
        <td style="text-align:right">${b.vals[0]}</td><td style="text-align:right;color:var(--muted)">${api.mdAnNum1(b.vals[0] / b.days)}</td>
        <td style="text-align:right">${b.vals[1]}</td><td style="text-align:right;color:var(--muted)">${api.mdAnNum1(b.vals[1] / b.days)}</td></tr>`
        )
        .join('')}</tbody>
    </table></div>
    <div class="an-sub-head">Turnaround — booking to execution</div>
    ${api.mdAnTatHtml(api.mdAnTatStats(tats), tatLabel)}
    <div style="font-size:11.5px;color:var(--muted);padding:0 20px 14px;line-height:1.6">${tatNote}</div>`;
  }, [api, from, to, bookings, executions, tats, bookLabel, execLabel, tatLabel, tatNote]);

  if (!api) return null;
  return <div className="md-an" dangerouslySetInnerHTML={{ __html: html }} />;
}
