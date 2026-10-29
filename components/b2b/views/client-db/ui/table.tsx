'use client';

import { fmtDate, fmtGst, fmtPhone } from '../../../drawers/firm/utils';
import { ClientEntity, contactLabel, contactNumbers, currentTemperature, gstNumbers, primaryContact } from '../../../models/client';
import { firmHandover } from '../../../models/kam';
import { fmtShortINR } from '../../../models/mock-data';
import { Metric, StatusPill, TemperatureChip } from '../../../ui/client-chips';
import { SORT_FIRST_DIR } from '../constants';
import { ClientListRow, SortKey, SortState } from '../types';
import { sinceLabel } from '../utils';

function More({ n }: { n: number }) {
  if (n <= 0) return null;
  return <span className="ml-1.5 px-1.5 py-px rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold font-sans">+{n}</span>;
}

function SortTh({ label, k, sort, onSort, align = 'left', className = '' }: {
  label: string;
  k: SortKey;
  sort: SortState;
  onSort: (s: SortState) => void;
  align?: 'left' | 'right';
  className?: string;
}) {
  const on = sort.key === k;
  const next: SortState = on
    ? { key: k, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
    : { key: k, dir: SORT_FIRST_DIR[k] };
  return (
    <th className={`font-semibold py-2.5 ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      <button
        onClick={() => onSort(next)}
        title={`Sort by ${label.toLowerCase()}`}
        className={`inline-flex items-center gap-1 uppercase tracking-wider hover:text-gray-800 ${on ? 'text-gray-800' : ''}`}
      >
        {label}
        <span className={on ? '' : 'opacity-0 group-hover/th:opacity-40'}>{on && sort.dir === 'asc' ? '▲' : '▼'}</span>
      </button>
    </th>
  );
}

function KamCell({ client }: { client: ClientEntity }) {
  const h = firmHandover(client);
  if (client.kam) {
    return (
      <>
        <span className="text-gray-700">{client.kam}</span>
        {h?.status === 'Pending' && (
          <div className="text-[10px] font-semibold text-violet-700 mt-0.5" title={`Assigned by ${h.by || 'an admin'}. Counts as theirs, and waits for them to accept or reject.`}>waiting for sign-off</div>
        )}
      </>
    );
  }
  return (
    <>
      <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-50 text-red-700">No KAM</span>
      {h?.status === 'Rejected' && (
        <div className="text-[10px] text-red-700 mt-1 max-w-[180px] truncate" title={`${h.kam} rejected it: ${h.rejectReason || 'no reason'}`}>
          {h.kam} rejected: {h.rejectReason || 'no reason'}
        </div>
      )}
    </>
  );
}

export function ClientTable({ rows, today, sort, onSort, onOpen, picked, onPick, onPickPage }: {
  rows: ClientListRow[];
  today: string;
  sort: SortState;
  onSort: (s: SortState) => void;
  onOpen: (c: ClientEntity) => void;
  picked?: Set<string>;
  onPick?: (id: string) => void;
  onPickPage?: () => void;
}) {
  const allOnPage = !!picked && rows.length > 0 && rows.every((r) => picked.has(r.client.id));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px] min-w-[1000px]">
        <thead>
          <tr className="group/th bg-gray-50 text-gray-400 text-[9px] uppercase tracking-wider border-b border-gray-200">
            {picked && (
              <th className="pl-4 w-6"><input type="checkbox" checked={allOnPage} onChange={onPickPage} aria-label="Select this page" /></th>
            )}
            <SortTh label="Firm" k="company" sort={sort} onSort={onSort} className="px-4" />
            <th className="text-left font-semibold px-3 py-2.5">Primary contact</th>
            <th className="text-left font-semibold px-3 py-2.5">GST</th>
            <SortTh label="Orders" k="orders" sort={sort} onSort={onSort} align="right" className="px-3" />
            <SortTh label="Revenue" k="revenue" sort={sort} onSort={onSort} align="right" className="px-3" />
            <SortTh label="Last order" k="lastOrder" sort={sort} onSort={onSort} className="px-3 pl-5" />
            <th className="text-left font-semibold px-3 py-2.5">Status</th>
            <th className="text-left font-semibold px-3 py-2.5">KAM</th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ client, metrics, status, days }) => {
            const primary = primaryContact(client.contacts);
            const numbers = contactNumbers(client.contacts);
            const gsts = gstNumbers(client.gsts);
            const temp = currentTemperature(client.interactions);
            const since = sinceLabel(metrics.lastOrderPlaced, today);
            return (
              <tr key={client.id} onClick={() => onOpen(client)} className="group border-t border-gray-100 cursor-pointer hover:bg-teal-50/40">
                {picked && (
                  <td className="pl-4" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={picked.has(client.id)} onChange={() => onPick?.(client.id)} aria-label={`Select ${client.company}`} />
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-[13px] text-gray-900">{client.company || <span className="text-gray-300">(unnamed)</span>}</span>
                    {temp && (
                      <span className="inline-flex items-center gap-1" title="Temperature: the KAM's latest 0–10 reading of the account">
                        <span className="text-[9px] uppercase tracking-wider text-gray-400">temp</span>
                        <TemperatureChip value={temp.value} at={temp.at} />
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {[client.clientType, client.segment && `Segment ${client.segment}`].filter(Boolean).join(' · ') || 'Type and segment not set'}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="text-gray-700 truncate max-w-[220px]">{contactLabel(primary) || <span className="text-gray-300">No name</span>}</div>
                  <div className="font-mono text-[11px] text-gray-500 mt-0.5 whitespace-nowrap">
                    {primary?.number ? fmtPhone(primary.number) : <span className="text-amber-600 font-sans">no number</span>}
                    <More n={numbers.length - 1} />
                  </div>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {gsts.length
                    ? <span className="font-mono text-[11px] text-gray-600">{fmtGst(gsts[0])}<More n={gsts.length - 1} /></span>
                    : <span className="text-[11px] text-gray-300">No GST</span>}
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-gray-700"><Metric value={metrics.orders} state={metrics.dateState} /></td>
                <td className="px-3 py-2.5 text-right font-mono font-semibold text-gray-900 whitespace-nowrap"><Metric value={metrics.totalRevenue} state={metrics.dateState} format={fmtShortINR} /></td>
                <td className="px-3 pl-5 py-2.5 whitespace-nowrap">
                  {metrics.dateState === 'no-orders'
                    ? <span className="text-gray-400">Never ordered</span>
                    : (
                      <>
                        <div className="text-gray-700"><Metric value={metrics.lastOrderPlaced ? fmtDate(metrics.lastOrderPlaced) : undefined} state={metrics.dateState} /></div>
                        {since && (
                          <div
                            className={`text-[10.5px] mt-0.5 ${since === 'future date' ? 'text-amber-600 font-semibold' : 'text-gray-400'}`}
                            title={since === 'future date' ? 'This date is after today, so a ticket is probably mis-dated in Django. It still counts the firm as Active.' : undefined}
                          >
                            {since}
                          </div>
                        )}
                      </>
                    )}
                </td>
                <td className="px-3 py-2.5">
                  <StatusPill status={status} days={days} />
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <KamCell client={client} />
                </td>
                <td className="pr-3 text-gray-300 group-hover:text-[#0F766E] text-[14px]">›</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
