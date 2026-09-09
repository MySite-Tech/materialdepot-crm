'use client';

import { fmtDate } from '../../install-ops/shared';

import { activeStaffFilter, sbGet, sbPost } from '../../siteAuditShared';
import { BookingSheetProps } from '../../types/store-team';
import { genSlotPI } from '../../utils/store-team';
import { useEffect, useState } from 'react';

export function BookingSheet({ slot, date, myStore, onClose, onBooked }: BookingSheetProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [addr, setAddr] = useState('');
  const [enqId, setEnqId] = useState('');
  const [bmName, setBmName] = useState('');
  const [bmList, setBmList] = useState<Array<{ name: string; email: string }>>([]);
  const [bmPick, setBmPick] = useState('');
  const [bmTyped, setBmTyped] = useState(false);
  useEffect(() => {
    let alive = true;

    activeStaffFilter().then((f) => sbGet('profiles?select=name,email&role=eq.bm&order=name.asc' + f))
      .then((r) => { if (alive && Array.isArray(r)) setBmList(r.filter((p: any) => p && p.name && p.email)); })
      /* The list failing to load must not lock the counter out of booking —
         fall through to the typed field, same as an unlisted BM. */
      .catch(() => { if (alive) setBmTyped(true); });
    return () => { alive = false; };
  }, []);
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
    const picked = bmList.find((b) => b.email === bmPick) || null;
    const bm = picked ? picked.name : bmName.trim();
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
      setErr('Select what the audit is for — at least one material.');
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

        bm: bm || '—',
        ...(picked ? { bm_email: picked.email } : {}),
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
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">BM *</label>
          {bmTyped || !bmList.length ? (
            <>
              <input
                className="w-full px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none focus:border-yellow-400"
                value={bmName}
                onChange={(e) => setBmName(e.target.value)}
                placeholder="Business manager name"
                autoComplete="off"
              />
              {bmList.length ? (
                <button
                  type="button"
                  onClick={() => { setBmTyped(false); setBmName(''); }}
                  className="mt-1 text-[11.5px] font-semibold text-gray-500 underline"
                >
                  Pick from the list instead
                </button>
              ) : null}
            </>
          ) : (
            <>
              <select
                className="w-full px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none bg-white focus:border-yellow-400"
                value={bmPick}
                onChange={(e) => {
                  if (e.target.value === '__other') { setBmTyped(true); setBmPick(''); return; }
                  setBmPick(e.target.value);
                }}
              >
                <option value="">— select the BM —</option>
                {bmList.map((b) => <option key={b.email} value={b.email}>{b.name}</option>)}
                <option value="__other">BM not in this list…</option>
              </select>
              <div className="mt-1 text-[11.5px] text-gray-400">Picking from the list puts the booking straight on that BM&apos;s dashboard.</div>
            </>
          )}
        </div>

        <div className="mb-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1">
            What is the audit for? * <span className="normal-case font-medium text-gray-400">(select every material)</span>
          </label>

          <div className="text-[11.5px] text-gray-500 mb-1.5">Shown to the service manager and the auditor — pick every material the customer wants measured.</div>
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
