'use client';

import { DEFAULT_CAP } from '../../audit-ops/shared';
import { cityOf, mapCaps, rosterQuery, sbGet, sbPatch, staffCapOn } from '../../siteAuditShared';
import { ASSIGNED_STATUSES, SLOT_DEFS, STORES } from '../../constants/store-team';
import { BookingSheet } from './sheet';
import { SlotContent } from './slot';
import { buildDateChips, cityOfStore, dstr, today } from '../../utils/store-team';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export default function SiteAuditStoreTeamView() {
  const dateChips = useMemo(buildDateChips, []);

  const [myStore, setMyStore] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(dateChips[0].ds);
  const [dayOrders, setDayOrders] = useState<any[]>([]);
  const [auditorCount, setAuditorCount] = useState(3);
  const [capBlocked, setCapBlocked] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [storeOverlay, setStoreOverlay] = useState<null | 'boot' | 'header'>(null);
  const [bookingSlot, setBookingSlot] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const [toastMsg, setToastMsg] = useState('');
  const [toastShow, setToastShow] = useState(false);
  const toastT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastShow(true);
    if (toastT.current) clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToastShow(false), 3200);
  }, []);

  const selectedDateRef = useRef(selectedDate);

  const myStoreRef = useRef(myStore);
  myStoreRef.current = myStore;
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadDay = useCallback(async (date: string, silent = false) => {
    setSelectedDate(date);
    selectedDateRef.current = date;
    if (!silent) {
      setLoading(true);
      setLoadError(false);
    }
    try {
      const [orders, auditors] = await Promise.all([
        sbGet(
          'audit_orders?select=id,pi,po,customer_name,phone,status,slot,date,auditor_id,bm,city,audit_ticked,log&date=eq.' +
            date +
            '&status=neq.deleted'
        ),

        rosterQuery('id,active_from,weekly_off,leave_dates,city').then(({ select, filter }) => sbGet('profiles?select=' + select + '&role=in.(site_auditor,auditor_installer)' + filter)),
      ]);

      if (!Array.isArray(orders) || !Array.isArray(auditors)) throw new Error('slot availability unavailable');

      const storeCity = cityOfStore(myStoreRef.current);
      const orderList = orders.filter((o: any) => cityOf(o) === storeCity);

      const roster = auditors
        .filter((a: any) => cityOf(a) === storeCity)
        .map((a: any) => ({
          id: a.id as string,
          activeFrom: a.active_from || null,
          weeklyOff: a.weekly_off == null ? null : a.weekly_off,
          leaveDates: Array.isArray(a.leave_dates) ? a.leave_dates : [],
          ...mapCaps(a),
        }));
      const workingToday = roster.filter((a) => staffCapOn(a, date, DEFAULT_CAP) >= 1);

      const blocked = new Set<string>();
      for (const a of workingToday) {
        const load = orderList.filter((o: any) => o.auditor_id === a.id && ASSIGNED_STATUSES.includes(o.status)).length;
        if (load >= staffCapOn(a, date, DEFAULT_CAP)) blocked.add(a.id);
      }
      setDayOrders(orderList);
      setAuditorCount(workingToday.length);
      setCapBlocked(blocked);
      setLoading(false);
    } catch (e) {
      if (!silent) {
        setLoadError(true);
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!myStore) {
      setStoreOverlay('boot');
      return;
    }
    loadDay(selectedDateRef.current);
    refreshTimer.current = setInterval(() => {
      if (!document.hidden) loadDay(selectedDateRef.current, true);
    }, 30000);
    const onVis = () => {
      if (!document.hidden && selectedDateRef.current) loadDay(selectedDateRef.current, true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [myStore, loadDay]);

  useEffect(() => {
    return () => {
      if (toastT.current) clearTimeout(toastT.current);
    };
  }, []);

  const selectStore = (s: string) => {
    setMyStore(s);
    setStoreOverlay(null);
  };

  const onDateClick = (ds: string) => {
    loadDay(ds);
  };

  const cancelReservation = async (id: string) => {
    if (!window.confirm('Cancel this slot reservation?')) return;
    setCancellingId(id);
    try {
      await sbPatch('audit_orders', id, { status: 'deleted' });
      toast('Slot reservation cancelled.');
      loadDay(selectedDateRef.current);
    } catch (e) {
      toast('Failed to cancel — please try again.');
      setCancellingId(null);
    }
  };

  const isMyBooking = (o: any) =>
    o.status === 'slot_reserved' && ((o.log && o.log[0] && o.log[0].who === myStore) || o.bm === myStore);
  const myRes = dayOrders.filter(isMyBooking);
  const allBooked = dayOrders.filter((o) => o.status !== 'slot_reserved');

  const isToday = selectedDate === dstr(today);
  const nowMin = isToday
    ? (() => {
        const n = new Date();
        return n.getHours() * 60 + n.getMinutes();
      })()
    : null;

  const bookingSlotDef = bookingSlot ? SLOT_DEFS.find((s) => s.id === bookingSlot) : null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-black">Store Team</h1>
          <p className="text-[13px] text-gray-500">Pre-book Site Audit visit slots for walk-in customers.</p>
        </div>
        <button
          className="bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-md text-[13px] font-medium cursor-pointer hover:bg-gray-50"
          onClick={() => setStoreOverlay('header')}
        >
          {myStore || 'Select store'}
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1 mb-4">
        {dateChips.map((c) => (
          <div
            key={c.ds}
            onClick={() => onDateClick(c.ds)}
            className={`flex flex-col items-center justify-center w-14 h-14 shrink-0 rounded-lg border cursor-pointer select-none ${
              c.ds === selectedDate
                ? 'border-[#EAB308] bg-yellow-50 text-gray-900'
                : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide">{c.lbl}</div>
            <div className="text-sm font-bold">{c.num}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-gray-400 text-[13px]">
          <span className="animate-spin border-2 border-gray-300 border-t-[#EAB308] rounded-full h-5 w-5"></span>
        </div>
      ) : loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 text-red-600 text-[13px] font-semibold px-4 py-3">
          Failed to load — check connection.
        </div>
      ) : (
        <SlotContent
          date={selectedDate}
          myStore={myStore}
          dayOrders={dayOrders}
          auditorCount={auditorCount}
          capBlocked={capBlocked}
          storeCity={cityOfStore(myStore)}
          myRes={myRes}
          allBooked={allBooked}
          nowMin={nowMin}
          isMyBooking={isMyBooking}
          cancellingId={cancellingId}
          onBook={(slotId: string) => setBookingSlot(slotId)}
          onCancel={cancelReservation}
        />
      )}

      {storeOverlay && (
        <div
          className="fixed inset-0 bg-black/30 z-[900] flex items-center justify-center"
          onClick={
            storeOverlay === 'header'
              ? (e) => {
                  if (e.target === e.currentTarget) setStoreOverlay(null);
                }
              : undefined
          }
        >
          <div className="bg-white rounded-lg shadow-xl w-[90%] max-w-sm p-5">
            <div className="text-base font-bold text-black mb-1">Select your store</div>
            <div className="text-[13px] text-gray-500 mb-4">Choose the experience centre you're working at today.</div>
            <div className="flex flex-col gap-2">
              {STORES.map((s) => (
                <div
                  key={s}
                  onClick={() => selectStore(s)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-md border cursor-pointer text-[13px] font-medium ${
                    myStore === s ? 'border-[#EAB308] bg-yellow-50 text-gray-900' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${myStore === s ? 'bg-[#EAB308]' : 'bg-gray-300'}`}></div>
                  {s}
                </div>
              ))}
            </div>
            <div className="text-[11.5px] text-gray-400 text-center pt-3">Contact IT to add a new store.</div>
          </div>
        </div>
      )}

      {bookingSlot && bookingSlotDef && (
        <BookingSheet
          slot={bookingSlotDef}
          date={selectedDate}
          myStore={myStore as string}
          onClose={() => setBookingSlot(null)}
          onBooked={(name: string) => {
            setBookingSlot(null);
            toast('Slot booked for ' + name + ' · ' + bookingSlotDef.label);
            loadDay(selectedDateRef.current);
          }}
        />
      )}

      <div
        className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[1000] bg-gray-900 text-white text-[13px] font-medium px-4 py-2.5 rounded-md shadow-lg transition-opacity duration-300 ${
          toastShow ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {toastMsg}
      </div>
    </div>
  );
}
