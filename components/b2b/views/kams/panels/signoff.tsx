'use client';

import { ClientEntity } from '../../../models/client';
import { KAM_LENS, KAM_LIST_PAGE_SIZE, firmHandover, firmHandoverState } from '../../../models/kam';
import { fmtL } from '../../../models/mock-data';
import { HANDOVER_TAT_HOURS, hoursSince } from '../../../models/outreach/handover';
import { AssignedClientRow } from '../../../types/kam';
import { Metric } from '../../../ui/client-chips';
import { Pager } from '../ui';
import { useState } from 'react';

const th = 'text-left font-semibold px-3 py-2 whitespace-nowrap';
const td = 'px-3 py-2.5 align-top';
const btn = 'px-2.5 py-1 text-[11px] font-semibold rounded-md whitespace-nowrap disabled:opacity-50';

function Respond({ client, canAct, onRespond }: {
  client: ClientEntity;
  canAct: boolean;
  onRespond: (c: ClientEntity) => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const accept = async () => {
    setBusy(true);
    setError(null);
    const err = await onRespond(client);
    if (err) setError(err);
    setBusy(false);
  };
  if (!canAct) return <span className="text-[11px] text-gray-400">Waiting on {client.kam}</span>;
  return (
    <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
      <button disabled={busy} onClick={accept} className={`${btn} bg-[#0F766E] text-white self-start`}>Accept</button>
      {error && <span className="text-[10.5px] text-red-700">Not saved: {error}</span>}
    </div>
  );
}

export function KamSignoffTable({ rows, nowMs, page, setPage, canRespond, onRespond, onOpen }: {
  rows: AssignedClientRow[];
  nowMs: number;
  page: number;
  setPage: (p: number) => void;
  canRespond: (c: ClientEntity) => boolean;
  onRespond: (c: ClientEntity) => Promise<string | null>;
  onOpen: (clientId: string) => void;
}) {
  const meta = KAM_LENS.signoff;
  const pages = Math.max(1, Math.ceil(rows.length / KAM_LIST_PAGE_SIZE));
  const cur = Math.min(page, pages - 1);
  const visible = rows.slice(cur * KAM_LIST_PAGE_SIZE, (cur + 1) * KAM_LIST_PAGE_SIZE);

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="w-2 h-2 rounded-full shrink-0 self-center" style={{ background: meta.accent }} />
          <h2 className="text-[14px] font-bold text-gray-900">{meta.title}</h2>
          <span className="text-[12px] font-semibold text-gray-400 tabular-nums">{rows.length}</span>
        </div>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">{meta.rule}</p>
      </div>
      {!rows.length ? <p className="py-10 text-center text-[12px] text-gray-400">{meta.empty}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-gray-50 text-gray-400 text-[9px] uppercase tracking-wider">
                {['Firm', 'Assigned to', 'Assigned by', 'Waiting', 'Revenue', ''].map((h) => <th key={h} className={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => {
                const h = firmHandover(r.client)!;
                const overdue = firmHandoverState(r.client, nowMs) === 'overdue';
                const hours = Math.floor(hoursSince(h.at, nowMs));
                return (
                  <tr key={r.client.id} onClick={() => onOpen(r.client.id)} className="border-t border-gray-100 cursor-pointer hover:bg-gray-50">
                    <td className={`${td} max-w-[240px]`}>
                      <div className="font-semibold text-gray-800 truncate">{r.company}</div>
                      <div className="text-[10px] text-gray-400 truncate">{[r.segment && `Segment ${r.segment}`, r.source].filter(Boolean).join(' · ')}</div>
                    </td>
                    <td className={`${td} whitespace-nowrap text-gray-700`}>{h.kam}</td>
                    <td className={`${td} whitespace-nowrap text-gray-500`}>
                      {h.by || '—'}
                      {h.how === 'round-robin' && <div className="text-[10px] text-gray-400">round robin</div>}
                    </td>
                    <td className={`${td} whitespace-nowrap font-mono`} style={{ color: overdue ? '#DC2626' : '#4B5563' }}>
                      {hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d ${hours % 24}h`}
                      {overdue && <div className="text-[10px] font-sans font-semibold">past {HANDOVER_TAT_HOURS}h</div>}
                    </td>
                    <td className={`${td} whitespace-nowrap font-mono font-semibold text-gray-800`}>
                      <Metric value={r.metrics.totalRevenue} state={r.metrics.dateState} format={fmtL} />
                    </td>
                    <td className={td}><Respond client={r.client} canAct={canRespond(r.client)} onRespond={onRespond} /></td>
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
