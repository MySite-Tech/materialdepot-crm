'use client';

import { mapUrl } from '../utils';
import { ChangeEvent, useCallback, useRef, useState } from 'react';

import { INSTALL_STAGES, INSTALL_STATUS } from '../constants';
import { CATEGORY_LIST, categoryFor } from '../../../data/audit-registry';
import { fmtDateA } from '../../../shared/format';
import { PersistedRoom, Room } from '../types';
import { AuditRoomCard } from '../../../ui/audit-room-views';
import { slotsLabel } from '../utils';
import { Spinner } from '../ui';

import { Job } from '../types';
import { dstr } from '../utils';

export function JobDetailScreen({
  job, slots, advBusy, pdfBusy, rescheduleOpen, rescheduleReason, rescheduleFollowUp,
  onBack, onToCall, onYes, onReached, onOpenJobCard, onTriggerReschedule, onCancelReschedule,
  onReasonChange, onFollowUpChange, onSubmitReschedule, onViewAudit, onDownloadPdf,
}: {
  job: Job;
  slots: Record<string, { label: string; start: number }>;
  advBusy: boolean;
  pdfBusy: boolean;
  rescheduleOpen: boolean;
  rescheduleReason: string;
  rescheduleFollowUp: string;
  onBack: () => void;
  onToCall: () => void;
  onYes: () => void;
  onReached: () => void;
  onOpenJobCard: () => void;
  onTriggerReschedule: () => void;
  onCancelReschedule: () => void;
  onReasonChange: (v: string) => void;
  onFollowUpChange: (v: string) => void;
  onSubmitReschedule: () => void;
  onViewAudit: () => void;
  onDownloadPdf: () => void;
}) {
  const tel = job.phone.replace(/\s/g, '');
  const rescheduleBtn = (label: string) => (
    <button disabled={advBusy} onClick={onTriggerReschedule} className="mt-2 w-full rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">{label}</button>
  );

  return (
    <div>
      <button onClick={onBack} className="mb-4 text-sm font-semibold text-gray-500 hover:text-gray-700">← Back to jobs</button>

      {rescheduleOpen ? (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-base font-bold text-red-600">Reschedule installation</h2>
          <p className="mb-4 text-[13px] text-gray-500">Explain why this visit can&apos;t proceed. The office will pick a new time.</p>
          <label className="mb-1 block text-sm font-semibold">Reason <span className="text-red-600">*</span></label>
          <textarea
            value={rescheduleReason}
            onChange={(e) => onReasonChange(e.target.value)}
            placeholder="e.g. Customer not available, site not ready, access issue, material problem…"
            className="mb-4 min-h-[100px] w-full resize-y rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-yellow-400"
          />
          <label className="mb-1 block text-sm font-semibold">Follow-up date <span className="font-normal text-xs text-gray-400">(optional — when to call client)</span></label>
          <input
            type="date"
            value={rescheduleFollowUp}
            min={dstr(new Date())}
            onChange={(e) => onFollowUpChange(e.target.value)}
            className="mb-4 w-full rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-yellow-400"
          />
          <div className="flex flex-col gap-2">
            <button disabled={advBusy} onClick={onSubmitReschedule} className="w-full rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">Confirm Reschedule</button>
            <button onClick={onCancelReschedule} className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-lg border border-gray-200 bg-white p-5">
            {job.status === 'scheduled' && (
              <>
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Now</div>
                <div className="mt-1 text-lg font-bold text-black">Scheduled</div>
                <p className="mt-2 text-[13px] text-gray-500">This turns into <b>Call Pending</b> 3 hours before your time. You can call the customer now to start.</p>
                <button disabled={advBusy} onClick={onToCall} className="mt-3 w-full rounded-xl bg-[#1F3A5F] py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">Start — call customer now</button>
                {rescheduleBtn("Can't proceed — Reschedule")}
              </>
            )}
            {job.status === 'callpending' && (
              <>
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Step 1 of 3</div>
                <div className="mt-1 text-lg font-bold text-black">Call the customer</div>
                <p className="mt-2 text-[13px] text-gray-500">Call 1–2 hours before. Ask if they are ready for you to come.</p>
                <a href={'tel:' + tel} className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-green-50 py-3 text-sm font-bold text-green-700">📞 Call {job.name}</a>
                <p className="mt-3 text-[13px] text-gray-500">After the call, choose:</p>
                <button disabled={advBusy} onClick={onYes} className="mt-2 w-full rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">They said YES — I&apos;m on the way</button>
                {rescheduleBtn('They said NO or can\'t proceed — Reschedule')}
                <div className="mt-3 rounded-md bg-gray-50 px-3 py-2 text-[12px] text-gray-500">Also call your BM ({job.bm}) to confirm which room each product goes in.</div>
              </>
            )}
            {job.status === 'reschedule' && (
              <>
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Now</div>
                <div className="mt-1 text-lg font-bold text-red-600">To Reschedule</div>
                <p className="mt-2 text-[13px] text-gray-500">Sent to the office to pick a new time. Nothing to do right now.</p>
              </>
            )}
            {job.status === 'onway' && (
              <>
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Step 2 of 3</div>
                <div className="mt-1 text-lg font-bold text-black">On the way</div>
                <p className="mt-2 text-[13px] text-gray-500">Tap when you reach the site.</p>
                <button disabled={advBusy} onClick={onReached} className="mt-3 w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">I have reached the site</button>
                {rescheduleBtn("Can't proceed — Reschedule")}
              </>
            )}
            {job.status === 'atsite' && (
              <>
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Step 3 of 3</div>
                <div className="mt-1 text-lg font-bold text-black">At the site</div>
                <p className="mt-2 text-[13px] text-gray-500">Do the installation, then fill the card and take photos.</p>
                {job.auditBy === 'material_depot' && (
                  <button onClick={onViewAudit} className="mt-3 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">View site audit report</button>
                )}
                <button onClick={onOpenJobCard} className="mt-2 w-full rounded-xl bg-[#1F3A5F] py-3 text-sm font-bold text-white hover:opacity-90">{job.jobcard ? 'Continue installation card' : 'Start installation card'}</button>
                {rescheduleBtn("Can't proceed — Reschedule")}
              </>
            )}
            {job.status === 'partial' && (
              <>
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400">In progress</div>
                <div className="mt-1 text-lg font-bold text-teal-700">Partially completed</div>
                <p className="mt-2 text-[13px] text-gray-500">Some of this job is done. Resume to add the remaining rooms and finish with the customer.</p>
                <button onClick={onOpenJobCard} className="mt-3 w-full rounded-xl bg-[#1F3A5F] py-3 text-sm font-bold text-white hover:opacity-90">Resume installation card</button>

                {(job.jobcard?.rooms || []).length > 0 && (
                  <button disabled={pdfBusy} onClick={onDownloadPdf} className="mt-2 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">{pdfBusy ? 'Building PDF…' : 'Download partial job card'}</button>
                )}
                {rescheduleBtn("Can't proceed — Reschedule")}
              </>
            )}
            {job.status === 'completed' && (
              <>
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Done</div>
                <div className="mt-1 text-lg font-bold text-green-600">Completed</div>
                <p className="mt-2 text-[13px] text-gray-500">Card saved and sent to the office.</p>
                <button disabled={pdfBusy} onClick={onDownloadPdf} className="mt-3 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">{pdfBusy ? 'Building PDF…' : 'Download PDF'}</button>
              </>
            )}
            {!INSTALL_STAGES.includes(job.status) && (
              <>
                <div className="text-xs font-bold uppercase tracking-wider text-gray-400">Now</div>
                <div className="mt-1 text-lg font-bold text-gray-900">{(INSTALL_STATUS[job.status] || { label: job.status || 'Unknown' }).label}</div>
                <p className="mt-2 text-[13px] text-gray-500">Nothing for you to do on this job right now — the office moves it on from here. Call them if you were expecting to start it.</p>
              </>
            )}
          </div>

          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <a href={mapUrl(job.addr)} target="_blank" rel="noopener noreferrer" className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50">📍 Get directions</a>
            <a href={'tel:' + tel} className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50">📞 Call {job.name}</a>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-base font-bold text-black">Job details</h2>
            <div className="grid grid-cols-[110px_1fr] gap-y-2 text-[13px]">
              <div className="text-gray-400">Customer</div><div className="font-semibold">{job.name}</div>
              <div className="text-gray-400">Phone</div><div>{job.phone}</div>
              <div className="text-gray-400">Address</div><div>{job.addr}</div>
              <div className="text-gray-400">Product</div>
              <div>
                {job.sku.length === 0 ? '—' : job.sku.map((s, i) => (
                  <div key={i}>
                    {[s.code, s.skuName].filter(Boolean).join(' · ')}
                    {s.qty ? <span className="font-semibold text-gray-500"> · Qty: {s.qty}</span> : null}
                    {s.link ? <a href={s.link} target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-600">↗</a> : null}
                  </div>
                ))}
              </div>
              <div className="text-gray-400">Type</div><div>{categoryFor(job.type).pdfLabel}</div>
              <div className="text-gray-400">Your role</div>
              <div>{job.isPrimary ? <span className="rounded-md bg-yellow-50 px-2.5 py-0.5 font-bold text-amber-800">★ Primary installer</span> : <span className="text-gray-500">Additional installer</span>}</div>
              <div className="text-gray-400">Your BM</div><div>{job.bm}</div>
              <div className="text-gray-400">Date</div><div>{fmtDateA(job.date)}</div>
              <div className="text-gray-400">Time</div><div>{slotsLabel(job, slots)}</div>
            </div>
            {job.auditBy === 'material_depot' && (
              <button onClick={onViewAudit} className="mt-4 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">View site audit report</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function AuditReportOverlay({
  job, state, onClose, onDownload,
}: {
  job: Job;
  state: { loading: boolean; error: 'none' | 'network' | null; ticked: any; auditorName: string | null; date: string | null };
  onClose: () => void;
  onDownload: () => void;
}) {
  const rooms = state.ticked?.rooms || [];
  return (
    <div className="fixed inset-0 z-[850] flex items-center justify-center bg-black/30 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <div className="text-sm font-bold text-gray-900">Site Audit Report</div>
            <div className="text-[12px] text-gray-400">{job.pi} · {job.name}</div>
          </div>
          <button onClick={onClose} className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-medium hover:bg-gray-50">Close</button>
        </div>
        <div className="px-6 py-5">
          {state.loading ? (
            <div className="flex items-center justify-center py-8"><Spinner /></div>
          ) : state.error === 'network' ? (
            <div className="text-[13px] text-red-600">Couldn&apos;t load audit report — check your connection.</div>
          ) : state.error === 'none' || !state.ticked ? (
            <div className="text-[13px] text-gray-400">No completed Material Depot site audit found for this phone number.</div>
          ) : (
            <>
              <div className="mb-4 rounded-md bg-blue-50 px-3 py-2 text-[12px] text-blue-700">Material Depot site audit — read only.</div>
              <div className="mb-4 rounded-lg border border-gray-200 p-4">
                <div className="grid grid-cols-[130px_1fr] gap-y-1.5 text-[13px]">
                  <div className="text-gray-400">Auditor</div><div>{state.ticked.auditor || state.auditorName || '—'}</div>
                  <div className="text-gray-400">Audit date</div><div>{state.date ? fmtDateA(state.date) : '—'}</div>
                  <div className="text-gray-400">Rooms audited</div><div>{rooms.length}</div>
                </div>
              </div>

              {rooms.map((r: any, i: number) => (
                <AuditRoomCard key={i} room={r} index={i} />
              ))}
              <button onClick={onDownload} className="mt-2 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">Download Audit PDF</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function RoomBlock({
  room, index, onField, onCategory, onInstallField, onFiles, onOpenScanner, onRemovePhoto, onRemove, onOpenLightbox,
}: {
  room: Room;
  index: number;
  onField: (field: keyof PersistedRoom, value: string) => void;
  onCategory: (category: string) => void;
  onInstallField: (k: string, value: string) => void;
  onFiles: (files: FileList | null) => Promise<string | null>;
  onOpenScanner: () => void;
  onRemovePhoto: (idx: number) => void;
  onRemove: () => void;
  onOpenLightbox: (src: string) => void;
}) {
  const camRef = useRef<HTMLInputElement | null>(null);
  const galRef = useRef<HTMLInputElement | null>(null);
  const cat = categoryFor(room.category);

  const [readErr, setReadErr] = useState<string | null>(null);
  const pick = useCallback(async (files: FileList | null) => {
    setReadErr(null);
    setReadErr(await onFiles(files));
  }, [onFiles]);
  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-bold text-gray-900">Room {index + 1}</div>
        <button onClick={onRemove} className="text-xs font-semibold text-red-600 hover:underline">Remove</button>
      </div>

      <label className="mb-1 block text-[12px] font-semibold">Product category</label>
      <select
        value={room.category || 'flooring'}
        onChange={(e) => onCategory(e.target.value)}
        className="mb-3 w-full rounded-lg border border-gray-200 p-2.5 text-sm outline-none focus:border-yellow-400"
      >
        {CATEGORY_LIST.map((c) => (
          <option key={c.id} value={c.id}>{c.label}</option>
        ))}
      </select>

      <label className="mb-1 block text-[12px] font-semibold">Room name <span className="text-red-600">★</span></label>
      <input value={room.name} onChange={(e) => onField('name', e.target.value)} placeholder="e.g. Living Room" className="mb-3 w-full rounded-lg border border-gray-200 p-2.5 text-sm outline-none focus:border-yellow-400" />

      <label className="mb-1 block text-[12px] font-semibold">SKU Code <span className="text-red-600">★</span></label>
      <input value={room.sku} onChange={(e) => onField('sku', e.target.value)} placeholder="e.g. SKU code" className="mb-3 w-full rounded-lg border border-gray-200 p-2.5 text-sm outline-none focus:border-yellow-400" />

      {(cat.installFields || []).map((f) => (
        <div key={f.k}>
          <label className="mb-1 block text-[12px] font-semibold">{f.label}</label>
          <input
            inputMode={f.input === 'decimal' ? 'decimal' : undefined}
            value={String(room.fields?.[f.k] ?? '')}
            onChange={(e) => onInstallField(f.k, e.target.value)}
            className="mb-3 w-full rounded-lg border border-gray-200 p-2.5 text-sm outline-none focus:border-yellow-400"
          />
        </div>
      ))}

      <label className="mb-1 block text-[12px] font-semibold">Photos after installation <span className="text-red-600">★</span></label>
      <div className="mb-2 flex flex-wrap gap-2">
        {room.photos.map((ph, idx) => (
          <div key={idx} className="relative h-20 w-20 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={ph} alt="" onClick={() => onOpenLightbox(ph)} className="h-20 w-20 cursor-pointer rounded-lg border border-gray-200 object-cover" />
            <button onClick={() => onRemovePhoto(idx)} className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-red-600 text-xs font-bold leading-none text-white">×</button>
          </div>
        ))}
      </div>
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e: ChangeEvent<HTMLInputElement>) => { pick(e.target.files); e.target.value = ''; }} />
      <input ref={galRef} type="file" accept="image/*" multiple className="hidden" onChange={(e: ChangeEvent<HTMLInputElement>) => { pick(e.target.files); e.target.value = ''; }} />
      <div className="mb-3 flex gap-2">
        <button onClick={() => camRef.current?.click()} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">📷 Camera</button>
        <button onClick={() => galRef.current?.click()} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">🖼 Gallery</button>
        <button onClick={onOpenScanner} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">📄 Scan</button>
      </div>
      {readErr && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11.5px] font-semibold text-amber-800">
          <span className="flex-1">{readErr}</span>
          <button type="button" onClick={() => setReadErr(null)} className="shrink-0 font-bold">×</button>
        </div>
      )}

      <label className="mb-1 block text-[12px] font-semibold">Comments (if any)</label>
      <textarea value={room.comments} onChange={(e) => onField('comments', e.target.value)} placeholder="Anything to note..." className="min-h-[70px] w-full resize-y rounded-lg border border-gray-200 p-2.5 text-sm outline-none focus:border-yellow-400" />
    </div>
  );
}
