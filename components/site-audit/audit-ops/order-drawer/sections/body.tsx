'use client';

import type { BmOption } from '../types';

import ShadowerSelect from '../../../install-ops/ui/shadower-select';
import { ShadowerOption } from '../../../install-ops/ui/shadower-select';
import { Shadower, parseShadowers } from '../../../shared/staff/availability';
import { initials } from '../../../shared/format';
import { AuditRoomCard } from '../../../ui/audit-room-views';
import RoomSkuEditor from '../../../ui/room-sku-editor';
import { auditRoomSkuSaver } from '../../../ui/room-sku-editor';
import { AUTO_STATUSES, AuditOrder, AuditSkuRow, Auditor, FLOW, FLOW_LABELS, STATUS, SlotDef, fmtDate, mapUrl, offReason, slotLabel } from '../../shared';
import { Chip, DateTime, KV, Note, Section } from '../ui/fields';
import { EmptyAuditorPool } from './pool';
import { SkuGroup } from './skus';
import { Dispatch, SetStateAction } from 'react';

export function AuditDrawerBody({ addRow, attribution, auditCats, auditorName, auditorRows, auditors, auditorsErr, bmOpen, bmOptions, bmPick, bookDate, bookTime, busy, catsFromStore, clearFollowUp, custAddr, custName, custOpen, custPhone, delRow, downloadPdf, draft, editSlot, flowIdx, followUp, grpOn, o, onRetryAuditors, pdfBusy, pickAuditor, pickedAuditor, reload, reschedRemark, rooms, saveBm, saveCustomer, saveService, saveShadowers, saveSlotChange, setBmOpen, setBmPick, setBookDate, setBookTime, setCustAddr, setCustName, setCustOpen, setCustPhone, setEditSlot, setFollowUp, setFollowUpDate, setReschedRemark, setRow, setShadowers, setStatus, setTicked, shadowerPool, shadowers, slots, stepBack, ticked, toast, todayStr, toggleGrp }: {
  addRow: (grp: "flooring" | "wallpaper") => void;
  attribution: string;
  auditCats: string[];
  auditorName: string | null;
  auditorRows: { a: Auditor; cap: number; load: number; cx: AuditOrder | null; full: boolean; overCap: boolean; conflict: boolean; }[];
  auditors: Auditor[];
  auditorsErr: boolean;
  bmOpen: boolean;
  bmOptions: BmOption[];
  bmPick: string;
  bookDate: string;
  bookTime: string;
  busy: boolean;
  catsFromStore: boolean;
  clearFollowUp: () => Promise<void>;
  custAddr: string;
  custName: string;
  custOpen: boolean;
  custPhone: string;
  delRow: (grp: "flooring" | "wallpaper", i: number) => void;
  downloadPdf: () => Promise<void>;
  draft: { flooring: AuditSkuRow[]; wallpaper: AuditSkuRow[]; };
  editSlot: boolean;
  flowIdx: number;
  followUp: string;
  grpOn: { flooring: boolean; wallpaper: boolean; };
  o: AuditOrder;
  onRetryAuditors: (() => void) | undefined;
  pdfBusy: boolean;
  pickAuditor: (row: { a: Auditor; cap: number; load: number; cx: AuditOrder | null; full: boolean; overCap: boolean; conflict: boolean; }) => void;
  pickedAuditor: string | null;
  reload: () => Promise<void>;
  reschedRemark: string;
  rooms: any;
  saveBm: () => Promise<void>;
  saveCustomer: () => Promise<void>;
  saveService: () => Promise<void>;
  saveShadowers: () => Promise<void>;
  saveSlotChange: () => Promise<void>;
  setBmOpen: Dispatch<SetStateAction<boolean>>;
  setBmPick: Dispatch<SetStateAction<string>>;
  setBookDate: Dispatch<SetStateAction<string>>;
  setBookTime: Dispatch<SetStateAction<string>>;
  setCustAddr: Dispatch<SetStateAction<string>>;
  setCustName: Dispatch<SetStateAction<string>>;
  setCustOpen: Dispatch<SetStateAction<boolean>>;
  setCustPhone: Dispatch<SetStateAction<string>>;
  setEditSlot: Dispatch<SetStateAction<boolean>>;
  setFollowUp: Dispatch<SetStateAction<string>>;
  setFollowUpDate: () => Promise<void>;
  setReschedRemark: Dispatch<SetStateAction<string>>;
  setRow: (grp: "flooring" | "wallpaper", i: number, f: keyof AuditSkuRow, v: string) => void;
  setShadowers: Dispatch<SetStateAction<Shadower[]>>;
  setStatus: (st: string) => Promise<void>;
  setTicked: Dispatch<any>;
  shadowerPool: ShadowerOption[];
  shadowers: Shadower[];
  slots: SlotDef[];
  stepBack: (target: string) => Promise<void>;
  ticked: any;
  toast: (m: string) => void;
  todayStr: string;
  toggleGrp: (grp: "flooring" | "wallpaper") => void;
}) {
  return (
    <>
    
      <div className="mb-4">
        <div className="flex gap-1">
          {FLOW.map((s, i) => (
            <button
              key={s}
              onClick={() => stepBack(s)}
              disabled={i >= flowIdx || busy}
              className={`flex-1 rounded-md px-1 py-1.5 text-center ${i < flowIdx ? 'bg-green-50 text-green-700' : i === flowIdx ? 'bg-[#1F3A5F] text-white' : 'bg-gray-50 text-gray-400'}`}
            >
              <div className="text-[13px] font-extrabold">{i < flowIdx ? '✓' : i + 1}</div>
              <div className="text-[9.5px] font-semibold leading-tight">{FLOW_LABELS[i]}</div>
            </button>
          ))}
        </div>
        <div className="mt-1 text-[11px] text-gray-400">Tap any earlier step to move the order back if you misclicked.</div>
      </div>
    
      <Section title="Order">
        <KV k="PI ID" v={o.pi} />
        <KV k="PO numbers" v={o.po.join(', ') || '—'} />
        <KV k="SKUs in cart" v={<div className="flex flex-wrap gap-1">{o.skus.map((s, i) => <span key={i} className={`rounded-md px-2 py-0.5 text-[10.5px] font-bold ${s.audit ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-[#1F3A5F]'}`}>{s.c}{s.n && s.n !== s.c ? ' · ' + s.n : ''}</span>)}</div>} />
    
        <KV k="Audit is for" v={
          auditCats.length
            ? <span className="flex flex-wrap items-center gap-1.5">
                <span className="flex flex-wrap gap-1">{auditCats.map((c) => <span key={c} className="rounded bg-yellow-50 px-1.5 py-0.5 text-[10.5px] font-bold text-yellow-800">{c}</span>)}</span>
                {catsFromStore ? <span className="text-[11px] font-semibold text-gray-500">from the store pre-booking</span> : null}
              </span>
            : <span className="text-[11px] font-bold text-amber-700">⚠ material not recorded on this order or its store booking</span>
        } />
        <KV k="BM" v={
          <span className="flex flex-wrap items-center gap-1.5">
            {o.bm}
            {!o.bmEmail && bmOptions.length ? <span className="text-[11px] font-bold text-amber-700">⚠ not linked to a BM account</span> : null}
            {bmOptions.length ? <button className="rounded-md border border-gray-200 px-2 py-0.5 text-[11px] font-semibold" onClick={() => setBmOpen((v) => !v)}>Change</button> : null}
          </span>
        } />
        {bmOpen ? (
          <div className="mt-2">
            <select value={bmPick} onChange={(e) => setBmPick(e.target.value)} className="mb-1.5 w-full rounded-md border border-gray-200 px-2 py-2 text-[13px]">
              <option value="">— Select a BM —</option>
              {bmOptions.map((b) => <option key={b.email || b.name} value={b.email || b.name}>{b.name}</option>)}
            </select>
            <button disabled={busy} onClick={saveBm} className="rounded-md bg-[#1F3A5F] px-3 py-1.5 text-[12px] font-semibold text-white">Save</button>
          </div>
        ) : null}
      </Section>
    
      <Section title="Customer">
        <KV k="Name" v={
          <span className="flex flex-wrap items-center gap-1.5">
            {o.name || '—'}
            <button className="rounded-md border border-gray-200 px-2 py-0.5 text-[11px] font-semibold" onClick={() => setCustOpen((v) => !v)}>
              {custOpen ? 'Cancel' : 'Fix details'}
            </button>
          </span>
        } />
        <KV k="Phone" v={<a className="text-blue-600" href={'tel:' + o.phone.replace(/\s/g, '')}>{o.phone || '—'}</a>} />
        <KV k="Address" v={o.addr ? <a className="text-blue-600" href={mapUrl(o.addr)} target="_blank" rel="noopener noreferrer">{o.addr}</a> : '—'} />
        {custOpen ? (
          <div className="mt-2 flex flex-col gap-1.5">
            <Note tone="blue">Correct any field the OMS auto-fetch got wrong (e.g. name coming through as &quot;client&quot;) — this is logged to the activity timeline.</Note>
            <input value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Customer name" className="w-full rounded-md border border-gray-200 px-2 py-2 text-[13px]" />
            <input value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="Phone" className="w-full rounded-md border border-gray-200 px-2 py-2 text-[13px]" />
            <textarea value={custAddr} onChange={(e) => setCustAddr(e.target.value)} placeholder="Address" className="w-full rounded-md border border-gray-200 px-2 py-2 text-[13px] resize-y" />
            <button disabled={busy} onClick={saveCustomer} className="self-start rounded-md bg-[#1F3A5F] px-3 py-1.5 text-[12px] font-semibold text-white">Save</button>
          </div>
        ) : null}
      </Section>
    
      {o.service && o.status !== 'pending' ? (
        <Section title="Service details" subtitle="— edit if needed">
          <Note tone="blue">Update SKU codes, names or links. Click Save to commit.</Note>
          <SkuGroup grp="flooring" label="Wooden Flooring" draft={draft} grpOn={grpOn} onToggle={toggleGrp} onField={setRow} onAdd={addRow} onDel={delRow} />
          <SkuGroup grp="wallpaper" label="Wallpaper" draft={draft} grpOn={grpOn} onToggle={toggleGrp} onField={setRow} onAdd={addRow} onDel={delRow} />
          <button disabled={busy} onClick={saveService} className="mt-2 rounded-md bg-[#1F3A5F] px-3 py-1.5 text-xs font-semibold text-white">Save changes</button>
        </Section>
      ) : null}
    
      <Section title="Set status" subtitle="— manual override">
        <Note tone="blue">Some statuses update automatically from the auditor (<b>On the way</b>, <b>At site</b>, <b>Completed</b>). You can also set any status manually here — e.g. <b>Call not picked</b>.</Note>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.keys(STATUS).filter((k) => k !== 'slot_reserved' && k !== 'slot_converted').map((k) => (
            <button
              key={k} disabled={busy} onClick={() => setStatus(k)}
              className={`rounded-md border px-2.5 py-1.5 text-[12px] font-semibold ${o.status === k ? 'border-[#1F3A5F] bg-[#1F3A5F] text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-400'}`}
            >
              {STATUS[k].l}
              {AUTO_STATUSES.includes(k) ? <span className="ml-1 rounded bg-blue-100 px-1 py-0.5 text-[9px] font-extrabold text-blue-700">AUTO</span> : null}
            </button>
          ))}
        </div>
      </Section>
    
      {o.status === 'pending' ? (
        <Section title="Service creation">
          <Note tone="blue">Customer, phone, address and BM are pulled from the order automatically. Add the SKU code, name and an optional link for each category being audited.</Note>
          <SkuGroup grp="flooring" label="Wooden Flooring" draft={draft} grpOn={grpOn} onToggle={toggleGrp} onField={setRow} onAdd={addRow} onDel={delRow} />
          <SkuGroup grp="wallpaper" label="Wallpaper" draft={draft} grpOn={grpOn} onToggle={toggleGrp} onField={setRow} onAdd={addRow} onDel={delRow} />
          {!draft.flooring.length && !draft.wallpaper.length ? <Note tone="amber">No SKU fixed yet — the service will be created as NA.</Note> : null}
        </Section>
      ) : null}
    
      {['created', 'call_na'].includes(o.status) ? (
        <>
          <Section title="Follow-up date" subtitle="— optional">
            <Note tone="blue">Can&apos;t get a confirmed date from the client yet? Set a follow-up reminder instead of leaving this blank.</Note>
            {o.service?.follow_up_date ? (
              <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-3 py-2">
                <div className="text-[12px] font-bold text-gray-700">📅 {o.service.follow_up_date === todayStr ? 'Follow-up is today — book the slot now!' : o.service.follow_up_date < todayStr ? 'Follow-up overdue' : 'Follow-up reminder set'}</div>
                <div className="text-[13.5px] font-bold text-gray-900">{fmtDate(o.service.follow_up_date)}</div>
              </div>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input type="date" value={followUp} min={todayStr} onChange={(e) => setFollowUp(e.target.value)} className="min-w-[160px] flex-1 rounded-md border border-gray-200 px-2.5 py-2 text-[13.5px]" />
              <button disabled={busy} onClick={setFollowUpDate} className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white">{o.service?.follow_up_date ? 'Update' : 'Set follow-up'}</button>
              {o.service?.follow_up_date ? <button disabled={busy} onClick={clearFollowUp} className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700">Clear</button> : null}
            </div>
          </Section>
          <Section title="Acknowledgement call & time">
            <Note tone="blue">Call the customer to confirm a date and exact visit time. Assigning SMSes the auditor&apos;s details to the customer.</Note>
            {o.status === 'call_na' ? <Note tone="red">Marked &quot;Call not picked&quot;. Retry, then book when reached.</Note> : null}
            <DateTime date={bookDate} time={bookTime} min={todayStr} onDate={setBookDate} onTime={setBookTime} />
          </Section>
        </>
      ) : null}
    
      {o.status === 'scheduled' ? (
        <Section title="Assign auditor">
          <KV k="Booked for" v={`${fmtDate(o.date)} · ${slotLabel(o.slot, slots)}`} />
          <button className="mt-1 rounded-md border border-gray-200 px-2.5 py-1 text-[11.5px] font-semibold" onClick={() => setEditSlot((v) => !v)}>{editSlot ? 'Cancel' : 'Edit date / time'}</button>
          {editSlot ? (
            <div className="mt-2">
              <DateTime date={bookDate} time={bookTime} min={todayStr} onDate={setBookDate} onTime={setBookTime} />
              <button disabled={busy} onClick={saveSlotChange} className="rounded-md bg-[#1F3A5F] px-3 py-1.5 text-xs font-semibold text-white">Save time change</button>
            </div>
          ) : null}
          <Note tone="amber">Auditors with a time conflict (a booking within 2 hours) are flagged — you can still assign them if the two sites are close by, with a confirmation. Cap-full auditors cannot be selected.</Note>
          <div className="mt-2">
            {auditorRows.length ? auditorRows.map((row) => (
              <button
                key={row.a.id}
                disabled={row.full}
                onClick={() => pickAuditor(row)}
                className={`mb-1.5 flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left ${
                  pickedAuditor === row.a.id ? 'border-[#1F3A5F] bg-blue-50' : row.full ? 'border-gray-100 bg-gray-50 opacity-60' : row.conflict ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'
                }`}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#1F3A5F] text-[11px] font-bold text-white">{initials(row.a.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold text-gray-900">{row.a.name}</span>
                  <span className="block text-[11px] text-gray-500">
                    {offReason(row.a, o.date) || (row.cx ? 'conflict: ' + slotLabel(row.cx.slot, slots) : row.a.zone || 'available')}
                  </span>
                </span>
                <span className={`shrink-0 text-[11.5px] font-bold ${row.full ? 'text-red-600' : row.conflict || row.overCap ? 'text-amber-700' : 'text-green-700'}`}>
                  {row.conflict ? '⚠ 2h conflict' : row.overCap ? `${row.load}/${row.cap} · over cap` : `${row.load}/${row.cap}${row.full ? ' · full' : ''}`}
                </span>
              </button>
            )) : <EmptyAuditorPool err={auditorsErr} anyLoaded={!!auditors.length} onRetry={onRetryAuditors} />}
          </div>
          <ShadowerSelect options={shadowerPool} value={shadowers} onChange={setShadowers} label="Shadowed by (optional) — anyone observing this audit" />
        </Section>
      ) : null}
    
      {['assigned', 'onway', 'atsite'].includes(o.status) ? (
        <Section title="Assignment">
          <KV k="Auditor" v={auditorName || '—'} />
          <KV k="Time" v={`${fmtDate(o.date)} · ${slotLabel(o.slot, slots)}`} />
          <KV k="Live status" v={<Chip st={o.status} />} />
          {o.shadowerName ? <KV k="Shadowed by" v={parseShadowers(o.shadowerEmail, o.shadowerName).map((s) => s.name).join(', ')} /> : null}
          <Note tone="blue">The auditor&apos;s live steps appear here automatically.</Note>
          <ShadowerSelect options={shadowerPool} value={shadowers} onChange={setShadowers} label="Shadowed by (optional) — anyone observing this audit" />
          <button disabled={busy} onClick={saveShadowers} className="mt-2 rounded-md bg-[#1F3A5F] px-3 py-1.5 text-xs font-semibold text-white">Save shadowers</button>
          <div className="mt-3">
            <button className="rounded-md border border-gray-200 px-2.5 py-1.5 text-[12px] font-semibold" onClick={() => setEditSlot((v) => !v)}>{editSlot ? 'Cancel' : 'Edit date / time'}</button>
            {editSlot ? (
              <div className="mt-2">
                <DateTime date={bookDate} time={bookTime} min={todayStr} onDate={setBookDate} onTime={setBookTime} />
                <button disabled={busy} onClick={saveSlotChange} className="rounded-md bg-[#1F3A5F] px-3 py-1.5 text-xs font-semibold text-white">Save change</button>
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}
    
      {o.status === 'reschedule' ? (
        <Section title="Reschedule">
          <Note tone="red">Customer declined the auditor&apos;s pre-visit call. If a new date is confirmed, rebook the slot. If not, save a follow-up date and call back later.</Note>
          <DateTime date={bookDate} time={bookTime} min={todayStr} onDate={setBookDate} onTime={setBookTime} />
          <div className="mb-2">
            <label className="mb-1 block text-[11px] font-semibold text-gray-500">Follow-up date <span className="font-normal text-gray-400">(when to call the client for a new date)</span></label>
            <input type="date" value={followUp} min={todayStr} onChange={(e) => setFollowUp(e.target.value)} className="rounded-md border border-gray-200 px-2.5 py-2 text-[13.5px]" />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-gray-500">Remarks</label>
            <textarea value={reschedRemark} onChange={(e) => setReschedRemark(e.target.value)} placeholder="Reason for reschedule, customer notes…" className="min-h-[70px] w-full rounded-md border border-gray-200 px-2.5 py-2 text-[13px]" />
          </div>
        </Section>
      ) : null}
    
      {o.status === 'completed' ? (
        <Section title="Completed">
          <KV k="Auditor" v={auditorName || (ticked && ticked.auditor) || '—'} />
          <KV k="Completed" v={`${fmtDate(o.date)} · ${slotLabel(o.slot, slots)}`} />
          {rooms.length ? <KV k="Rooms" v={String(rooms.length)} /> : null}
          {rooms.length && ticked.sign ? <KV k="Signed by" v={ticked.sign.name || '—'} /> : null}
          {rooms.length
            ? <Note tone="green">Signed job card on record.</Note>
            : <Note tone="amber">Job card data loads from the server on download.</Note>}
          <button disabled={pdfBusy} onClick={downloadPdf} className="mt-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-60">{pdfBusy ? 'Building PDF…' : '📥 Download Job Card PDF'}</button>
          {rooms.length ? (
            <div className="mt-3">
              <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-gray-400">Rooms audited</div>
              <Note tone="blue">The SKU printed on the job card comes from what the auditor entered on site. Missing or wrong? Fix it here — the card and the PDF update together.</Note>
              {rooms.map((r: any, i: number) => (
                <div key={i}>
                  <AuditRoomCard room={r} index={i} />
                  <RoomSkuEditor room={r} save={auditRoomSkuSaver(String(o.id), i, attribution)} toast={toast} onSaved={(t) => { setTicked(t); reload(); }} />
                </div>
              ))}
            </div>
          ) : null}
        </Section>
      ) : null}
    
      {o.service?.rectification_raised ? (
        <Note tone="amber">↩ Rectification raised — new order <b>{o.service.rectification_pi || ''}</b> ({o.service.rectification_type === 'install' ? 'Re-installation' : 'Re-audit'}). See the Rectifications tab.</Note>
      ) : null}
    </>
  );
}
