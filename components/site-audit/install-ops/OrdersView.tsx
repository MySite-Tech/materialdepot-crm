'use client';

import { Chip, MapLink, OrderCategoryPills, StatTile, SubjobSummary } from './ui';
import { INSTALL_SKU, dstr, fmtDate, installOrderHasDate, opsCallDue, today } from './shared';
import type { InstallOrder, Installer, ViewKey } from './types';

const FILTERS = ['all', 'followup', 'pending', 'deliv_delayed', 'created', 'scheduled', 'assigned', 'partial', 'completed'];
const FILTER_LABELS: Record<string, string> = {
  all: 'All', followup: 'Follow-up set', pending: 'Pending', deliv_delayed: 'Delivery Delayed', created: 'Service Created',
  scheduled: 'Site Installation Scheduled', assigned: 'Site Installer Assigned', partial: 'Partially Completed', completed: 'Site Installation Completed',
  unassigned: 'Unassigned installer',
};

/* A sub-job already has a date but no installer on it — the SM's top
   priority to call and assign, easy to miss in a plain unsorted list. */
function isUnassignedScheduled(o: InstallOrder): boolean {
  return (o.subjobs || []).some((sj) => !!sj.date && !sj.installer_email);
}

interface Props {
  orders: InstallOrder[];
  installers: Installer[];
  filterStatus: string;
  setFilterStatus: (s: string) => void;
  filterDate: string;
  setFilterDate: (s: string) => void;
  searchQ: string;
  setSearchQ: (s: string) => void;
  sortDelivery: 'asc' | 'desc';
  setSortDelivery: (fn: (s: 'asc' | 'desc') => 'asc' | 'desc') => void;
  onOpenOrder: (pi: string) => void;
  onOpenKylas: () => void;
  onOpenAddOrder: () => void;
  onGoView: (v: ViewKey) => void;
}

export default function OrdersView({
  orders, installers, filterStatus, setFilterStatus, filterDate, setFilterDate, searchQ, setSearchQ,
  sortDelivery, setSortDelivery, onOpenOrder, onOpenKylas, onOpenAddOrder, onGoView,
}: Props) {
  const c: Record<string, number> = {};
  Object.keys({ pending: 1, deliv_ontime: 1, deliv_delayed: 1, created: 1, call_na: 1, scheduled: 1, assigned: 1, callpending: 1, reschedule: 1, onway: 1, atsite: 1, partial: 1, completed: 1 }).forEach((k) => (c[k] = 0));
  orders.forEach((o) => (c[o.status] = (c[o.status] || 0) + 1));
  const opsDue = orders.filter(opsCallDue).length;
  const unassignedScheduled = orders.filter(isUnassignedScheduled).length;
  const todayStr = dstr(today);

  const filteredOrders = orders
    .filter((o) => {
      if (filterStatus !== 'all') {
        if (filterStatus === 'opsdue') return opsCallDue(o);
        if (filterStatus === 'unassigned') return isUnassignedScheduled(o);
        if (filterStatus === 'followup') return !!(o.service && o.service.follow_up_date);
        if (filterStatus === 'live') return ['scheduled', 'assigned', 'partial', 'onway', 'atsite'].includes(o.status);
        if (o.status !== filterStatus) return false;
      }
      if (filterDate && !installOrderHasDate(o, filterDate)) return false;
      if (searchQ) {
        const q = searchQ.toLowerCase();
        return (o.pi + o.name + o.phone + o.bm + o.skus.map((s) => s.c).join()).toLowerCase().includes(q);
      }
      return true;
    })
    .sort((a, b) => {
      const unassignedDiff = Number(isUnassignedScheduled(b)) - Number(isUnassignedScheduled(a));
      if (unassignedDiff) return unassignedDiff;
      const da = a.deliveryDate || '', db = b.deliveryDate || '';
      return sortDelivery === 'asc' ? da.localeCompare(db) : db.localeCompare(da);
    });

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Installation orders</h1>
          <p className="text-[13px] text-gray-500 mt-0.5">Every confirmed order containing the Installation SKU ({INSTALL_SKU}). Delivery is confirmed before service creation.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button className="bg-white text-gray-700 border border-gray-200 px-3.5 py-2 rounded-md text-[13px] font-semibold hover:bg-gray-50" onClick={onOpenKylas}>📋 Pending POs</button>
          <button className="bg-[#1F3A5F] text-white border-none px-3.5 py-2 rounded-md text-[13px] font-semibold hover:opacity-90" onClick={onOpenAddOrder}>+ Add New Order</button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <StatTile n={orders.length} l="Installation orders" colorClass="text-[#1F3A5F]" onClick={() => setFilterStatus('all')} />
        <StatTile n={opsDue} l="Ops calls due today" colorClass="text-amber-700" onClick={() => onGoView('calls')} />
        <StatTile n={c.deliv_delayed} l="Delivery delayed" colorClass="text-red-700" onClick={() => setFilterStatus('deliv_delayed')} />
        {unassignedScheduled ? <StatTile n={unassignedScheduled} l="Unassigned installer" colorClass="text-red-700" onClick={() => setFilterStatus('unassigned')} /> : null}
        <StatTile n={c.scheduled + c.assigned + c.partial} l="Scheduled / in progress" colorClass="text-blue-700" onClick={() => setFilterStatus('live')} />
        <StatTile n={c.completed} l="Completed" colorClass="text-green-700" onClick={() => setFilterStatus('completed')} />
      </div>

      {opsDue ? (
        <div className="rounded-lg border border-gray-200 border-l-4 border-l-amber-500 bg-white px-4 py-3 mb-4 flex items-center gap-4">
          <div>
            <div className="font-extrabold text-amber-700 text-sm">☎ {opsDue} order{opsDue > 1 ? 's' : ''} need an Operations call today</div>
            <div className="text-[12.5px] text-gray-500 mt-0.5">Custom wallpaper: 3 days before delivery · everything else: 1 day before. Confirm delivery before creating the service.</div>
          </div>
          <button className="ml-auto bg-amber-600 text-white px-3.5 py-2 rounded-md text-[13px] font-semibold hover:opacity-90 shrink-0" onClick={() => onGoView('calls')}>Review calls</button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[220px]">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">⚲</span>
          <input placeholder="Search PI, customer, phone, SKU…" value={searchQ} onChange={(e) => setSearchQ(e.target.value)} className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-200 rounded-md outline-none focus:border-yellow-400" />
        </div>
        <button className="bg-white border border-gray-200 text-gray-700 px-3 py-2 rounded-md text-[13px] font-semibold whitespace-nowrap hover:bg-gray-50" onClick={() => setSortDelivery((s) => (s === 'asc' ? 'desc' : 'asc'))}>
          Delivery date {sortDelivery === 'asc' ? '↑' : '↓'}
        </button>
        <div className="flex items-center gap-1.5 shrink-0">
          <input
            type="date"
            value={filterDate}
            title="Filter by install date"
            onChange={(e) => setFilterDate(e.target.value)}
            className={`border rounded-md px-2.5 py-2 text-[13px] font-semibold outline-none cursor-pointer bg-white ${filterDate ? 'border-yellow-400 text-gray-900' : 'border-gray-200 text-gray-400'}`}
          />
          {filterDate ? <button onClick={() => setFilterDate('')} className="border-0 bg-red-100 text-red-600 rounded-md px-2.5 py-2 font-bold text-xs whitespace-nowrap">✕ Clear date</button> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(unassignedScheduled ? ['unassigned', ...FILTERS] : FILTERS).map((f) => (
            <button
              key={f}
              className={filterStatus === f ? 'bg-[#1A1A1A] text-white px-3 py-1.5 rounded-full text-xs font-semibold' : 'bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full text-xs font-semibold'}
              onClick={() => setFilterStatus(f)}
            >
              {FILTER_LABELS[f] || f}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              {['PI / PO', 'SKUs (audit match)', 'Categories', 'Customer', 'Address', 'Delivery date', 'Install sub-jobs', 'Status'].map((h) => (
                <th key={h} className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredOrders.length ? filteredOrders.map((o) => {
              const delayed = o.status === 'deliv_delayed';
              const delivClass = delayed ? 'text-red-600' : o.status === 'deliv_ontime' || ['created', 'scheduled', 'assigned', 'partial', 'completed'].includes(o.status) ? 'text-green-700' : 'text-gray-900';
              const auditBadge = o.auditBy === 'material_depot'
                ? <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">MD Audit</span>
                : o.auditBy === 'customer' ? <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">Cust Audit</span> : null;
              const fu = o.service && o.service.follow_up_date;
              return (
                <tr key={o.pi} className="hover:bg-gray-50 cursor-pointer" onClick={(e) => { if ((e.target as HTMLElement).closest('.maplink-stop')) return; onOpenOrder(o.pi); }}>
                  <td className="px-3 py-2.5 border-t border-gray-100 align-top">
                    <div className="font-mono text-xs font-extrabold text-[#1F3A5F]">{o.pi}</div>
                    <div className="font-mono text-[11px] text-gray-400">{o.po.join(' · ')}</div>
                  </td>
                  <td className="px-3 py-2.5 border-t border-gray-100 align-top">
                    <div className="flex flex-wrap gap-1">
                      {o.skus.map((s, i) => (
                        <span key={i} className={`inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold whitespace-nowrap ${s.type === 'install' ? 'bg-green-100 text-green-800' : /CUST/.test(s.c) ? 'bg-orange-100 text-orange-800' : 'bg-gray-100 text-[#1F3A5F]'}`}>{s.c}</span>
                      ))}
                    </div>
                    {auditBadge ? <div className="mt-1">{auditBadge}</div> : null}
                  </td>
                  <td className="px-3 py-2.5 border-t border-gray-100 align-top"><OrderCategoryPills o={o} /></td>
                  <td className="px-3 py-2.5 border-t border-gray-100 align-top"><div className="text-[13px]"><b>{o.name}</b><div className="text-gray-500">{o.phone}</div></div></td>
                  <td className="px-3 py-2.5 border-t border-gray-100 align-top w-[170px] max-w-[170px]"><span className="maplink-stop block min-w-0"><MapLink addr={o.addr} /></span></td>
                  <td className="px-3 py-2.5 border-t border-gray-100 align-top whitespace-nowrap">
                    <span className={`font-bold text-[12.5px] ${delivClass}`}>{fmtDate(o.deliveryDate)}</span>
                    {opsCallDue(o) ? <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">Call Ops</span> : null}
                  </td>
                  <td className="px-3 py-2.5 border-t border-gray-100 align-top w-[220px] max-w-[220px]"><SubjobSummary o={o} installers={installers} /></td>
                  <td className="px-3 py-2.5 border-t border-gray-100 align-top">
                    <Chip st={o.status} />
                    {o.service && o.service.rectification_raised ? <span className="ml-1 inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700">RECT</span> : null}
                    {fu ? (
                      <div className="mt-1">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${fu <= todayStr ? 'bg-amber-100 text-amber-700' : 'bg-yellow-50 text-yellow-800'}`}>
                          📅 {fu === todayStr ? 'Follow-up today' : fu < todayStr ? 'Follow-up overdue' : fmtDate(fu)}
                        </span>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            }) : <tr><td colSpan={8} className="text-center text-gray-400 py-8 border-t border-gray-100">No orders match.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
