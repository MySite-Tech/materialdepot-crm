'use client';

import type { DragEvent } from 'react';

import { ENQ_RESOLVE_CAP } from '../../../../../lib/b2b';
import { KAM_ORDER_STATUSES, KAM_ORDER_STATUS_COLORS, KAM_ORDER_STATUS_HINT } from '../../../constants/kam';
import { fmtL } from '../../../models/mock-data';
import { KamOrder, KamOrderStatus } from '../../../types/kam';
import { Dispatch, RefObject, SetStateAction } from 'react';

export function KamOrdersView({ boardScroll, legacyCount, orderStatusFilter, scopedOrders, setOrderModal, setOrderStatusFilter, sync, unlinkedOrders }: {
  boardScroll: { ref: RefObject<HTMLDivElement | null>; onDragOver: (e: DragEvent<Element>) => void; onDragEnd: () => void; onDrop: () => void; };
  legacyCount: number;
  orderStatusFilter: KamOrderStatus | "all";
  scopedOrders: KamOrder[];
  setOrderModal: Dispatch<SetStateAction<{ order: KamOrder; isNew: boolean; } | null>>;
  setOrderStatusFilter: Dispatch<SetStateAction<KamOrderStatus | "all">>;
  sync: { matched: number; noMatch: number; unavailable: number; overflow: number; advanced: number; writeErrors: string[]; } | null;
  unlinkedOrders: number;
}) {
  return (
    <>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <select value={orderStatusFilter} onChange={(e) => setOrderStatusFilter(e.target.value as 'all' | KamOrderStatus)}
          className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md bg-white cursor-pointer">
          <option value="all">All statuses</option>
          {KAM_ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {!!legacyCount && (
          <span className="text-[10px] text-gray-500" title="Stored under the old board's stage names; mapped on read, rewritten on save">
            {legacyCount} row{legacyCount === 1 ? '' : 's'}{' '}carry the old board&apos;s status wording
          </span>
        )}
        {!!unlinkedOrders && (
          <span className="text-[10px] text-amber-700" title="No client entity holds this order's phone number">
            {unlinkedOrders}{' '}not linked to a client entity
          </span>
        )}
      </div>
    
      {sync && (
        <div className="mb-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-600">
          <span className="font-semibold text-gray-700">Procurement sync:</span>{' '}
          <span className="text-[#0F766E] font-semibold">{sync.matched}</span> order value{sync.matched === 1 ? '' : 's'}{' '}fetched
          {!!sync.advanced && <> · <span className="text-[#0F766E] font-semibold">{sync.advanced}</span> status{sync.advanced === 1 ? '' : 'es'} advanced off the deal ticket</>}
          {!!sync.noMatch && <> · <span className="text-amber-700 font-semibold">{sync.noMatch}</span> Enquiry ID{sync.noMatch === 1 ? '' : 's'} matched no ticket on the client&apos;s number</>}
          {!!sync.unavailable && <> · <span className="text-blue-600 font-semibold">{sync.unavailable}</span> could not be reached (not the same as invalid)</>}
          {!!sync.overflow && <> · <span className="text-gray-500 font-semibold">{sync.overflow}</span> beyond the {ENQ_RESOLVE_CAP}-order cap, not attempted</>}
          {!sync.matched && !sync.advanced && !sync.noMatch && !sync.unavailable && !sync.overflow && ' nothing needed fetching.'}
          {!!sync.writeErrors.length && (
            <div className="text-red-600 mt-1">
              {sync.writeErrors.length} update{sync.writeErrors.length === 1 ? '' : 's'}{' '}could not be saved, so the{' '}
              board is ahead of the database until you reload: {sync.writeErrors.slice(0, 3).join('; ')}
            </div>
          )}
          <div className="text-[10px] text-gray-400 mt-0.5">
            An order with no Enquiry ID is never advanced — it is matched to its own ticket by an exact Enquiry ID,
            never off another order on the same client.
          </div>
        </div>
      )}
    
      <div ref={boardScroll.ref} className="flex gap-3 overflow-x-auto pb-3"
        onDragOver={boardScroll.onDragOver} onDragEnd={boardScroll.onDragEnd} onDrop={boardScroll.onDrop}>
        {(orderStatusFilter === 'all' ? KAM_ORDER_STATUSES : [orderStatusFilter]).map((s) => {
          const items = scopedOrders.filter((o) => o.status === s);
          const dealMoney = items.reduce((t, o) => t + (Number(o.orderValue) || 0), 0);
          const estimate = items.reduce((t, o) => t + (Number(o.estimatedValue) || 0), 0);
          return (
            <div key={s} className="w-[230px] shrink-0">
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                <div className="h-1" style={{ background: KAM_ORDER_STATUS_COLORS[s] }} />
                <div className="px-3 py-2 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500" title={KAM_ORDER_STATUS_HINT[s]}>{s}</span>
                    <span className="text-[11px] font-semibold text-gray-400">{items.length}</span>
                  </div>
                  <div className="text-[10px] text-gray-400 mt-0.5">
                    {dealMoney ? <span className="font-mono text-gray-600">{fmtL(dealMoney)}</span> : <span>no ticket value</span>}
                    {!!estimate && <span> · {fmtL(estimate)} est.</span>}
                  </div>
                </div>
                <div className="p-2 flex flex-col gap-2 min-h-[80px]">
                  {!items.length ? (
                    <div className="text-[11px] text-gray-300 text-center py-4">No orders</div>
                  ) : items.map((o) => (
                    <button key={o.id} onClick={() => setOrderModal({ order: o, isNew: false })}
                      className="text-left bg-white rounded-lg border border-gray-200 p-2.5 hover:border-[#EAB308] hover:shadow-sm transition-all cursor-pointer">
                      <div className="text-[12px] font-semibold text-gray-800 leading-tight">{o.company}</div>
                      <div className="text-[10px] text-gray-400 mt-0.5">{o.kam}{o.enqId ? ` · ${o.enqId}` : ''}</div>
                      {o.requirement && <div className="text-[11px] text-gray-500 mt-1 line-clamp-2">{o.requirement}</div>}
                      <div className="flex items-baseline justify-between mt-2">
                        <span className="text-[11px] font-mono font-semibold text-gray-700">
                          {o.orderValue !== undefined ? fmtL(o.orderValue) : <span className="text-gray-400 font-normal">no ticket</span>}
                        </span>
                        {o.estimatedValue !== undefined && (
                          <span className="text-[10px] text-gray-400" title="The KAM's estimate — never counted as revenue">{fmtL(o.estimatedValue)} est.</span>
                        )}
                      </div>
                      {o.expectedClosure && <div className="text-[10px] text-gray-400 mt-1">closes {o.expectedClosure}</div>}
                      {o.status === 'Lost' && (
                        <div className="text-[10px] text-red-600 mt-1">{o.lostReason || 'no reason recorded'}</div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    
      <p className="text-[10px] text-gray-400 mt-2">
        The bold figure on a card is the deal ticket&apos;s order value — the only figure counted as revenue. “est.” is
        the KAM&apos;s own estimate from §5.1 and is never summed into it. A card with “no ticket” at Closed means the
        Enquiry ID has not resolved yet, so that order contributes ₹0 to revenue until it does.
      </p>
    </>
  );
}
