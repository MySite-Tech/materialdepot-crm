'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sbGet, sbPost, sbPatch, fmtDate } from './siteAuditShared';

/* Verbatim port of material-depot-site's app/src/pages/StoreTeam.jsx (slot-
   booking tool for in-store staff to pre-book Site Audit visit slots for
   walk-in customers). Same business logic (SLOT_DEFS, STORES, slotsConflict,
   getAvailability, genSlotPI, buildDateChips) and same sbGet/sbPost/sbPatch
   queries against `audit_orders` — restyled to this CRM's Tailwind
   conventions. The only deliberate behavior change: the original persists
   the selected store via localStorage (shared kiosk device per store); here
   it's plain in-component state since a CRM user's browser/session isn't a
   fixed device. */

interface SlotDef {
  id: string;
  label: string;
  rangeEnd: string;
  startMin: number;
  endMin: number;
  group: 'Morning' | 'Afternoon' | 'Evening';
}

const STORES = ['JP Nagar', 'Whitefield', 'Yelahanka', 'Gachibowli', 'Kompally', 'HSR Layout'];

const SLOT_DEFS: SlotDef[] = [
  { id: '10:00', label: '10:00 AM', rangeEnd: '11:00 AM', startMin: 600, endMin: 660, group: 'Morning' },
  { id: '11:00', label: '11:00 AM', rangeEnd: '12:00 PM', startMin: 660, endMin: 720, group: 'Morning' },
  { id: '13:00', label: '1:00 PM', rangeEnd: '2:00 PM', startMin: 780, endMin: 840, group: 'Afternoon' },
  { id: '14:00', label: '2:00 PM', rangeEnd: '3:00 PM', startMin: 840, endMin: 900, group: 'Afternoon' },
  { id: '16:00', label: '4:00 PM', rangeEnd: '5:00 PM', startMin: 960, endMin: 1020, group: 'Evening' },
  { id: '17:00', label: '5:00 PM', rangeEnd: '6:00 PM', startMin: 1020, endMin: 1080, group: 'Evening' },
];
/* Strong evening cutoff: after this time (local) the store can no longer pre-book TOMORROW's
   morning slots — the service manager leaves early and can't absorb a last-minute morning booking
   made the evening before. Later slots tomorrow and all slots on later days stay open. SMs are
   unaffected; this is Store-Team-only. */
const MORNING_CUTOFF_MIN = 18 * 60; // 6:00 PM
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/* ── Local date helpers (mirrors material-depot-site's lib/dates.js; not
   worth promoting to the shared file for a handful of lines). ────────────── */
function dstr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
const today = (() => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
})();

/* True when `date` is tomorrow and the local clock is past the morning cutoff — used to hide
   tomorrow's morning slots from the store's booking list. */
function morningCutoffHit(date: string): boolean {
  const tmr = new Date(today);
  tmr.setDate(tmr.getDate() + 1);
  if (date !== dstr(tmr)) return false;
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes() >= MORNING_CUTOFF_MIN;
}

/* ── Business logic (verbatim from StoreTeam.jsx) ─────────────────────────── */
function fmtSlotId(id: string) {
  const s = SLOT_DEFS.find((x) => x.id === id);
  return s ? s.label : '—';
}

function slotsConflict(slotA: SlotDef, slotB: SlotDef) {
  const gapAB = slotB.startMin - slotA.endMin;
  const gapBA = slotA.startMin - slotB.endMin;
  if (gapAB < 0 && gapBA < 0) return true;
  return (gapAB >= 0 && gapAB < 120) || (gapBA >= 0 && gapBA < 120);
}

function getAvailability(slotId: string, dayOrders: any[], auditorCount: number) {
  const slot = SLOT_DEFS.find((s) => s.id === slotId);
  if (!slot) return { available: 0, total: auditorCount, used: 0 };
  const blockedAuditors = new Set<string>();
  let reservationConflicts = 0;
  for (const o of dayOrders) {
    if (o.status === 'deleted' || o.status === 'slot_converted') continue;
    if (o.status === 'slot_reserved' && !o.auditor_id) {
      const nm = (o.customer_name || '').trim().toLowerCase();
      const absorbed = dayOrders.some(
        (r) =>
          r.slot === o.slot &&
          r.status !== 'deleted' &&
          r.status !== 'slot_reserved' &&
          r.status !== 'slot_converted' &&
          ((o.po && r.pi === o.po) || (nm && (r.customer_name || '').trim().toLowerCase() === nm))
      );
      if (absorbed) continue;
    }
    const oSlot = SLOT_DEFS.find((s) => s.id === o.slot);
    if (!oSlot || !slotsConflict(slot, oSlot)) continue;
    if (o.auditor_id) {
      blockedAuditors.add(o.auditor_id);
    } else {
      reservationConflicts++;
    }
  }
  const used = blockedAuditors.size + reservationConflicts;
  return { available: Math.max(0, auditorCount - used), total: auditorCount, used };
}

function genSlotPI(store: string) {
  const ts = Date.now().toString().slice(-9);
  const code = store.replace(/\s+/g, '').toUpperCase().slice(0, 6);
  return 'SRES-' + code + '-' + ts;
}

function buildDateChips() {
  const t = today;
  const chips: Array<{ ds: string; lbl: string; num: number }> = [];
  for (let i = 0; chips.length < 14 && i < 30; i++) {
    const d = new Date(t);
    d.setDate(t.getDate() + i);
    if (d.getDay() === 0) continue;
    const ds = dstr(d);
    const lbl = i === 0 ? 'Today' : i === 1 ? 'Tmrw' : DAYS_SHORT[d.getDay()];
    chips.push({ ds, lbl, num: d.getDate() });
  }
  return chips;
}

/* ── Root component ────────────────────────────────────────────────────────── */
export default function SiteAuditStoreTeamView() {
  const dateChips = useMemo(buildDateChips, []);

  const [myStore, setMyStore] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(dateChips[0].ds);
  const [dayOrders, setDayOrders] = useState<any[]>([]);
  const [auditorCount, setAuditorCount] = useState(3);
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
          'audit_orders?select=id,pi,po,customer_name,phone,status,slot,date,auditor_id,bm,audit_ticked,log&date=eq.' +
            date +
            '&status=neq.deleted'
        ),
        sbGet('profiles?select=id,active_from,weekly_off,leave_dates&role=in.(site_auditor,auditor_installer)'),
      ]);
      const orderList = Array.isArray(orders) ? orders : [];
      // An auditor before their start date, on their weekly off, or on leave
      // isn't available — so they must not inflate this store's slots-left
      // count either (same rule the SM's Auditors & caps view applies).
      const activeAuditors = (Array.isArray(auditors) ? auditors : []).filter((a: any) => {
        if (a.active_from && a.active_from > date) return false;
        if (a.weekly_off != null && new Date(date + 'T00:00:00').getDay() === a.weekly_off) return false;
        if (Array.isArray(a.leave_dates) && a.leave_dates.includes(date)) return false;
        return true;
      });
      setDayOrders(orderList);
      setAuditorCount(activeAuditors.length || 1);
      setLoading(false);
    } catch (e) {
      if (!silent) {
        setLoadError(true);
        setLoading(false);
      }
    }
  }, []);

  // Boot: show the store picker until a store is chosen; once chosen, load
  // the day and start the 30s poll + visibilitychange-triggered refresh.
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

  /* ── Derived render data ───────────────────────────────────────────────── */
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
          myRes={myRes}
          allBooked={allBooked}
          nowMin={nowMin}
          isMyBooking={isMyBooking}
          cancellingId={cancellingId}
          onBook={(slotId: string) => setBookingSlot(slotId)}
          onCancel={cancelReservation}
        />
      )}

      {/* Store picker overlay (boot: forced, no store yet; header: dismissible switcher) */}
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

      {/* Booking sheet */}
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

      {/* Toast */}
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

/* ── Slot grid + reservations ────────────────────────────────────────────────── */
interface SlotContentProps {
  date: string;
  myStore: string | null;
  dayOrders: any[];
  auditorCount: number;
  myRes: any[];
  allBooked: any[];
  nowMin: number | null;
  isMyBooking: (o: any) => boolean;
  cancellingId: string | null;
  onBook: (slotId: string) => void;
  onCancel: (id: string) => void;
}

function SlotContent({
  date,
  myStore,
  dayOrders,
  auditorCount,
  myRes,
  allBooked,
  nowMin,
  isMyBooking,
  cancellingId,
  onBook,
  onCancel,
}: SlotContentProps) {
  const anyContent = myRes.length || allBooked.length;
  return (
    <div className="flex flex-col gap-6">
      {(['Morning', 'Afternoon', 'Evening'] as const).map((grp) => {
        const cutMorning = grp === 'Morning' && morningCutoffHit(date);
        const slots = cutMorning ? [] : SLOT_DEFS.filter((s) => s.group === grp && (nowMin === null || s.startMin > nowMin));
        return (
          <div key={grp}>
            <div className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3 pb-2 border-b border-gray-100">
              {grp}
            </div>
            {!slots.length ? (
              <div className="text-[13px] text-gray-400 px-1">
                {cutMorning
                  ? 'Morning slots for tomorrow close at 6:00 PM. Please pick an afternoon/evening slot, or a morning slot on a later day.'
                  : 'No upcoming slots'}
              </div>
            ) : (
              <div className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
                {slots.map((sl) => {
                  const av = getAvailability(sl.id, dayOrders, auditorCount);
                  const isFull = av.available <= 0;
                  const myBookingsForSlot = myRes.filter((r) => r.slot === sl.id);
                  const hasMyBooking = myBookingsForSlot.length > 0;
                  const dotClass = isFull ? 'bg-red-500' : av.available === 1 ? 'bg-amber-500' : 'bg-green-500';

                  let availText: string;
                  if (isFull && !hasMyBooking) {
                    availText = `Full — all ${av.total} auditor${av.total !== 1 ? 's' : ''} booked`;
                  } else {
                    availText = `${av.available} of ${av.total} auditor${av.total !== 1 ? 's' : ''} available`;
                  }

                  const otherResForSlot = dayOrders.filter(
                    (o) => o.status === 'slot_reserved' && !isMyBooking(o) && o.slot === sl.id
                  );
                  const bookable = !isFull;

                  return (
                    <div
                      key={sl.id}
                      onClick={bookable ? () => onBook(sl.id) : undefined}
                      className={`flex items-center gap-3 px-4 py-3 ${
                        bookable ? 'cursor-pointer hover:bg-gray-50' : 'opacity-70'
                      }`}
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`}></div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px]">
                          <span className="font-semibold text-black">{sl.label}</span>{' '}
                          <span className="text-gray-400">– {sl.rangeEnd}</span>
                        </div>
                        <div className="text-[12px] text-gray-500">{availText}</div>
                        {myBookingsForSlot.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {myBookingsForSlot.map((r) => (
                              <span
                                key={r.id}
                                className="text-[11px] font-medium text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5"
                              >
                                ✓ {r.customer_name || 'Booking'}
                              </span>
                            ))}
                          </div>
                        )}
                        {otherResForSlot.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {otherResForSlot.map((r) => (
                              <span key={r.id} className="text-[11px] text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">
                                {(r.log && r.log[0] && r.log[0].who) || r.bm || 'Other store'} pre-booked
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      {!isFull ? (
                        <button
                          className="bg-[#EAB308] text-white border-none px-4 py-2 rounded-md text-[13px] font-semibold cursor-pointer hover:opacity-90 shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            onBook(sl.id);
                          }}
                        >
                          Book
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-red-600 shrink-0">Full</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {myRes.length > 0 && (
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3 pb-2 border-b border-gray-100">
            Pre-bookings from {myStore} · {fmtDate(date)}
          </div>
          <div className="flex flex-col gap-3">
            {myRes.map((r) => {
              const cats = Array.isArray(r.audit_ticked) ? r.audit_ticked.filter(Boolean) : [];
              const bookingBm = r.bm && r.bm !== myStore ? r.bm : null;
              return (
                <div key={r.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="flex items-start gap-3">
                    <div className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-500 bg-gray-100 rounded-md px-2 py-1">
                      {fmtSlotId(r.slot)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm text-black">{r.customer_name || '—'}</div>
                      <div className="text-[12px] text-gray-500">
                        {r.phone || '—'}
                        {bookingBm ? ' · BM: ' + bookingBm : ''}
                      </div>
                      {r.po && <div className="text-[11.5px] text-gray-400 mt-0.5">ENQ: {r.po}</div>}
                    </div>
                  </div>
                  {cats.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2.5">
                      {cats.map((c: string, i: number) => (
                        <span key={i} className="inline-block px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-600">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                    <span className="text-[12px] text-gray-400 flex-1">Booking ID: {r.pi}</span>
                    <button
                      disabled={cancellingId === r.id}
                      onClick={() => onCancel(r.id)}
                      className="bg-white text-red-600 border border-red-200 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {cancellingId === r.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {allBooked.length > 0 && (
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3 pb-2 border-b border-gray-100">
            All confirmed bookings · {fmtDate(date)}
          </div>
          <div className="text-[12px] text-gray-500 bg-gray-50 border border-gray-100 rounded-md px-3 py-2 mb-3">
            These are already-assigned audit visits on this date. They are accounted for in the slot availability above.
          </div>
          <div className="flex flex-col gap-3">
            {allBooked.map((o) => (
              <div key={o.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-400 bg-gray-50 border border-gray-100 rounded-md px-2 py-1">
                    {fmtSlotId(o.slot)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm text-black">{o.customer_name || o.pi || '—'}</div>
                    <div className="text-[12px] text-gray-500">
                      {o.pi} · {(o.status || '').replace(/_/g, ' ')}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!anyContent && (
        <div className="text-center py-8 text-gray-400 text-[13px]">No bookings for this date yet.</div>
      )}
    </div>
  );
}

/* ── Booking sheet ───────────────────────────────────────────────────────────── */
interface BookingSheetProps {
  slot: SlotDef;
  date: string;
  myStore: string;
  onClose: () => void;
  onBooked: (name: string) => void;
}

function BookingSheet({ slot, date, myStore, onClose, onBooked }: BookingSheetProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [addr, setAddr] = useState('');
  const [enqId, setEnqId] = useState('');
  const [bmName, setBmName] = useState('');
  const [comments, setComments] = useState('');
  const [fl, setFl] = useState(false);
  const [wp, setWp] = useState(false);
  const [cwp, setCwp] = useState(false);
  const [cnc, setCnc] = useState(false);
  const [wpnl, setWpnl] = useState(false);
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const confirm = async () => {
    const nm = name.trim();
    const ph = phone.trim();
    const ad = addr.trim();
    const enq = enqId.trim();
    const bm = bmName.trim();
    const cm = comments.trim();
    setErr('');
    if (!nm) {
      setErr('Customer name is required.');
      return;
    }
    if (!ph) {
      setErr('Phone number is required.');
      return;
    }
    if (!ad) {
      setErr('Address is required.');
      return;
    }
    if (!enq) {
      setErr('Enquiry ID is required.');
      return;
    }
    if (!bm) {
      setErr('BM name is required.');
      return;
    }
    if (!fl && !wp && !cwp && !cnc && !wpnl) {
      setErr('Select at least one audit category.');
      return;
    }

    const cats: string[] = [];
    if (fl) cats.push('Wooden Flooring');
    if (wp) cats.push('Standard Wallpapers');
    if (cwp) cats.push('Custom Wallpapers');
    if (cnc) cats.push('CNC');
    if (wpnl) cats.push('Wall Panels');

    setSubmitting(true);
    try {
      const pi = genSlotPI(myStore);
      const logNote = 'Slot pre-booked at ' + myStore + ' store · BM: ' + bm + (cm ? ' · ' + cm : '');
      await sbPost('audit_orders', {
        pi,
        po: enq,
        customer_name: nm,
        phone: ph,
        addr: ad,
        bm: bm || myStore,
        date,
        slot: slot.id,
        status: 'slot_reserved',
        skus: [{ c: 'AUDIT', n: 'Site Audit', audit: true }],
        audit_ticked: cats,
        service: null,
        log: [{ t: logNote, d: new Date().toISOString(), by: 'manual', who: myStore }],
        created_by_email: 'store-team',
      });
      onBooked(nm);
    } catch (e: any) {
      setErr('Booking failed — ' + (e?.message || 'please try again'));
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 z-[900] flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto p-5">
        <div className="text-base font-bold text-black mb-0.5">Book {slot.label}</div>
        <div className="text-[13px] text-gray-500 mb-4">
          {fmtDate(date)} · {myStore}
        </div>

        <div className="mb-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Customer name *</label>
          <input
            className="w-full px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none focus:border-yellow-400"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name"
            autoComplete="off"
          />
        </div>

        <div className="mb-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Phone number *</label>
          <input
            className="w-full px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none focus:border-yellow-400"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            placeholder="9876543210"
          />
        </div>

        <div className="mb-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Address *</label>
          <textarea
            className="w-full px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none focus:border-yellow-400 resize-y"
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="Flat / building / area…"
          />
        </div>

        <div className="mb-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">ENQ ID *</label>
          <input
            className="w-full px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none focus:border-yellow-400"
            value={enqId}
            onChange={(e) => setEnqId(e.target.value)}
            placeholder="ENQ2026…"
            autoComplete="off"
          />
        </div>

        <div className="mb-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">BM Name *</label>
          <input
            className="w-full px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none focus:border-yellow-400"
            value={bmName}
            onChange={(e) => setBmName(e.target.value)}
            placeholder="Business manager name"
            autoComplete="off"
          />
        </div>

        <div className="mb-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
            Audit categories * <span className="normal-case font-medium text-gray-400">(select all that apply)</span>
          </label>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-[13px] text-gray-700">
              <input type="checkbox" checked={fl} onChange={(e) => setFl(e.target.checked)} />
              <span>Wooden Flooring</span>
            </label>
            <label className="flex items-center gap-2 text-[13px] text-gray-700">
              <input type="checkbox" checked={wp} onChange={(e) => setWp(e.target.checked)} />
              <span>Standard Wallpapers</span>
            </label>
            <label className="flex items-center gap-2 text-[13px] text-gray-700">
              <input type="checkbox" checked={cwp} onChange={(e) => setCwp(e.target.checked)} />
              <span>Custom Wallpapers</span>
            </label>
            <label className="flex items-center gap-2 text-[13px] text-gray-700">
              <input type="checkbox" checked={cnc} onChange={(e) => setCnc(e.target.checked)} />
              <span>CNC</span>
            </label>
            <label className="flex items-center gap-2 text-[13px] text-gray-700">
              <input type="checkbox" checked={wpnl} onChange={(e) => setWpnl(e.target.checked)} />
              <span>Wall Panels</span>
            </label>
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
            Comments <span className="normal-case font-medium text-gray-400">(optional)</span>
          </label>
          <textarea
            className="w-full px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none focus:border-yellow-400 resize-y min-h-[70px]"
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder="Any notes about the customer or visit…"
          />
        </div>

        {err && <div className="text-[12px] text-red-600 font-medium mb-3">{err}</div>}

        <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
          <button
            className="bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-md text-[13px] font-medium cursor-pointer hover:bg-gray-50"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            disabled={submitting}
            onClick={confirm}
            className="bg-[#EAB308] text-white border-none px-4 py-2 rounded-md text-[13px] font-semibold cursor-pointer hover:opacity-90 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? 'Booking…' : 'Confirm booking'}
          </button>
        </div>
      </div>
    </div>
  );
}
