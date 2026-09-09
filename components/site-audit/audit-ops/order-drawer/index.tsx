'use client';

import { useAuditDrawerActions } from './hooks/use-audit-drawer-actions';

import { AuditDrawerActions } from './ui/actions';
import { AuditDrawerHeader } from './sections/header';

import { AuditDrawerBody } from './sections/body';
import { useNoteModal } from '../../hooks/use-note-modal';

import { JourneyEntry } from '../../data/audit-registry';
import { Shadower, fmtLog, parseShadowers, sbGet } from '../../shared';
import { AuditSkuRow, auditorNameOf, categoriesAreFromStore, dstr, flowIndexOf, fmtDate, mapUrl, orderCategories, slotLabel, today } from '../shared';
import { KV, Note, Section } from './ui/fields';
import { JourneyBlock } from './sections/journey';
import { Props } from './types';
import { useCallback, useEffect, useState } from 'react';

export default function AuditOrderDrawer({
  order: o, orders, auditors, slots, shadowerPool, bmOptions, attribution,
  auditorsErr = false, onRetryAuditors,
  onClose, reload, reloadWithDeleted, onOpenOrder, onRaiseRect, toast,
}: Props) {
  const todayStr = dstr(today);
  const [busy, setBusy] = useState(false);
  const [ticked, setTicked] = useState<any>(null);

  const [draft, setDraft] = useState<{ flooring: AuditSkuRow[]; wallpaper: AuditSkuRow[] }>(() => {
    if (o.service) {
      return {
        flooring: (o.service.flooring || []).map((x) => ({ ...x })),
        wallpaper: (o.service.wallpaper || []).map((x) => ({ ...x })),
      };
    }
    const at: string[] = Array.isArray(o.auditTicked) ? o.auditTicked : [];
    const wantFl = at.some((x) => /floor/i.test(x)), wantWp = at.some((x) => /wall/i.test(x));
    const fl: AuditSkuRow[] = [], wp: AuditSkuRow[] = [];
    (o.skus || []).filter((s) => !s.audit).forEach((s) => {
      const row = { sku: s.c, name: '', link: '' };
      if (/^WP/i.test(s.c) && wantWp) wp.push(row);
      else if (wantFl) fl.push(row);
      else if (wantWp) wp.push(row);
    });
    return { flooring: fl, wallpaper: wp };
  });
  const [grpOn, setGrpOn] = useState({ flooring: draft.flooring.length > 0, wallpaper: draft.wallpaper.length > 0 });

  const [bookDate, setBookDate] = useState(o.date && o.date >= todayStr ? o.date : todayStr);
  const [bookTime, setBookTime] = useState(o.slot && /^\d{1,2}:\d{2}$/.test(o.slot) ? o.slot : '09:00');
  const [reschedRemark, setReschedRemark] = useState('');
  const [followUp, setFollowUp] = useState((o.service && o.service.follow_up_date) || '');
  const [pickedAuditor, setPickedAuditor] = useState<string | null>(null);
  const [conflictOverride, setConflictOverride] = useState(false);
  const [shadowers, setShadowers] = useState<Shadower[]>(() => parseShadowers(o.shadowerEmail, o.shadowerName));
  const [editSlot, setEditSlot] = useState(false);
  const [bmOpen, setBmOpen] = useState(false);
  const [bmPick, setBmPick] = useState('');
  const [custOpen, setCustOpen] = useState(false);
  const [custName, setCustName] = useState(o.name || '');
  const [custPhone, setCustPhone] = useState(o.phone || '');
  const [custAddr, setCustAddr] = useState(o.addr || '');
  const [journey, setJourney] = useState<JourneyEntry[] | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const { ask: askNote, modal: noteModal } = useNoteModal();

  const loadJourney = useCallback(async () => {
    const rows = await sbGet('audit_orders?id=eq.' + o.id + '&select=bm_journey');
    setJourney(Array.isArray(rows) && rows[0] && Array.isArray(rows[0].bm_journey) ? rows[0].bm_journey : []);
  }, [o.id]);

  useEffect(() => { loadJourney(); }, [loadJourney]);

  useEffect(() => {
    if (o.status !== 'completed') return;
    let alive = true;
    sbGet('audit_orders?id=eq.' + o.id + '&select=audit_ticked').then((rows) => {
      if (alive && Array.isArray(rows) && rows[0]) setTicked(rows[0].audit_ticked);
    });
    return () => { alive = false; };
  }, [o.id, o.status]);

  const flowIdx = flowIndexOf(o.status);
  const { addJourney, addRow, assignAuditor, auditorRows, bookSlot, cancelReservation, clearFollowUp, createService, delOrder, delRow, downloadPdf, markPreBookingFulfilled, pickAuditor, saveBm, saveCustomer, saveReschedFollowUp, saveService, saveShadowers, saveSlotChange, setFollowUpDate, setRow, setStatus, stepBack, toggleGrp } = useAuditDrawerActions({ askNote, attribution, auditors, bmOptions, bmPick, bookDate, bookTime, conflictOverride, custAddr, custName, custPhone, draft, flowIdx, followUp, grpOn, loadJourney, o, onClose, onOpenOrder, orders, pickedAuditor, reload, reloadWithDeleted, reschedRemark, setBusy, setConflictOverride, setCustOpen, setDraft, setGrpOn, setPdfBusy, setPickedAuditor, shadowers, slots, ticked, toast });


  const rooms = ticked && !Array.isArray(ticked) && Array.isArray(ticked.rooms) ? ticked.rooms : [];
  const isPreBooking = o.status === 'slot_reserved' || o.status === 'slot_converted';
  const auditorName = auditorNameOf(o, auditors);

  const preBookingEnq = o.po;
  const linkedOrder = (enq: string) => orders.some((x) => x.pi === enq);
  const preCats = Array.isArray(o.auditTicked) ? o.auditTicked.filter(Boolean) : [];
  const auditCats = orderCategories(o);
  const catsFromStore = categoriesAreFromStore(o);

  return (
    <>
      {noteModal}
      <AuditDrawerHeader
        isPreBooking={isPreBooking}
        o={o}
        onClose={onClose}
      />

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {isPreBooking ? (
          <Section title="Pre-booking details">
            <Note tone="blue">📅 Slot pre-booked from <b>{(o.log && o.log[0] && o.log[0].who) || o.bm}</b> store. When the Kylas enquiry arrives, create the service order and schedule it for this date and time.</Note>
            <KV k="Date" v={fmtDate(o.date)} />
            <KV k="Time" v={slotLabel(o.slot, slots)} />
            <KV k="Customer" v={o.name || '—'} />
            <KV k="Phone" v={o.phone || '—'} />
            <KV k="Address" v={o.addr ? <a className="text-blue-600" href={mapUrl(o.addr)} target="_blank" rel="noopener noreferrer">{o.addr}</a> : '—'} />

            <KV k="Enquiry ID" v={
              preBookingEnq.length ? (
                <span className="flex flex-wrap items-center gap-1.5">
                  {preBookingEnq.map((enq) => (
                    linkedOrder(enq)
                      ? <button key={enq} onClick={() => onOpenOrder(enq)} className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-[12px] font-bold text-blue-700">{enq} ↗</button>
                      : <span key={enq} className="font-mono text-[12.5px] font-bold text-gray-900">{enq}</span>
                  ))}
                  {preBookingEnq.every((enq) => !linkedOrder(enq))
                    ? <span className="text-[11px] font-bold text-amber-700">⚠ no service order under this enquiry yet</span>
                    : null}
                </span>
              ) : <span className="text-[11px] font-bold text-amber-700">⚠ none recorded — ask the store to re-book with the enquiry ID</span>
            } />
            <KV k="Audit is for" v={
              preCats.length
                ? <div className="flex flex-wrap gap-1">{preCats.map((c) => <span key={c} className="rounded bg-yellow-50 px-1.5 py-0.5 text-[10.5px] font-bold text-yellow-800">{c}</span>)}</div>
                : <span className="text-[11px] font-bold text-amber-700">⚠ material not recorded — ask the store which category this audit is for</span>
            } />
            <KV k="Auditor reserved" v={auditorName || '—'} />
          </Section>
        ) : (
          <AuditDrawerBody
        addRow={addRow}
        attribution={attribution}
        auditCats={auditCats}
        auditorName={auditorName}
        auditorRows={auditorRows}
        auditors={auditors}
        auditorsErr={auditorsErr}
        bmOpen={bmOpen}
        bmOptions={bmOptions}
        bmPick={bmPick}
        bookDate={bookDate}
        bookTime={bookTime}
        busy={busy}
        catsFromStore={catsFromStore}
        clearFollowUp={clearFollowUp}
        custAddr={custAddr}
        custName={custName}
        custOpen={custOpen}
        custPhone={custPhone}
        delRow={delRow}
        downloadPdf={downloadPdf}
        draft={draft}
        editSlot={editSlot}
        flowIdx={flowIdx}
        followUp={followUp}
        grpOn={grpOn}
        o={o}
        onRetryAuditors={onRetryAuditors}
        pdfBusy={pdfBusy}
        pickAuditor={pickAuditor}
        pickedAuditor={pickedAuditor}
        reload={reload}
        reschedRemark={reschedRemark}
        rooms={rooms}
        saveBm={saveBm}
        saveCustomer={saveCustomer}
        saveService={saveService}
        saveShadowers={saveShadowers}
        saveSlotChange={saveSlotChange}
        setBmOpen={setBmOpen}
        setBmPick={setBmPick}
        setBookDate={setBookDate}
        setBookTime={setBookTime}
        setCustAddr={setCustAddr}
        setCustName={setCustName}
        setCustOpen={setCustOpen}
        setCustPhone={setCustPhone}
        setEditSlot={setEditSlot}
        setFollowUp={setFollowUp}
        setFollowUpDate={setFollowUpDate}
        setReschedRemark={setReschedRemark}
        setRow={setRow}
        setShadowers={setShadowers}
        setStatus={setStatus}
        setTicked={setTicked}
        shadowerPool={shadowerPool}
        shadowers={shadowers}
        slots={slots}
        stepBack={stepBack}
        ticked={ticked}
        toast={toast}
        todayStr={todayStr}
        toggleGrp={toggleGrp}
      />
        )}

        <Section title="Activity">
          <div className="ml-1.5 flex flex-col gap-3 border-l-2 border-gray-200 pl-4">
            {o.log.slice().reverse().map((l, i) => (
              <div key={i} className="relative">
                <div className={`absolute -left-[21px] top-1 h-2 w-2 rounded-full ${l.by === 'auto' ? 'bg-blue-600' : l.by === 'manual' ? 'bg-amber-500' : 'bg-blue-400'}`} />
                <div className="text-[13px] font-bold text-gray-900">{l.who ? <span className="font-extrabold text-[#1F3A5F]">{l.who}</span> : null}{l.who ? ' · ' : ''}{l.t}</div>
                <div className="text-[11.5px] text-gray-400">{fmtLog(l.d)}{l.by === 'auto' ? ' · auditor' : l.by === 'manual' ? ' · SM' : ''}</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Customer Journey">
          <JourneyBlock entries={journey} onAdd={addJourney} />
        </Section>
      </div>

      <AuditDrawerActions
        assignAuditor={assignAuditor}
        bookDate={bookDate}
        bookSlot={bookSlot}
        bookTime={bookTime}
        busy={busy}
        cancelReservation={cancelReservation}
        createService={createService}
        delOrder={delOrder}
        markPreBookingFulfilled={markPreBookingFulfilled}
        o={o}
        onClose={onClose}
        onRaiseRect={onRaiseRect}
        pickedAuditor={pickedAuditor}
        saveReschedFollowUp={saveReschedFollowUp}
        setStatus={setStatus}
      />
    </>
  );
}
