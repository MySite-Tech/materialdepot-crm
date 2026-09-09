'use client';

import { ArrivalCameraModal, LocationTracker } from '@/components/site-audit/apps/field-app-shared';
import { fmtDateA, sbGet, sbPatch } from '@/components/site-audit/shared';
import { useCallback, useRef, useState } from 'react';

import { AUDITOR_STAGES, DEFAULT_LOG_TEXT, STATUS_LABELS } from '../constants';
import { RescheduleForm } from './job-list';
import { genPDF } from '../utils/pdf';
import { ActingAs, LogEntry, LogExtra, Order } from '../../types/auditor';
import { CommentDialog, FieldRO, KV } from '../ui';
import { mapUrl, normalizeAuditStatus, pdfFileName, slotLabel } from '../utils';

function StageBar({
  order,
  busy,
  onToCall,
  onCustYes,
  onReschedule,
  onAtSite,
  onOpenJC,
  onDownloadPdf,
  downloading,
  pdfLink,
  fn,
}: {
  order: Order;
  busy: boolean;
  onToCall: () => void;
  onCustYes: () => void;
  onReschedule: () => void;
  onAtSite: () => void;
  onOpenJC: () => void;
  onDownloadPdf: () => void;
  downloading: boolean;
  pdfLink: string | null;
  fn: string;
}) {
  const RescheduleBtn = (
    <button
      type="button"
      onClick={onReschedule}
      disabled={busy}
      className="mt-2.5 w-full rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
    >
      Can&apos;t proceed — Reschedule
    </button>
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-gray-400">Current stage</div>
      {order.status === 'scheduled' && (
        <>
          <div className="mb-2 text-lg font-bold text-gray-900">Scheduled</div>
          <div className="mb-3 text-[13.5px] text-gray-500">
            This flips to <b>Call Pending</b> automatically 3 hours before your slot. You can also start the pre-visit
            call now.
          </div>
          <button
            type="button"
            onClick={onToCall}
            disabled={busy}
            className="w-full rounded-xl bg-[#1F3A5F] py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            Start pre-visit call
          </button>
          {RescheduleBtn}
        </>
      )}
      {order.status === 'callpending' && (
        <>
          <div className="mb-2 text-lg font-bold text-gray-900">Call Pending</div>
          <div className="mb-2 text-[13.5px] text-gray-500">
            Call the customer 1–2 hours before. Confirm they&apos;re available, then choose an outcome.
          </div>
          <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-[12.5px] text-gray-600">
            Also call the BM ({order.bm}) to confirm which room each selected SKU is for, and cross-verify with the
            client.
          </div>
          <button
            type="button"
            onClick={onCustYes}
            disabled={busy}
            className="mb-2 w-full rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            Customer confirmed → On the way
          </button>
          <button
            type="button"
            onClick={onReschedule}
            disabled={busy}
            className="w-full rounded-xl border border-red-200 bg-red-50 py-3 text-sm font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            Customer declined → Reschedule
          </button>
        </>
      )}
      {order.status === 'reschedule' && (
        <>
          <div className="mb-2 text-lg font-bold text-gray-900">To Reschedule</div>
          <div className="text-[13.5px] text-gray-500">
            Sent back to the Service Manager to rebook. No action needed from you until it&apos;s reassigned.
          </div>
        </>
      )}
      {order.status === 'onway' && (
        <>
          <div className="mb-2 text-lg font-bold text-gray-900">On The Way</div>
          <div className="mb-3 text-[13.5px] text-gray-500">
            Mark <b>At Site</b> when you arrive — that opens the Job Card.
          </div>
          <button
            type="button"
            onClick={onAtSite}
            disabled={busy}
            className="w-full rounded-xl bg-blue-600 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
          >
            I&apos;ve arrived → At Site
          </button>
          {RescheduleBtn}
        </>
      )}
      {order.status === 'atsite' && (
        <>
          <div className="mb-2 text-lg font-bold text-gray-900">At Site</div>
          <div className="mb-3 text-[13.5px] text-gray-500">
            Fill the Job Card, capture the client&apos;s signature, and complete the audit.
          </div>
          <button
            type="button"
            onClick={onOpenJC}
            className="w-full rounded-xl bg-[#1F3A5F] py-3 text-sm font-bold text-white hover:opacity-90"
          >
            {order.jobcard ? 'Resume Job Card' : 'Open Job Card'}
          </button>
          {RescheduleBtn}
        </>
      )}
      {order.status === 'completed' && (
        <>
          <div className="mb-2 text-lg font-bold text-green-600">Site Audit Completed</div>
          <div className="mb-3 text-[13.5px] text-gray-500">
            Job card submitted. You can add more rooms or details by reopening the job card.
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onOpenJC}
              className="flex-1 rounded-xl bg-[#1F3A5F] py-3 text-sm font-bold text-white hover:opacity-90"
            >
              Edit / Add Rooms
            </button>
            <button
              type="button"
              onClick={onDownloadPdf}
              disabled={downloading}
              className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {downloading ? 'Building PDF…' : 'Download Job Card PDF'}
            </button>
          </div>
          {pdfLink && (
            <a
              href={pdfLink}
              target="_blank"
              rel="noopener noreferrer"
              download={fn}
              className="mt-2.5 block rounded-lg bg-green-600 py-3 text-center text-sm font-bold text-white hover:opacity-90"
            >
              📥 Tap to open PDF
            </a>
          )}
        </>
      )}
      {!AUDITOR_STAGES.includes(order.status) && (
        <>
          <div className="mb-2 text-lg font-bold text-gray-900">
            {(STATUS_LABELS[order.status] || { l: order.status || 'Unknown' }).l}
          </div>
          <div className="text-[13.5px] text-gray-500">
            There is nothing for you to do on this job right now — your Service Manager moves it on from
            here. Call them if you were expecting to start it.
          </div>
        </>
      )}
    </div>
  );
}

export function JobDetailView({
  order,
  actingAs,
  onBack,
  onOpenJobCard,
  onUpdateOrder,
  showToast,
  locationTracker,
  refreshJobs,
}: {
  order: Order;
  actingAs: ActingAs;
  onBack: () => void;
  onOpenJobCard: () => void;
  onUpdateOrder: (updater: Partial<Order> | ((o: Order) => Order)) => void;
  showToast: (m: string) => void;
  locationTracker: LocationTracker;
  refreshJobs: () => Promise<void>;
}) {
  const [reschedOpen, setReschedOpen] = useState(false);
  const [commentDialog, setCommentDialog] = useState<{ title: string; onConfirm: (c: string) => void } | null>(null);
  const [arrivalOpen, setArrivalOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pdfLink, setPdfLink] = useState<string | null>(null);
  const [advBusy, setAdvBusy] = useState(false);
  const advBusyRef = useRef(false);

  const adv = useCallback(
    async (st: string, toastMsg: string, logOverride?: string | null, extraLog?: LogExtra): Promise<boolean> => {

      if (advBusyRef.current) return false;
      advBusyRef.current = true;
      setAdvBusy(true);
      try {
        const logText = logOverride || DEFAULT_LOG_TEXT[st] || st;
        const entry: LogEntry = { t: logText, d: new Date().toISOString(), by: 'auto', who: actingAs.name, ...extraLog };
        const dbStatus = st === 'scheduled' ? 'assigned' : st;
        let newLog = [...order.log, entry];
        if (order.id) {
          try {
            const rows = await sbGet('audit_orders?id=eq.' + order.id + '&select=log,status');
            const fresh = Array.isArray(rows) && rows[0] ? rows[0] : null;

            if (fresh && normalizeAuditStatus(fresh.status) !== order.status) {
              const label = (STATUS_LABELS[normalizeAuditStatus(fresh.status)] || { l: fresh.status }).l;
              showToast('The office moved this job to "' + label + '" — showing the latest now');
              await refreshJobs();
              return false;
            }
            const freshLog: LogEntry[] = fresh && Array.isArray(fresh.log) ? fresh.log : order.log;
            newLog = [...freshLog, entry];
            await sbPatch('audit_orders', order.id, { status: dbStatus, log: newLog });
          } catch {
            showToast('Network error — try again');
            return false;
          }
        }
        if (st === 'atsite') locationTracker.start(order.pi);
        else if (st === 'completed' || st === 'reschedule') locationTracker.stop();
        onUpdateOrder((o) => ({ ...o, status: st, log: newLog }));
        await refreshJobs();
        showToast(toastMsg);
        return true;
      } finally {
        advBusyRef.current = false;
        setAdvBusy(false);
      }
    },
    [order, actingAs.name, locationTracker, onUpdateOrder, refreshJobs, showToast],
  );

  const handleDownloadPdf = useCallback(async () => {
    setDownloading(true);
    let jc = order.jobcard;
    if (!jc || !jc.sign || !jc.sign.img) {
      try {
        const rows = await sbGet('audit_orders?id=eq.' + order.id + '&select=audit_ticked');
        if (Array.isArray(rows) && rows[0]?.audit_ticked?.sign) {
          jc = { rooms: rows[0].audit_ticked.rooms || [], sign: rows[0].audit_ticked.sign };
          const resolvedJc = jc;
          onUpdateOrder((o) => ({ ...o, jobcard: resolvedJc }));
        }
      } catch {}
    }
    if (!jc || !jc.sign) {
      showToast('Job card not available');
      setDownloading(false);
      return;
    }
    let url: string | null = null;
    try {
      url = await genPDF({ ...order, jobcard: jc }, actingAs.name);
    } catch (e) {
      console.error('PDF:', e);
    }
    setDownloading(false);
    if (url) setPdfLink(url);
    else showToast('PDF generation failed — try again');
  }, [order, actingAs.name, onUpdateOrder, showToast]);

  const skus = order.skus.filter((s) => !s.audit);
  const fn = pdfFileName(order);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
        >
          ←
        </button>
        <div>
          <div className="text-[15px] font-bold text-gray-900">{order.name}</div>
          <div className="text-[13px] text-gray-500">
            {order.pi} · {fmtDateA(order.date)} · {slotLabel(order.slot)}
          </div>
        </div>
      </div>

      {reschedOpen ? (
        <RescheduleForm
          showToast={showToast}
          busy={advBusy}
          onCancel={() => setReschedOpen(false)}
          onConfirm={async (reason, followUp) => {
            const logMsg = 'Reschedule requested: ' + reason + (followUp ? ` · Follow-up: ${followUp}` : '');

            const ok = await adv('reschedule', 'Sent to SM to reschedule', logMsg);
            if (!ok) return;
            setReschedOpen(false);
            if (followUp && order.id) {
              try {
                await sbPatch('audit_orders', order.id, { service: { ...order.service, follow_up_date: followUp } });
              } catch {}
            }
          }}
        />
      ) : (
        <>
          <StageBar
            order={order}
            busy={advBusy}
            onToCall={() =>
              setCommentDialog({
                title: 'Starting pre-visit call',
                onConfirm: (c) => {
                  setCommentDialog(null);
                  adv('callpending', 'Pre-visit call started' + (c ? ` — ${c}` : ''));
                },
              })
            }
            onCustYes={() =>
              setCommentDialog({
                title: 'Confirming on the way',
                onConfirm: (c) => {
                  setCommentDialog(null);
                  adv('onway', 'Auditor on the way · customer confirmed' + (c ? ` — ${c}` : ''));
                },
              })
            }
            onReschedule={() => setReschedOpen(true)}
            onAtSite={() => setArrivalOpen(true)}
            onOpenJC={onOpenJobCard}
            onDownloadPdf={handleDownloadPdf}
            downloading={downloading}
            pdfLink={pdfLink}
            fn={fn}
          />

          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-[15px] font-bold text-gray-900">Customer</h2>
            <KV label="Name" value={order.name} />
            <div className="flex py-0.5 text-[13px]">
              <span className="w-28 shrink-0 text-gray-400">Phone</span>
              <a href={'tel:' + order.phone.replace(/\s/g, '')} className="text-blue-600 hover:underline">
                {order.phone}
              </a>
            </div>
            <div className="flex py-0.5 text-[13px]">
              <span className="w-28 shrink-0 text-gray-400">Address</span>
              <a href={mapUrl(order.addr)} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                {order.addr} ↗
              </a>
            </div>
            <KV label="BM" value={order.bm} />
            <div className="flex py-0.5 text-[13px]">
              <span className="w-28 shrink-0 text-gray-400">Audit for</span>
              <span>
                {skus.length
                  ? skus.map((s, i) => (
                      <span key={i} className="mr-1 inline-block rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                        {s.c}
                        {s.n && s.n !== s.c ? ` · ${s.n}` : ''}
                      </span>
                    ))
                  : 'NA'}
              </span>
            </div>
            <a
              href={'tel:' + order.phone.replace(/\s/g, '')}
              className="mt-3 block rounded-lg bg-[#1F3A5F] py-2.5 text-center text-sm font-bold text-white hover:opacity-90"
            >
              📞 Call customer
            </a>
          </div>
        </>
      )}

      {arrivalOpen && (
        <ArrivalCameraModal
          open={arrivalOpen}
          onClose={() => setArrivalOpen(false)}
          onConfirm={({ photo, lat, lng }) => {
            setArrivalOpen(false);
            const extra: LogExtra = {};
            if (photo) extra.arrivalPhoto = photo;
            const haveFix = lat != null && lng != null;
            if (haveFix) {
              extra.lat = lat;
              extra.lng = lng;
            } else {

              extra.locOverride = true;
            }
            adv('atsite', 'At site — open the Job Card', haveFix ? null : 'Auditor arrived at site ⚠ (no location captured)', extra);
          }}
        />
      )}

      {commentDialog && (
        <CommentDialog title={commentDialog.title} onCancel={() => setCommentDialog(null)} onConfirm={commentDialog.onConfirm} />
      )}
    </div>
  );
}

export function JobDetailsHeader({ order, actingAs }: { order: Order; actingAs: ActingAs }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-gray-900">
        Job details <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">prefilled</span>
      </h2>
      <div className="grid grid-cols-2 gap-3">
        <FieldRO label="Proforma Invoice No." value={order.pi} full />
        <FieldRO label="Client name" value={order.name} />
        <FieldRO label="Client mobile" value={order.phone} />
        <FieldRO label="Site address" value={order.addr} full />
        <FieldRO label="Auditor" value={actingAs.name} />
        <FieldRO label="Date" value={fmtDateA(order.date)} />
        <FieldRO label="Time slot" value={slotLabel(order.slot)} />
      </div>
    </div>
  );
}
