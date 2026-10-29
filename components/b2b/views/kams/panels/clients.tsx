'use client';

import { ReactNode } from 'react';

import { daysUntil } from '../../../models/inbound';
import { KAM_LENS, KAM_LIST_PAGE_SIZE, queueAgeBand } from '../../../models/kam';
import { daysToLapse } from '../../../models/client';
import { fmtL } from '../../../models/mock-data';
import { AssignedClientRow, KamFirmLens } from '../../../types/kam';
import { Metric, StatusPill, TemperatureChip } from '../../../ui/client-chips';
import { Pager } from '../ui';

const FOLLOW_UP_LENSES: KamFirmLens[] = ['overdue', 'due', 'nofollow', 'called', 'upcoming'];
const th = 'text-left font-semibold px-3 py-2 whitespace-nowrap';
const td = 'px-3 py-2.5 align-top';

function FollowUp({ r, today }: { r: AssignedClientRow; today: string }) {
  if (!r.nextFollowUpDate) {
    return <span className="text-gray-300">none set</span>;
  }
  const late = r.followUp === 'overdue' ? Math.abs(daysUntil(r.nextFollowUpDate, today) ?? 0) : 0;
  const aged = late ? queueAgeBand(late) : null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono" style={{ color: r.followUp === 'overdue' ? '#DC2626' : r.followUp === 'today' ? '#EA580C' : '#4B5563' }}>
        {r.followUp === 'today' ? 'Today' : r.nextFollowUpDate}
      </span>
      {aged ? (
        <span className="w-fit px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: aged.color + '18', color: aged.color }}>
          {late}d overdue
        </span>
      ) : r.daysSinceContact !== undefined && <span className="text-[10px] text-gray-400">{r.daysSinceContact}d since contact</span>}
    </div>
  );
}

export function KamFirmTable({ lens, rows, today, search, valueText, page, setPage, onOpen, emptyAction }: {
  lens: KamFirmLens;
  rows: AssignedClientRow[];
  today: string;
  search: string;
  valueText?: string;
  page: number;
  setPage: (p: number) => void;
  onOpen: (clientId: string) => void;
  emptyAction?: ReactNode;
}) {
  const meta = KAM_LENS[lens];
  const pages = Math.max(1, Math.ceil(rows.length / KAM_LIST_PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const visible = rows.slice(cur * KAM_LIST_PAGE_SIZE, (cur + 1) * KAM_LIST_PAGE_SIZE);
  const showLogged = FOLLOW_UP_LENSES.includes(lens);
  const showLapse = lens === 'active' || lens === 'lapsing';

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="w-2 h-2 rounded-full shrink-0 self-center" style={{ background: meta.accent }} />
          <h2 className="text-[14px] font-bold text-gray-900">{search ? `${meta.title} matching “${search}”` : meta.title}</h2>
          <span className="text-[12px] font-semibold text-gray-400 tabular-nums">{rows.length}</span>
          {valueText && <span className="text-[12px] font-semibold text-gray-600">· {valueText}</span>}
        </div>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{meta.rule}</p>
      </div>

      {!rows.length ? (
        <div className="py-10 flex flex-col items-center gap-3">
          <p className="text-[12px] text-gray-400">{search ? `No firm here matches “${search}”.` : meta.empty}</p>
          {emptyAction}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gray-50 text-gray-400 text-[9px] uppercase tracking-wider">
                <th className={th}>Firm</th>
                <th className={th}>Contact</th>
                <th className={th}>Status</th>
                {showLapse && <th className={th}>Lapses in</th>}
                <th className={th}>Temp</th>
                <th className={th}>Last order</th>
                <th className={`${th} text-right`}>Revenue</th>
                <th className={th}>Next follow-up</th>
                {showLogged && <th className={th}>Last logged</th>}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const lapse = daysToLapse(r.metrics, today);
                const last = r.lastInteraction;
                return (
                  <tr key={r.client.id} onClick={() => onOpen(r.client.id)} className="border-t border-gray-100 cursor-pointer hover:bg-gray-50">
                    <td className={`${td} max-w-[240px]`}>
                      <div className="font-semibold text-gray-800 truncate">{r.company}</div>
                      <div className="text-[10px] text-gray-400 truncate">
                        {r.client.kam || 'unassigned'}
                        {r.segment && ` · Segment ${r.segment}`}
                        {` · ${r.source}`}
                        {r.upcomingProject && <span className="text-[#0F766E]"> · project noted</span>}
                      </div>
                    </td>
                    <td className={`${td} whitespace-nowrap text-gray-600`}>
                      {r.contactNumber
                        ? <a href={`tel:${r.contactNumber}`} onClick={(e) => e.stopPropagation()} className="font-mono hover:text-[#0F766E] hover:underline">{r.contactNumber}</a>
                        : <span className="text-gray-300">no number</span>}
                      {r.contactPerson && <div className="text-[10px] text-gray-400">{r.contactPerson}</div>}
                    </td>
                    <td className={td}><StatusPill status={r.status} days={lapse} /></td>
                    {showLapse && (
                      <td className={`${td} whitespace-nowrap font-mono text-gray-600`}>{lapse !== undefined ? `${lapse}d` : '—'}</td>
                    )}
                    <td className={td}><TemperatureChip value={r.temperature} previous={r.previousTemperature} at={r.temperatureAt} /></td>
                    <td className={`${td} whitespace-nowrap text-gray-600`}><Metric value={r.metrics.lastOrderPlaced} state={r.metrics.dateState} /></td>
                    <td className={`${td} text-right whitespace-nowrap`}>
                      <div className="font-mono font-semibold text-gray-800"><Metric value={r.metrics.totalRevenue} state={r.metrics.dateState} format={fmtL} /></div>
                      {!!r.metrics.orders && (
                        <div className="text-[10px] text-gray-400">
                          {r.metrics.orders} order{r.metrics.orders === 1 ? '' : 's'}
                          {r.metrics.averageOrderValue !== undefined && ` · avg ${fmtL(r.metrics.averageOrderValue)}`}
                        </div>
                      )}
                    </td>
                    <td className={`${td} whitespace-nowrap`}><FollowUp r={r} today={today} /></td>
                    {showLogged && (
                      <td className={`${td} max-w-[260px] text-gray-500`}>
                        {last ? (
                          <>
                            <div className="whitespace-nowrap">{last.type} · {String(last.date).slice(0, 10)}</div>
                            {last.summary && <div className="text-[10.5px] text-gray-400 truncate" title={last.summary}>{last.summary}</div>}
                          </>
                        ) : <span className="text-gray-300">nothing logged</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > 0 && <Pager total={rows.length} page={cur} pages={pages} size={KAM_LIST_PAGE_SIZE} setPage={setPage} />}
    </div>
  );
}
