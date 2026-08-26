'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { jsPDF } from 'jspdf';
import { cn } from '@/lib/utils';
import { sbGet, sbPost, sbPatch, sbPatchLong, uploadPhoto, fmtDateA } from '@/components/site-audit/siteAuditShared';
import { confirmServicePerformed, retryQueuedServiceConfirms } from '@/components/site-audit/omsService';
import {
  SketchCanvas,
  SignaturePad,
  useLocationTracking,
  ArrivalCameraModal,
  DocScannerModal,
  type SignaturePadHandle,
  type SketchStroke,
  type LocationTracker,
} from '@/components/site-audit/fieldAppShared';
import {
  CATEGORY_LIST,
  MD_CATEGORIES,
  ROOM_V,
  adjMissingPhoto,
  adjMissingReason,
  adjRows,
  adjSum,
  categoryFor,
  computeDerived,
  fieldsFor,
  mdInstallTermsBlock,
  needsVariant,
  normalizeRoom,
  prereqFlagged,
  segmentPrereqRows,
  segmentRows,
  unitFor,
  unitNoteFor,
  type AdjustRow,
  type CategoryDef,
  type FieldValues,
  type PrereqEntry,
} from '@/components/site-audit/auditRegistry';
import {
  MD_INK,
  MD_MUTED,
  mdBrandGrid,
  mdCompress,
  mdInfoTable,
  mdPdfAuditRoom,
  mdPdfConsent,
  mdPdfHeader,
  loadBrandLogo,
} from '@/components/site-audit/pdfBrand';

/* Idiomatic React port of material-depot-site's app/src/pages/SiteAuditor.jsx.
   Identity is supplied via the actingAs prop (Role Viewer) instead of a
   client session — every ME.name/ME.email reference in the source becomes
   actingAs.name/actingAs.email here. */

export type ActingAs = { id: string; name: string; email: string };

type SkuItem = { c: string; n?: string; type?: string; audit?: boolean };

type LogEntry = {
  t: string;
  d: string;
  by: string;
  who: string;
  arrivalPhoto?: string | null;
  lat?: number | null;
  lng?: number | null;
};
type LogExtra = Partial<Pick<LogEntry, 'arrivalPhoto' | 'lat' | 'lng'>>;

/* One measured segment of a room — a wall for the multi-segment categories (wallpaper / CNC /
   wall panels), the single floor for flooring. `sid` is local-only; the serialized room writes it
   out as `id`. */
type Segment = {
  sid: number;
  facing: string | null;
  photos: string[];
  fields: FieldValues;
  prereq: Record<string, PrereqEntry>;
  adjust: AdjustRow[];
};

type Room = {
  id: number;
  // Schema version — a resumed v2 draft keeps its OWN v (mm whatever the variant, see
  // auditRegistry's per-variant-unit gate); only a brand-new room gets the current ROOM_V.
  v: number;
  category: string;
  name: string;
  sku: string;
  variant: string | null;
  notes: string;
  segments: Segment[];
  nextSid: number;
  sketchStrokes: SketchStroke[];
};

type SignData = {
  img: string;
  name: string;
  // Ratings are collected via a D+1 COE call now (see components/site-audit/coe-ops), never on-site
  // — this stays optional only so historical job cards with an old sign.ratings still render.
  ratings?: { q1: number; q2: number; q3: number; comments: string };
  tcCategories?: string[];
};

/* Rooms are stored in their serialized v2 shape (see serializeRoom) — the same shape written to
   audit_orders.audit_ticked, so the PDF and the SM dashboard read one format. */
type JobCard = { rooms: any[]; sign?: SignData | null };

type Order = {
  id: string;
  pi: string;
  name: string;
  phone: string;
  addr: string;
  bm: string;
  date: string | null;
  slot: string | null;
  status: string;
  skus: SkuItem[];
  log: LogEntry[];
  jobcard: JobCard | null;
  service?: Record<string, any> | null;
};

const AUDITOR_COLS =
  'id,pi,po,skus,bm,customer_name,phone,addr,status,service,slot,date,auditor_id,auditor_name,auditor_email,log';

const SLOTS: Record<string, { label: string; start: number }> = {
  s1: { label: '9 AM – 12 PM', start: 9 },
  s2: { label: '12 PM – 3 PM', start: 12 },
  s3: { label: '3 PM – 6 PM', start: 15 },
  sf1: { label: '9 AM – 12 PM', start: 9 },
  sf2: { label: '12 PM – 3 PM', start: 12 },
  sf3: { label: '3 PM – 6 PM', start: 15 },
  sw1: { label: '9 AM – 12 PM', start: 9 },
  sw2: { label: '12 PM – 3 PM', start: 12 },
  sw3: { label: '3 PM – 6 PM', start: 15 },
};

const STATUS_LABELS: Record<string, { l: string; chip: string }> = {
  scheduled: { l: 'Scheduled', chip: 'bg-indigo-100 text-indigo-700' },
  callpending: { l: 'Call Pending', chip: 'bg-indigo-100 text-indigo-700' },
  reschedule: { l: 'To Reschedule', chip: 'bg-red-100 text-red-700' },
  onway: { l: 'On The Way', chip: 'bg-blue-100 text-blue-700' },
  atsite: { l: 'At Site', chip: 'bg-blue-100 text-blue-700' },
  completed: { l: 'Site Audit Completed', chip: 'bg-green-100 text-green-700' },
};

/* The statuses CurrentStage draws a card for. Anything else falls through to a
   self-describing block instead of an empty panel — `slot_converted` used to
   land there, and the field apps share these tables with the material-depot-site
   PWA, which can add a status this port has never heard of. */
const AUDITOR_STAGES = ['scheduled', 'callpending', 'reschedule', 'onway', 'atsite', 'completed'];

const DEFAULT_LOG_TEXT: Record<string, string> = {
  callpending: 'Pre-visit call started',
  onway: 'Auditor on the way · customer confirmed',
  reschedule: 'Customer declined → sent to SM to reschedule',
  atsite: 'Auditor arrived at site',
  completed: 'Site audit completed',
};

/* Legacy audit field dicts removed — superseded by MD_CATEGORIES in auditRegistry.ts. */

/* Serialized (DB / draft) shape of one captured room — v2 segments. */
function serializeRoom(r: Room) {
  return {
    v: r.v || ROOM_V,
    category: r.category,
    name: r.name,
    sku: r.sku,
    variant: r.variant || null,
    notes: r.notes,
    sketchStrokes: r.sketchStrokes || [],
    segments: (r.segments || []).map((s) => ({
      id: s.sid,
      facing: s.facing || null,
      fields: { ...s.fields },
      photos: (s.photos || []).slice(),
      prereq: { ...s.prereq },
      adjust: (s.adjust || []).map((a) => ({ ...a, photos: (a.photos || []).slice() })),
      flagged: prereqFlagged(s),
    })),
  };
}

/* Draft written to the DB on autosave — photos are dropped per segment AND per adjustment (they
   can be multi-MB base64 until each upload swaps in its Storage URL). */
function draftPayload(rooms: Room[]) {
  return rooms.map((r) => {
    const { segments, ...rest } = serializeRoom(r);
    return {
      ...rest,
      segments: segments.map(({ photos, adjust, ...s }) => ({
        ...s,
        adjust: adjust.map(({ photos: _p, ...a }) => a),
      })),
    };
  });
}

// `termsBlock` (from mdInstallTermsBlock) fills what used to be a literal, never-written-in
// placeholder — the install-readiness clauses for whichever categories are in this job card, so
// the client is confirming the site is ready for installation, not just that the audit happened.
function buildAuditTC(termsBlock: string): string {
  return `Material Depot — Client Acknowledgement

By ticking the box and signing below, I confirm that:

• The site visit described in this job card was carried out to my satisfaction.
• The details, measurements and room information recorded are accurate and correct.
• I am satisfied with the service provided by the Material Depot team.
• I consent to being contacted for quality feedback purposes if required.
• I have read, understood and agree to the installation terms & conditions below, which explain what needs to be in place before installation can proceed.

${termsBlock || '[Full terms and conditions will be provided by Material Depot]'}`;
}

/* ---- date / slot helpers (verbatim logic from source) ---- */
function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function dstr(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}
function slotLabel(id: string | null): string {
  if (!id) return '—';
  if (SLOTS[id]) return SLOTS[id].label;
  if (/^\d{1,2}:\d{2}$/.test(id)) {
    const [h, m] = id.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  }
  return '—';
}
function mapUrl(a: string): string {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a);
}

/* `assigned` is the DB spelling of what this app calls `scheduled`. loadJobs
   maps it on the way in, so ANYTHING that compares a fresh DB read against an
   on-screen Order has to map it too. adv()'s stale-write guard did not, so
   `assigned !== scheduled` fired on every freshly assigned audit — the auditor
   could never start the pre-visit call or reschedule, and the toast's advice to
   refresh could not help because nothing was actually stale. */
function normalizeAuditStatus(s: string | null | undefined): string {
  return s === 'assigned' ? 'scheduled' : s || '';
}

function computeDisplayStatus(o: Order, now: Date, today: Date): string {
  if (o.status === 'scheduled' && o.date === dstr(today)) {
    let startH: number | undefined;
    if (o.slot && SLOTS[o.slot]) startH = SLOTS[o.slot].start;
    else if (o.slot && /^\d{1,2}:\d{2}$/.test(o.slot)) {
      const [h, m] = o.slot.split(':').map(Number);
      startH = h + m / 60;
    } else {
      return o.status;
    }
    const start = new Date(today);
    start.setHours(Math.floor(startH), Math.round((startH % 1) * 60), 0, 0);
    if (now.getTime() >= start.getTime() - 3 * 3600 * 1000) return 'callpending';
  }
  return o.status;
}

/* ---- pending-completion retry (localStorage recovery, verbatim) ---- */
let retryingCompletion = false;
async function retryPendingCompletions() {
  if (retryingCompletion) return;
  retryingCompletion = true;
  try {
    await retryQueuedServiceConfirms();
    const pKeys = Object.keys(localStorage).filter((k) => k.startsWith('md_audit_ps_'));
    for (const k of pKeys) {
      try {
        const d = JSON.parse(localStorage.getItem(k) || 'null');
        if (d) {
          await sbPatch('audit_orders', d.id, { status: 'completed', log: d.log });
          localStorage.removeItem(k);
        }
      } catch {}
    }
    const jcKeys = Object.keys(localStorage).filter((k) => k.startsWith('md_audit_pjc_'));
    for (const k of jcKeys) {
      try {
        const d = JSON.parse(localStorage.getItem(k) || 'null');
        if (d) {
          await sbPatchLong('audit_orders', d.id, { audit_ticked: d.ticked });
          localStorage.removeItem(k);
        }
      } catch {}
    }
  } finally {
    retryingCompletion = false;
  }
}

async function loadJobs(email: string, prevOrders: Order[]): Promise<Order[]> {
  retryPendingCompletions();
  try {
    const rows = await sbGet(
      'audit_orders?auditor_email=eq.' +
        encodeURIComponent(email) +
        '&select=' +
        AUDITOR_COLS +
        // A pre-booking is a held store slot whose real audit is a SEPARATE row
        // (the reservation's `po` is that row's `pi`) — 18 live ones carry an
        // auditor_email and were rendering in six auditors' lists as jobs with
        // no stage and no buttons. The ops views filter the same two statuses.
        '&status=not.in.(deleted,slot_reserved,slot_converted)&order=created_at.desc',
    );
    if (!Array.isArray(rows)) return prevOrders;
    const existing: Record<string, JobCard> = {};
    prevOrders.forEach((o) => {
      if (o.jobcard) existing[o.pi] = o.jobcard;
    });
    return rows.map((r: any) => ({
      id: r.id,
      pi: r.pi || '',
      name: r.customer_name || '',
      phone: r.phone || '',
      addr: r.addr || '',
      bm: r.bm || '',
      date: r.date || null,
      slot: r.slot || null,
      status: normalizeAuditStatus(r.status),
      skus: r.skus || [],
      log: r.log || [],
      jobcard: existing[r.pi] || null,
      service: r.service || null,
    }));
  } catch (e) {
    console.error('loadJobs', e);
    return prevOrders;
  }
}

/* ---- image helpers (verbatim resize/sketch/PDF logic) ---- */
function resizeImageDataUrl(dataUrl: string, maxDim: number, quality: number): Promise<string | null> {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      try {
        const s = Math.min(1, maxDim / im.width, maxDim / im.height);
        const cw = Math.round(im.width * s), ch = Math.round(im.height * s);
        const cv = document.createElement('canvas');
        cv.width = cw;
        cv.height = ch;
        cv.getContext('2d')!.drawImage(im, 0, 0, cw, ch);
        resolve(cv.toDataURL('image/jpeg', quality));
      } catch {
        resolve(null);
      }
    };
    im.onerror = () => resolve(null);
    im.src = dataUrl;
  });
}

function compressImageDataUrl(dataUrl: string | null | undefined): Promise<string | null> {
  if (!dataUrl) return Promise.resolve(null);
  return new Promise((resolve) => {
    const im = new Image();
    if (dataUrl.startsWith('http')) im.crossOrigin = 'anonymous';
    im.onload = () => {
      try {
        const s = Math.min(1, 1600 / im.width, 1200 / im.height);
        const w = Math.round(im.width * s), h = Math.round(im.height * s);
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        cv.getContext('2d')!.drawImage(im, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', 0.88));
      } catch {
        resolve(null);
      }
    };
    im.onerror = () => resolve(null);
    im.src = dataUrl;
  });
}

function renderSketchData(sketchStrokes: SketchStroke[] | undefined): string | null {
  if (!sketchStrokes || !sketchStrokes.length) return null;
  const W = 1000, H = 500;
  const o = document.createElement('canvas');
  o.width = W;
  o.height = H;
  const x = o.getContext('2d')!;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, W, H);
  const s = Math.round(22 * (W / 360));
  x.fillStyle = '#b2b8c1';
  for (let yy = s; yy < H; yy += s) {
    for (let xx = s; xx < W; xx += s) {
      x.beginPath();
      x.arc(xx, yy, 2, 0, 7);
      x.fill();
    }
  }
  x.strokeStyle = '#1F3A5F';
  x.lineWidth = 3.2;
  x.lineJoin = 'round';
  x.lineCap = 'round';
  for (const st of sketchStrokes) {
    if (st.length < 1) continue;
    x.beginPath();
    st.forEach((p, i) => {
      const X = p.x * W, Y = p.y * H;
      if (i) x.lineTo(X, Y);
      else x.moveTo(X, Y);
    });
    x.stroke();
  }
  return o.toDataURL('image/jpeg', 0.85);
}

async function genPDF(order: Order, auditorName: string): Promise<string> {
  await loadBrandLogo();
  const doc: any = new jsPDF('p', 'pt', 'a4');
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
  let y = M;
  const navy = MD_INK;
  const muted = MD_MUTED;
  const rooms: any[] = order.jobcard?.rooms || [];

  function header() {
    y = mdPdfHeader(doc, { title: 'Site Audit Job Card', right: order.pi, M });
    return y;
  }
  header();
  y = mdInfoTable(
    doc,
    y,
    [
      ['Proforma Invoice No.', order.pi],
      ['Client Name', order.name],
      ['Client Mobile', order.phone],
      ['Site Address', order.addr],
      ['BM', order.bm],
      ['Auditor', auditorName],
      ['Date', fmtDateA(order.date)],
    ],
    M,
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...navy);
  doc.text('Rooms summary', M, y + 4);
  y += 10;
  doc.autoTable(
    mdBrandGrid({
      startY: y,
      margin: { left: M, right: M },
      styles: { fontSize: 8.5, cellPadding: 4, lineColor: [210, 216, 225] },
      head: [['#', 'Room', 'Type', 'SKU No.']],
      body: rooms.map((r, i) => [String(i + 1), r.name || '-', categoryFor(r.category || r.type).pdfLabel, r.sku || 'NA']),
    }),
  );

  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    doc.addPage();
    y = M;
    header();
    const cat = categoryFor(r.category || r.type);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...navy);
    doc.text('Room ' + (i + 1) + ': ' + (r.name || '-'), M, y + 2);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...muted);
    doc.text(cat.pdfLabel + '  ·  SKU: ' + (r.sku || 'NA'), M, y + 10);
    y += 24;
    y = await mdPdfAuditRoom(doc, r, y, {
      M,
      W,
      H,
      compress: (d) => mdCompress(d),
      sketchImg: renderSketchData(r.sketchStrokes),
      header: () => mdPdfHeader(doc, { title: 'Site Audit Job Card', right: order.pi, M }),
    });
  }

  doc.addPage();
  y = M;
  header();
  const R = order.jobcard?.sign?.ratings;
  if (R) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...navy);
    doc.text('Client Feedback', M, y);
    y += 14;
    doc.autoTable({
      startY: y,
      margin: { left: M, right: M },
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 260, fontStyle: 'bold', textColor: navy, fillColor: [238, 243, 249] } },
      body: [
        ['Overall Site Audit experience', String(R.q1 || '—') + ' / 10'],
        ['Site Auditor behaviour', String(R.q2 || '—') + ' / 10'],
        ['Site cleanliness after audit', String(R.q3 || '—') + ' / 10'],
        ...(R.comments ? [['Comments', R.comments]] : []),
      ],
    });
    y = doc.lastAutoTable.finalY + 12;
  }
  await mdPdfConsent(doc, {
    y,
    M,
    W,
    H,
    compress: compressImageDataUrl,
    consentText:
      'I confirm that the site audit for the above order has been carried out by the Material Depot auditor, that the rooms, measurements and details recorded in this Job Card are correct, and that I am satisfied with the service provided, and that I have read, understood and agree to the installation terms & conditions below.',
    termsBlock: mdInstallTermsBlock([...new Set(rooms.map((r) => r.category || r.type))]),
    personName: order.jobcard?.sign?.name || order.name,
    personDate: fmtDateA(order.date),
    sign: order.jobcard?.sign,
    header: () => mdPdfHeader(doc, { title: 'Site Audit Job Card', right: order.pi, M }),
  });
  return URL.createObjectURL(doc.output('blob'));
}

function pdfFileName(order: Order): string {
  return ('SiteAudit_' + (order.name || 'client') + '_' + (order.pi || '') + '.pdf').replace(/[^a-z0-9_\-.]/gi, '_');
}

/* ---- small reusable UI bits ---- */
function Spinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#EAB308]" />
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex py-0.5 text-[13px]">
      <span className="w-28 shrink-0 text-gray-400">{label}</span>
      <span className="text-gray-900">{value}</span>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const s = STATUS_LABELS[status] || { l: status, chip: 'bg-gray-100 text-gray-600' };
  return (
    <span className={cn('inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium', s.chip)}>
      {s.l}
    </span>
  );
}


function CommentDialog({
  title,
  onCancel,
  onConfirm,
}: {
  title: string;
  onCancel: () => void;
  onConfirm: (comment: string) => void;
}) {
  const [comment, setComment] = useState('');
  return (
    <div
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/40 sm:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="w-full max-w-lg rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <div className="mb-3 text-[15px] font-bold text-gray-900">{title}</div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment (optional — leave blank to skip)"
          className="mb-3 min-h-[80px] w-full resize-y rounded-lg border border-gray-200 p-2.5 text-sm outline-none focus:border-yellow-400"
        />
        <div className="grid grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-gray-200 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(comment.trim())}
            className="col-span-2 rounded-xl bg-[#1F3A5F] py-3 text-sm font-bold text-white hover:opacity-90"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---- day strip + job list ---- */
function DayStrip({
  orders,
  selDay,
  onSelectDay,
  today,
}: {
  orders: Order[];
  selDay: string;
  onSelectDay: (d: string) => void;
  today: Date;
}) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const days = useMemo(() => Array.from({ length: 37 }, (_, i) => addDays(today, i - 30)), [today]);
  const todayStr = dstr(today);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const sel = strip.querySelector<HTMLElement>('[data-selected="true"]');
    if (sel) strip.scrollLeft = Math.max(0, sel.offsetLeft - strip.clientWidth / 2 + sel.offsetWidth / 2);
  }, [selDay]);

  return (
    <div ref={stripRef} className="mb-4 flex gap-2 overflow-x-auto pb-2">
      {days.map((d) => {
        const ds = dstr(d);
        const n = orders.filter((o) => o.date === ds).length;
        const isToday = ds === todayStr;
        const isSel = ds === selDay;
        return (
          <button
            key={ds}
            type="button"
            data-selected={isSel}
            onClick={() => onSelectDay(ds)}
            className={cn(
              'flex w-16 shrink-0 flex-col items-center rounded-lg border px-2 py-2 text-center',
              isSel ? 'border-[#EAB308] bg-yellow-50' : 'border-gray-200 bg-white',
            )}
          >
            <div className="text-[11px] font-semibold text-gray-500">
              {isToday ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short' })}
            </div>
            <div className="text-lg font-bold text-gray-900">{d.getDate()}</div>
            <div className="h-3 text-[10px] text-gray-400">{n > 0 ? `${n} audit${n !== 1 ? 's' : ''}` : ''}</div>
          </button>
        );
      })}
    </div>
  );
}

function JobListCard({
  order,
  displayStatus,
  unscheduled,
  onOpen,
}: {
  order: Order;
  displayStatus: string;
  unscheduled?: boolean;
  onOpen: () => void;
}) {
  const skus = order.skus.filter((s) => !s.audit);
  return (
    <div
      onClick={onOpen}
      className={cn(
        'mb-3 cursor-pointer rounded-lg border bg-white p-4 hover:border-gray-300',
        unscheduled ? 'border-yellow-400' : 'border-gray-200',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[15px] font-bold text-gray-900">{order.name}</div>
          <div className="text-[13px] text-gray-500">{order.pi} · BM {order.bm}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className={cn('mb-1 text-[13px] font-semibold', unscheduled ? 'text-yellow-700' : 'text-gray-700')}>
            {unscheduled ? 'Awaiting date from office' : slotLabel(order.slot)}
          </div>
          <StatusChip status={displayStatus} />
        </div>
      </div>
      <div className="mt-3 space-y-1.5 text-[13px] text-gray-600">
        <div className="flex items-center gap-2">
          <span>📱</span>
          {order.phone}
        </div>
        <div className="flex items-center gap-2">
          <span>📍</span>
          <a
            href={mapUrl(order.addr)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-blue-600 hover:underline"
          >
            {order.addr}
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span>📦</span>
          {skus.length ? (
            skus.map((s, i) => (
              <span key={i} className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
                {s.c}
              </span>
            ))
          ) : (
            <span>NA</span>
          )}
        </div>
      </div>
    </div>
  );
}

function JobListView({
  orders,
  selDay,
  onSelectDay,
  today,
  onOpenJob,
}: {
  orders: Order[];
  selDay: string;
  onSelectDay: (d: string) => void;
  today: Date;
  onOpenJob: (pi: string) => void;
}) {
  const now = new Date();
  const todayStr = dstr(today);
  const withDisplay = useMemo(
    () => orders.map((o) => ({ o, displayStatus: computeDisplayStatus(o, now, today) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, today],
  );
  const list = withDisplay
    .filter(({ o }) => o.date === selDay)
    .sort((a, b) => (a.o.slot || '').localeCompare(b.o.slot || ''));
  const todo = list.filter(({ displayStatus }) => displayStatus !== 'completed');
  const done = list.filter(({ displayStatus }) => displayStatus === 'completed');
  const unscheduled = withDisplay.filter(
    ({ o, displayStatus }) => !o.date && !['completed', 'reschedule'].includes(displayStatus),
  );

  return (
    <div>
      <DayStrip orders={orders} selDay={selDay} onSelectDay={onSelectDay} today={today} />
      {unscheduled.length > 0 && (
        <>
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-yellow-700">
            Awaiting schedule — no date set yet
          </div>
          {unscheduled.map(({ o, displayStatus }) => (
            <JobListCard key={o.pi} order={o} displayStatus={displayStatus} unscheduled onOpen={() => onOpenJob(o.pi)} />
          ))}
        </>
      )}
      <div className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-gray-700">
        {selDay === todayStr ? 'Today' : 'Jobs'} — {fmtDateA(selDay)}
      </div>
      {todo.length ? (
        todo.map(({ o, displayStatus }) => (
          <JobListCard key={o.pi} order={o} displayStatus={displayStatus} onOpen={() => onOpenJob(o.pi)} />
        ))
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          No pending audits for this day.
        </div>
      )}
      {done.length > 0 && (
        <>
          <div className="mb-2 mt-4 text-xs font-bold uppercase tracking-wider text-gray-700">Completed</div>
          {done.map(({ o, displayStatus }) => (
            <JobListCard key={o.pi} order={o} displayStatus={displayStatus} onOpen={() => onOpenJob(o.pi)} />
          ))}
        </>
      )}
    </div>
  );
}

/* ---- reschedule form ---- */
function RescheduleForm({
  showToast,
  busy,
  onCancel,
  onConfirm,
}: {
  showToast: (m: string) => void;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string, followUp: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [followUp, setFollowUp] = useState('');
  const todayStr = dstr(todayMidnight());
  return (
    <div>
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-2.5 text-[15px] font-bold text-red-600">Reschedule audit</h2>
        <p className="mb-3.5 text-[13.5px] text-gray-500">
          Explain why this visit can&apos;t proceed. The SM will rebook the slot.
        </p>
        <label className="text-[13px] font-bold text-gray-700">
          Reason <span className="text-red-600">*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Customer not available, site not accessible, material not matching…"
          className="mt-1.5 block min-h-[100px] w-full resize-y rounded-lg border border-gray-200 p-2.5 text-[13.5px] outline-none focus:border-yellow-400"
        />
        <label className="mt-3.5 block text-[13px] font-bold text-gray-700">
          Follow-up date <span className="text-[11px] font-normal text-gray-400">(optional — when to call client)</span>
        </label>
        <input
          type="date"
          min={todayStr}
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
          className="mt-1.5 block w-full rounded-lg border border-gray-200 p-2.5 text-[13.5px] outline-none focus:border-yellow-400"
        />
      </div>
      <div className="mt-3.5 flex gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!reason.trim()) {
              showToast('Please enter a reason for rescheduling');
              return;
            }
            onConfirm(reason.trim(), followUp.trim());
          }}
          className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Submitting…' : 'Confirm Reschedule'}
        </button>
      </div>
    </div>
  );
}

/* ---- stage bar (per-status call-to-action) ---- */
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

/* ---- job detail view ---- */
function JobDetailView({
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

  // Read-merge-write + busy-guard, mirroring SiteInstallerApp's advanceStatus
  // — without the fresh read, a double-tap builds its `newLog` off the same
  // stale `order.log` closure twice, and whichever sbPatch lands last silently
  // drops the other tap's log entry.
  const adv = useCallback(
    async (st: string, toastMsg: string, logOverride?: string | null, extraLog?: LogExtra): Promise<boolean> => {
      if (advBusy) return false;
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
            // The screen's `order.status` can go stale — an SM action (e.g.
            // rebooking after a reschedule) can land between this button being
            // shown and tapped. Without this check a delayed/duplicate tap
            // here would silently overwrite whatever the SM just set, which is
            // exactly what made a rebooked slot "revert" to reschedule.
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
        setAdvBusy(false);
      }
    },
    [advBusy, order, actingAs.name, locationTracker, onUpdateOrder, refreshJobs, showToast],
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
            // Wait for adv() to actually succeed before closing the form —
            // closing it up front (as this used to) left the Confirm button
            // fully clickable for the whole round trip, so a slow/flaky
            // connection invited repeat taps that each wrote their own
            // duplicate "Reschedule requested" log entry.
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
            if (lat != null && lng != null) {
              extra.lat = lat;
              extra.lng = lng;
            }
            adv('atsite', 'At site — open the Job Card', null, extra);
          }}
        />
      )}

      {commentDialog && (
        <CommentDialog title={commentDialog.title} onCancel={() => setCommentDialog(null)} onConfirm={commentDialog.onConfirm} />
      )}
    </div>
  );
}

/* ---- job card details header (read-only prefilled fields) ---- */
function FieldRO({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : ''}>
      <label className="text-xs text-gray-500">{label}</label>
      <input
        value={value}
        disabled
        className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-500"
      />
    </div>
  );
}

function JobDetailsHeader({ order, actingAs }: { order: Order; actingAs: ActingAs }) {
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

type RoomPatch = Partial<Room> | ((r: Room) => Partial<Room>);

function blankSegment(catKey: string, sid: number, room?: { v?: number; variant?: string | null } | null): Segment {
  const cat = MD_CATEGORIES[catKey] || MD_CATEGORIES.flooring;
  const roomCtx = room || { v: ROOM_V, variant: null };
  const fields: FieldValues = {};
  fieldsFor(cat, roomCtx).forEach((f) => {
    if (f.default !== undefined) fields[f.k] = f.default;
  });
  computeDerived(cat, fields, roomCtx);
  return { sid, facing: null, photos: [], fields, prereq: {}, adjust: [] };
}

/* Value a select-type field shows when nothing has been picked yet — the registry's first option,
   matching the field app (so e.g. flooring's Skirting type reads "None" and its dependent rows
   stay hidden until the auditor changes it). */
function fieldValue(seg: Segment, f: { k: string; input?: string; opts?: string[] }): string {
  const v = seg.fields[f.k];
  if (v !== undefined && v !== null && v !== '') return String(v);
  if (f.input === 'select') return (f.opts && f.opts[0]) || '';
  return '';
}

const GROUP_LABEL_CLS = 'mt-2.5 text-[11px] font-extrabold uppercase tracking-wider text-gray-400';

/* Grouped measurement inputs for one segment. Derived fields are read-only and recomputed on
   every keystroke by the registry's own formulas — except a field with `editableIf` true for the
   current values (the manual "Custom" area mode), which renders as a plain input instead. */
function SegmentFields({
  cat,
  seg,
  room,
  onFields,
}: {
  cat: CategoryDef;
  seg: Segment;
  room: { v: number; variant: string | null };
  onFields: (next: FieldValues) => void;
}) {
  const visible = fieldsFor(cat, room).filter((f) => !f.showIf || f.showIf(seg.fields));
  const groups: { group: string; fields: typeof visible }[] = [];
  visible.forEach((f) => {
    const last = groups[groups.length - 1];
    if (last && last.group === f.group) last.fields.push(f);
    else groups.push({ group: f.group, fields: [f] });
  });

  const setField = (k: string, value: string) => {
    const next: FieldValues = { ...seg.fields, [k]: value };
    computeDerived(cat, next, room);
    onFields(next);
  };

  return (
    <>
      {groups.map((g) => (
        <div key={g.group}>
          <div className={GROUP_LABEL_CLS}>{g.group}</div>
          <div className="mt-1 grid grid-cols-2 gap-3">
            {g.fields.map((f) => {
              const overrideEditable = f.derived && f.editableIf && f.editableIf(seg.fields);
              return (
                <div key={f.k}>
                  <label className="text-xs text-gray-500">{f.label}</label>
                  {f.input === 'select' ? (
                    <select
                      value={fieldValue(seg, f)}
                      onChange={(e) => setField(f.k, e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                    >
                      {(f.opts ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : f.derived && !overrideEditable ? (
                    <input
                      value={fieldValue(seg, f)}
                      readOnly
                      className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-500"
                    />
                  ) : (
                    <input
                      inputMode={f.input === 'decimal' || overrideEditable ? 'decimal' : undefined}
                      value={fieldValue(seg, f)}
                      onChange={(e) => setField(f.k, e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </>
  );
}

/* Per-segment area adjustments: add/subtract a small area that belongs to THIS wall/floor rather
   than to a room of its own (a door to deduct, a niche to add), each with a shape (Rectangle/
   Triangle compute from dimensions; Other skips dimensions and takes a typed area directly), a
   reason and a photo. Dimensions are in the segment's own unit; the signed sq.ft total lands in
   fields.adjArea (maintained by the caller's recompute) and flows through net area -> wastage ->
   rolls, same mechanism as any other derived field. */
function SegmentAdjustments({
  cat,
  room,
  seg,
  onAdjust,
}: {
  cat: CategoryDef;
  room: { v: number; variant: string | null };
  seg: Segment;
  onAdjust: (next: AdjustRow[]) => void;
}) {
  const u = unitFor(cat, room);
  const segLabel = (cat.segment && cat.segment.segLabel) || 'segment';

  const patchRow = (i: number, patch: Partial<AdjustRow>) => {
    const next = seg.adjust.map((a, idx) => (idx === i ? { ...a, ...patch } : a));
    onAdjust(next);
  };
  const removeRow = (i: number) => onAdjust(seg.adjust.filter((_, idx) => idx !== i));
  const addRow = () =>
    onAdjust([...seg.adjust, { sign: '-', shape: 'Rectangle', h: '', w: '', area: '', reason: '', photos: [] }]);

  return (
    <div className="mt-2.5">
      <div className={GROUP_LABEL_CLS}>Area adjustments (optional)</div>
      <div className="mb-1 text-xs text-gray-400">
        Add or subtract a small area for this {segLabel.toLowerCase()} — e.g. subtract a door or window opening. Give a
        reason and a photo for each one.
      </div>
      {seg.adjust.map((a, i) => {
        const shape = a.shape || 'Rectangle';
        const isOther = shape === 'Other';
        const computedArea = isOther ? '' : adjSum(cat, room, [a]);
        const dim1 = shape === 'Triangle' ? 'Base' : 'Height';
        const dim2 = shape === 'Triangle' ? 'Height' : 'Width';
        const missingReason = !!(a.reason ? false : (isOther ? a.area : a.h && a.w));
        return (
          <div key={i} className="mt-2 rounded-lg border border-gray-200 bg-white p-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Add or subtract</label>
                <select
                  value={a.sign || '-'}
                  onChange={(e) => patchRow(i, { sign: e.target.value as '+' | '-' })}
                  className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                >
                  <option value="-">Subtract</option>
                  <option value="+">Add</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Shape</label>
                <select
                  value={shape}
                  onChange={(e) => {
                    const nextShape = e.target.value as AdjustRow['shape'];
                    patchRow(
                      i,
                      nextShape === 'Other' ? { shape: nextShape, h: '', w: '' } : { shape: nextShape, area: '' },
                    );
                  }}
                  className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                >
                  <option value="Rectangle">Rectangle</option>
                  <option value="Triangle">Triangle</option>
                  <option value="Other">Other (type area directly)</option>
                </select>
              </div>
              {isOther ? (
                <div className="col-span-2">
                  <label className="text-xs text-gray-500">Area (sq.ft)</label>
                  <input
                    inputMode="decimal"
                    value={a.area ?? ''}
                    onChange={(e) => patchRow(i, { area: e.target.value })}
                    className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="text-xs text-gray-500">
                      {dim1} ({u})
                    </label>
                    <input
                      inputMode="decimal"
                      value={a.h ?? ''}
                      onChange={(e) => patchRow(i, { h: e.target.value })}
                      className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">
                      {dim2} ({u})
                    </label>
                    <input
                      inputMode="decimal"
                      value={a.w ?? ''}
                      onChange={(e) => patchRow(i, { w: e.target.value })}
                      className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-gray-500">Area (sq.ft)</label>
                    <input
                      value={computedArea === '' ? '' : (computedArea > 0 ? '+' : '') + computedArea}
                      readOnly
                      className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-500"
                    />
                  </div>
                </>
              )}
              <div className="col-span-2">
                <label className="text-xs text-gray-500">Reason</label>
                <input
                  value={a.reason || ''}
                  onChange={(e) => patchRow(i, { reason: e.target.value })}
                  placeholder="e.g. Door opening"
                  className={cn(
                    'mt-1 w-full rounded-md border px-2 py-1.5 text-sm',
                    missingReason ? 'border-red-400' : 'border-gray-200',
                  )}
                />
              </div>
            </div>
            <div className="mt-2">
              <label className="text-xs text-gray-500">Photo</label>
              <SegmentPhotos
                photos={a.photos || []}
                label=""
                onAdd={(url) => patchRow(i, { photos: [...(a.photos || []), url] })}
                onSwap={(from, to) => patchRow(i, { photos: (a.photos || []).map((p) => (p === from ? to : p)) })}
                onRemoveAt={(idx) => patchRow(i, { photos: (a.photos || []).filter((_, pi2) => pi2 !== idx) })}
              />
            </div>
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="mt-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 hover:bg-red-100"
            >
              Remove adjustment
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addRow}
        className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100"
      >
        + Add adjustment
      </button>
    </div>
  );
}

/* Per-segment site-readiness checklist (OK / Not OK / N/A + optional note). A "Not OK" is a soft
   flag — it never blocks completion, it's recorded for the SM to review. */
function SegmentPrereqs({
  cat,
  seg,
  onPrereq,
}: {
  cat: CategoryDef;
  seg: Segment;
  onPrereq: (next: Record<string, PrereqEntry>) => void;
}) {
  if (!cat.prerequisites?.length) return null;
  const set = (k: string, patch: Partial<PrereqEntry>) => {
    const cur = seg.prereq[k] || { status: '', note: '' };
    onPrereq({ ...seg.prereq, [k]: { ...cur, ...patch } });
  };
  return (
    <div>
      <div className={GROUP_LABEL_CLS}>Site readiness checks</div>
      {cat.prerequisites.map((p) => {
        const cur = seg.prereq[p.k] || { status: '', note: '' };
        return (
          <div key={p.k} className="flex flex-col gap-1 border-b border-gray-100 py-1.5">
            <div className="text-[13px] text-gray-800">{p.label}</div>
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={cur.status || ''}
                onChange={(e) => set(p.k, { status: e.target.value })}
                className={cn(
                  'shrink-0 rounded-md border px-2 py-1 text-xs font-semibold',
                  cur.status === 'Not OK'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : cur.status === 'OK'
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-gray-200 bg-white text-gray-600',
                )}
              >
                <option value="">Set…</option>
                <option value="OK">OK</option>
                <option value="Not OK">Not OK</option>
                <option value="N/A">N/A</option>
              </select>
              <input
                value={cur.note || ''}
                onChange={(e) => set(p.k, { note: e.target.value })}
                placeholder="Note (optional)"
                className="min-w-[130px] flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---- room editor (rooms phase of the job card wizard) ---- */
function SegmentPhotos({
  photos,
  label,
  onAdd,
  onSwap,
  onRemoveAt,
}: {
  photos: string[];
  label: string;
  onAdd: (url: string) => void;
  onSwap: (from: string, to: string) => void;
  onRemoveAt: (idx: number) => void;
}) {
  const camInputRef = useRef<HTMLInputElement | null>(null);
  const galInputRef = useRef<HTMLInputElement | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Show the photo instantly (local base64), THEN upload to Storage in the background and swap the
  // URL in when it lands. Waiting on the upload first meant the thumbnail only appeared after up to
  // ~20s on a weak site connection, so auditors thought it hadn't attached and re-took it.
  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || !files.length) return;
      setUploading(true);
      for (const file of Array.from(files)) {
        const dataUrl: string = await new Promise((resolve) => {
          const rd = new FileReader();
          rd.onload = () => resolve(rd.result as string);
          rd.readAsDataURL(file);
        });
        const resized = (await resizeImageDataUrl(dataUrl, 1600, 0.88)) || dataUrl;
        onAdd(resized);
        uploadPhoto(resized)
          .then((url) => onSwap(resized, url))
          .catch(() => { /* keep the inline base64 — the draft/job card still carries the photo */ });
      }
      setUploading(false);
    },
    [onAdd, onSwap],
  );

  return (
    <div className="mt-2">
      <label className="text-xs text-gray-500">{label}</label>
      <div className="mt-2 flex flex-wrap gap-2">
        {photos.map((p, idx) => (
          <div key={idx} className="relative h-20 w-20 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p}
              alt=""
              className="h-20 w-20 cursor-pointer rounded-lg border border-gray-200 object-cover"
              onClick={() => window.open(p, '_blank')}
            />
            <button
              type="button"
              onClick={() => onRemoveAt(idx)}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold leading-none text-white"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <input
        ref={camInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={galInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => camInputRef.current?.click()}
          disabled={uploading}
          className="flex-1 rounded-md border border-gray-200 bg-white py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          📷 Camera
        </button>
        <button
          type="button"
          onClick={() => galInputRef.current?.click()}
          disabled={uploading}
          className="flex-1 rounded-md border border-gray-200 bg-white py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          🖼 Gallery
        </button>
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          disabled={uploading}
          className="flex-1 rounded-md border border-gray-200 bg-white py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          📄 Scan
        </button>
      </div>
      {uploading && <div className="mt-1.5 text-[11px] text-gray-400">Adding photo…</div>}
      {scannerOpen && (
        <DocScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} onScanned={(url) => onAdd(url)} />
      )}
    </div>
  );
}

function RoomEditor({
  room,
  index,
  onChange,
  onRemove,
}: {
  room: Room;
  index: number;
  onChange: (patch: RoomPatch) => void;
  onRemove: () => void;
}) {
  const cat = categoryFor(room.category);
  const multi = cat.segment.model === 'multi';
  const flagged = room.segments.some((s) => prereqFlagged(s));

  const patchSegment = useCallback(
    (sid: number, patch: Partial<Segment>) => {
      onChange((r) => ({ segments: r.segments.map((s) => (s.sid === sid ? { ...s, ...patch } : s)) }));
    },
    [onChange],
  );

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-bold text-gray-700">Room / Space {index + 1}</div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 hover:bg-red-100"
        >
          Remove
        </button>
      </div>

      <div>
        <label className="text-xs text-gray-500">Product category</label>
        <select
          value={room.category}
          onChange={(e) => {
            const category = e.target.value;
            onChange({
              category,
              v: ROOM_V,
              variant: null,
              segments: [blankSegment(category, 1, { v: ROOM_V, variant: null })],
              nextSid: 1,
            });
          }}
          className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
        >
          {CATEGORY_LIST.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-gray-500">Room name</label>
          <input
            value={room.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g. Master Bedroom"
            className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-yellow-400"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">SKU Code (write NA if none)</label>
          <input
            value={room.sku}
            onChange={(e) => onChange({ sku: e.target.value })}
            placeholder="e.g. WP-9020 / NA"
            className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-yellow-400"
          />
        </div>
      </div>

      {cat.variants && (
        <div className="mt-3">
          <label className="text-xs text-gray-500">{cat.label} type</label>
          <select
            value={room.variant || ''}
            onChange={(e) => {
              const prev = room.variant;
              const next = e.target.value || null;
              // The variant can decide the measurement UNIT (Standard wallpaper = ft, Customized =
              // mm), so switching it may need to clear already-typed measurements — silently
              // re-labelling 2800mm as 2800ft would put a ~300x wrong area on the job card.
              const unitFlips = unitFor(cat, { v: room.v, variant: prev }) !== unitFor(cat, { v: room.v, variant: next });
              const hasData = room.segments.some(
                (s) =>
                  ['height', 'width', 'length'].some((k) => String(s.fields?.[k] ?? '') !== '') ||
                  (s.fields?.areaMode === 'Custom' && String(s.fields.area ?? '') !== '') ||
                  (s.adjust || []).some(
                    (a) => String(a.h ?? '') !== '' || String(a.w ?? '') !== '' || String(a.area ?? '') !== '',
                  ),
              );
              if (
                prev &&
                next &&
                unitFlips &&
                hasData &&
                !window.confirm(
                  `Switching to ${next} changes the measurement unit from ${unitFor(cat, { v: room.v, variant: prev })} to ${unitFor(cat, { v: room.v, variant: next })}.\n\nThe measurements already entered will be cleared so they can be re-taken in the new unit. Continue?`,
                )
              ) {
                return;
              }
              if (prev && next && unitFlips) {
                onChange({
                  variant: next,
                  segments: room.segments.map((s) => {
                    // A Custom-mode area is a direct sq.ft entry with no unit of its own, so a unit
                    // flip doesn't make it wrong the way a height/width typed in the old unit would
                    // be — leave it in place.
                    const dropKeys =
                      s.fields?.areaMode === 'Custom'
                        ? ['height', 'width', 'length', 'adjArea', 'netArea', 'areaW', 'rolls']
                        : ['height', 'width', 'length', 'area', 'adjArea', 'netArea', 'areaW', 'rolls'];
                    const fields = { ...s.fields };
                    dropKeys.forEach((k) => delete fields[k]);
                    return { ...s, fields, adjust: [] };
                  }),
                });
              } else {
                onChange({ variant: next });
              }
            }}
            className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
          >
            <option value="">Select…</option>
            {cat.variants.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      )}

      {unitNoteFor(cat, room) && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-800">
          📏 {unitNoteFor(cat, room)}
        </div>
      )}

      {room.segments.map((seg, si) => (
        <div key={seg.sid} className="mt-3 rounded-xl border-[1.5px] border-gray-200 bg-[#fbfcfe] p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="text-sm font-extrabold text-[#1F3A5F]">
              {cat.segment.segLabel}
              {multi ? ` ${si + 1}` : ''}
            </div>
            {multi && (
              <button
                type="button"
                onClick={() => onChange((r) => ({ segments: r.segments.filter((s) => s.sid !== seg.sid) }))}
                className="shrink-0 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700 hover:bg-red-100"
              >
                Remove
              </button>
            )}
          </div>

          {cat.segment.facing && (
            <div>
              <label className="text-xs text-gray-500">Facing direction</label>
              <select
                value={seg.facing || ''}
                onChange={(e) => patchSegment(seg.sid, { facing: e.target.value || null })}
                className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
              >
                <option value="">Select…</option>
                {(cat.segment.facingOpts ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          )}

          {needsVariant(cat, room) ? (
            <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-800">
              {cat.variantPrompt || `Pick the ${cat.label} type above to enter measurements.`}
            </div>
          ) : (
            <>
              <SegmentFields
                cat={cat}
                seg={seg}
                room={room}
                onFields={(fields) => patchSegment(seg.sid, { fields })}
              />
              <SegmentAdjustments
                cat={cat}
                room={room}
                seg={seg}
                onAdjust={(nextAdjust) => {
                  const fields = { ...seg.fields, adjArea: adjSum(cat, room, nextAdjust) };
                  computeDerived(cat, fields, room);
                  patchSegment(seg.sid, { adjust: nextAdjust, fields });
                }}
              />
            </>
          )}

          <SegmentPhotos
            photos={seg.photos}
            label={multi ? `${cat.segment.segLabel} photos` : 'Photos'}
            onAdd={(url) =>
              onChange((r) => ({
                segments: r.segments.map((s) => (s.sid === seg.sid ? { ...s, photos: [...s.photos, url] } : s)),
              }))
            }
            onSwap={(from, to) =>
              onChange((r) => ({
                segments: r.segments.map((s) =>
                  s.sid === seg.sid ? { ...s, photos: s.photos.map((p) => (p === from ? to : p)) } : s,
                ),
              }))
            }
            onRemoveAt={(idx) =>
              onChange((r) => ({
                segments: r.segments.map((s) =>
                  s.sid === seg.sid ? { ...s, photos: s.photos.filter((_, i) => i !== idx) } : s,
                ),
              }))
            }
          />

          <SegmentPrereqs cat={cat} seg={seg} onPrereq={(prereq) => patchSegment(seg.sid, { prereq })} />
        </div>
      ))}

      {multi && (
        <button
          type="button"
          onClick={() =>
            onChange((r) => ({
              segments: [...r.segments, blankSegment(r.category, r.nextSid + 1, r)],
              nextSid: r.nextSid + 1,
            }))
          }
          className="mt-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          + {cat.segment.addLabel || 'Add'}
        </button>
      )}

      {flagged && (
        <div className="mt-2.5 rounded-lg bg-red-50 px-2.5 py-2 text-[12.5px] font-semibold text-red-800">
          One or more site-readiness checks are marked Not OK — recorded for the SM to review.
        </div>
      )}

      <div className="mt-3">
        <label className="text-xs text-gray-500">2D diagram (draw on the dotted sheet)</label>
        <SketchCanvas
          value={room.sketchStrokes}
          onChange={(strokes) => onChange({ sketchStrokes: strokes })}
          className="mt-1.5"
        />
        <div className="mt-1.5 flex gap-2">
          <button
            type="button"
            onClick={() => onChange((r) => ({ sketchStrokes: r.sketchStrokes.slice(0, -1) }))}
            className="rounded-md border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => onChange({ sketchStrokes: [] })}
            className="rounded-md border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="mt-3">
        <label className="text-xs text-gray-500">Room notes</label>
        <textarea
          value={room.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Access, special instructions…"
          className="mt-1.5 min-h-[70px] w-full resize-y rounded-md border border-gray-200 p-2 text-sm"
        />
      </div>
    </div>
  );
}

/* ---- room review card (review phase summary) ---- */
function RoomReviewCard({ room, index }: { room: Room; index: number }) {
  const cat = categoryFor(room.category);
  const multi = cat.segment.model === 'multi';
  const sketchImg = useMemo(() => renderSketchData(room.sketchStrokes), [room.sketchStrokes]);
  const segs = useMemo(
    () =>
      room.segments.map((s) => ({
        seg: s,
        rows: segmentRows(cat, { ...s, id: s.sid }, true, room),
        adj: adjRows(cat, room, s.adjust),
        prq: segmentPrereqRows(cat, { ...s, id: s.sid }),
        flagged: prereqFlagged(s),
      })),
    [room.segments, cat, room],
  );

  return (
    <div className="mb-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-[#1F3A5F] px-2.5 py-0.5 text-xs font-bold text-white">Room {index + 1}</span>
        <b className="text-[15px]">{room.name || '(unnamed)'}</b>
        <span className="rounded-md bg-yellow-100 px-2 py-0.5 text-[11px] font-bold text-yellow-800">
          {cat.pdfLabel}
          {room.variant ? ` · ${room.variant}` : ''}
        </span>
        {room.sku && <span className="text-[11.5px] text-gray-500">SKU: {room.sku}</span>}
      </div>

      {segs.map(({ seg, rows, adj, prq, flagged }, si) => (
        <div key={seg.sid} className="mt-2 rounded-lg border border-gray-200 p-2.5">
          {multi && (
            <div className="mb-1.5 text-[13px] font-extrabold text-[#1F3A5F]">
              {cat.segment.segLabel} {si + 1}
              {seg.facing ? ` — ${seg.facing}` : ''}
              {flagged && <span className="ml-1 text-red-600">⚠</span>}
            </div>
          )}
          {rows.length ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
                  <div className="text-[13px] text-gray-900">{value}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-400">No measurements recorded.</div>
          )}
          {adj.length > 0 && (
            <div className="mt-1.5 border-t border-dashed border-gray-200 pt-1.5">
              <div className="mb-0.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-400">
                Area adjustments
              </div>
              {adj.map((a, ai) => (
                <div key={ai} className="flex flex-wrap gap-2 text-[12.5px]">
                  <span className={cn('font-bold', a.neg ? 'text-red-600' : 'text-green-700')}>{a.area} sq.ft</span>
                  <span className="text-gray-400">
                    {a.label} {a.size}
                  </span>
                  <span>{a.reason || <i className="text-red-600">no reason given</i>}</span>
                  <span>
                    {a.photos.length ? (
                      `${a.photos.length} photo${a.photos.length > 1 ? 's' : ''}`
                    ) : (
                      <i className="text-red-600">no photo attached</i>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          {prq.length > 0 && (
            <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1">
              {prq.map(([label, status, note]) => (
                <div key={label} className="contents">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
                  <div
                    className={cn(
                      'text-[13px]',
                      status === 'Not OK' ? 'text-red-600' : status === 'OK' ? 'text-green-700' : 'text-gray-500',
                    )}
                  >
                    {status}
                    {note ? ` - ${note}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
          {seg.photos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {seg.photos.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={p} alt="" className="h-16 w-16 rounded-lg border border-gray-200 object-cover" />
              ))}
            </div>
          )}
        </div>
      ))}

      {sketchImg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sketchImg} alt="Room sketch" className="mt-2 w-full rounded-lg border border-gray-200" />
      )}
      {room.notes && (
        <div className="mt-2 border-l-2 border-gray-200 pl-2.5 text-[12.5px] text-gray-500">{room.notes}</div>
      )}
    </div>
  );
}


/* ---- job card wizard (rooms -> review -> pass-to-client -> terms -> ratings -> sign -> done) ---- */
type WizardPhase = 'rooms' | 'review' | 'pass' | 'terms' | 'sign' | 'done';

/* The order's first non-audit SKU picks the starting category, exactly like the field app; an SKU
   `type` the registry doesn't know falls back to flooring. */
function initialCategory(order: Order): string {
  const t = order.skus[0]?.type;
  return t && MD_CATEGORIES[t] ? t : 'flooring';
}

function makeRoom(id: number, category: string): Room {
  return {
    id,
    v: ROOM_V,
    category,
    name: '',
    sku: '',
    variant: null,
    notes: '',
    segments: [blankSegment(category, 1, { v: ROOM_V, variant: null })],
    nextSid: 1,
    sketchStrokes: [],
  };
}

/* Restores a saved room — either a v2 {segments} room or a legacy {type,calc,photos} one, which
   normalizeRoom folds into a single segment so it stays editable. A resumed v>=2 draft keeps its
   OWN v (a v2 wallpaper room was captured in mm whatever its variant — see auditRegistry's
   room.v>=3 gate); only a fresh/legacy room gets the current ROOM_V. */
function normalizeRestoredRoom(r: any, id: number): Room {
  const nr = normalizeRoom(r);
  const category = MD_CATEGORIES[nr.category] ? nr.category : 'flooring';
  const v = nr.v >= 2 ? nr.v : ROOM_V;
  let sid = 0;
  const segments: Segment[] = (nr.segments || []).map((s) => ({
    sid: ++sid,
    facing: s.facing || null,
    photos: (s.photos || []).slice(),
    fields: { ...(s.fields || {}) },
    prereq: { ...(s.prereq || {}) },
    adjust: ((s as any).adjust || []).map((a: AdjustRow) => ({ ...a, photos: (a.photos || []).slice() })),
  }));
  return {
    id,
    v,
    category,
    name: nr.name || '',
    sku: nr.sku || '',
    variant: nr.variant || null,
    notes: nr.notes || '',
    segments: segments.length ? segments : [blankSegment(category, 1, { v, variant: nr.variant || null })],
    nextSid: Math.max(sid, 1),
    sketchStrokes: (nr.sketchStrokes as SketchStroke[]) || [],
  };
}

function saveStatusDisplay(status: 'idle' | 'saving' | 'saved' | 'local'): { text: string; className: string } {
  if (status === 'saving') return { text: 'Saving…', className: 'text-amber-600' };
  if (status === 'saved') return { text: '✓ Saved', className: 'text-green-600' };
  if (status === 'local') return { text: '✓ Saved locally', className: 'text-gray-400' };
  return { text: '', className: 'text-gray-400' };
}

function JobCardWizard({
  order,
  actingAs,
  onBack,
  onCompleted,
  onDone,
  showToast,
  locationTracker,
}: {
  order: Order;
  actingAs: ActingAs;
  onBack: (draftRooms: Room[]) => void;
  onCompleted: (updatedOrder: Order) => void;
  onDone: () => void;
  showToast: (m: string) => void;
  locationTracker: LocationTracker;
}) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [phase, setPhase] = useState<WizardPhase>('rooms');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'local'>('idle');
  const [tcAgree, setTcAgree] = useState(false);
  const [signName, setSignName] = useState(order.name);
  const [completing, setCompleting] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const seqRef = useRef(0);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveSeqRef = useRef(0);
  const completionWriteRef = useRef<{ audit_ticked: any } | null>(null);
  const skipNextAutosave = useRef(true);
  const signPadRef = useRef<SignaturePadHandle>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      let restoredRooms: any[] | null = null;
      try {
        const raw = localStorage.getItem('md_audit_' + order.pi);
        if (raw) {
          const d = JSON.parse(raw);
          if (d?.rooms?.length) restoredRooms = d.rooms;
        }
      } catch {}
      if (!restoredRooms && !order.jobcard && order.id) {
        try {
          const r = await sbGet('audit_orders?id=eq.' + order.id + '&select=audit_ticked');
          if (Array.isArray(r) && r[0]?.audit_ticked && !Array.isArray(r[0].audit_ticked)) {
            const ticked = r[0].audit_ticked;
            if (ticked.rooms?.length) restoredRooms = ticked.rooms;
          }
        } catch {}
      }
      if (!restoredRooms && order.jobcard?.rooms?.length) restoredRooms = order.jobcard.rooms;
      if (!alive) return;
      if (restoredRooms && restoredRooms.length) {
        const withIds = restoredRooms.map((r) => normalizeRestoredRoom(r, ++seqRef.current));
        setRooms(withIds);
      } else {
        setRooms([makeRoom(++seqRef.current, initialCategory(order))]);
      }
      skipNextAutosave.current = true;
      setInitialized(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.pi]);

  useEffect(() => {
    if (!initialized) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    try {
      localStorage.setItem('md_audit_' + order.pi, JSON.stringify({ rooms: rooms.map(serializeRoom), ts: Date.now() }));
    } catch {}
    setSaveStatus('saving');
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    const mySeq = ++autosaveSeqRef.current;
    autosaveTimerRef.current = setTimeout(async () => {
      if (autosaveSeqRef.current !== mySeq) return;
      if (completionWriteRef.current) {
        setSaveStatus('saved');
        return;
      }
      if (!order.id) {
        setSaveStatus('local');
        return;
      }
      try {
        const draftRooms = draftPayload(rooms);
        if (autosaveSeqRef.current !== mySeq || completionWriteRef.current) return;
        await sbPatch('audit_orders', order.id, { audit_ticked: { draft: true, rooms: draftRooms } });
        if (completionWriteRef.current) {
          try {
            await sbPatchLong('audit_orders', order.id, completionWriteRef.current);
          } catch {}
        } else if (autosaveSeqRef.current === mySeq) {
          setSaveStatus('saved');
        }
      } catch {
        setSaveStatus('local');
      }
    }, 3000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, initialized]);

  useEffect(
    () => () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    },
    [],
  );

  // Unlike SiteInstallerApp (whose job-card state lives at the app root and
  // survives navigating back to the detail screen, so its 3s debounce just
  // keeps ticking in the background), this wizard unmounts on back — the
  // cleanup above kills the pending timer outright. Flush any pending write
  // immediately on back instead of waiting out the debounce, so edits made
  // in the last <3s aren't silently dropped (only the same-device localStorage
  // draft was protecting them before).
  const flushAutosave = useCallback(async () => {
    if (!autosaveTimerRef.current) return;
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
    if (completionWriteRef.current || !order.id) return;
    try {
      const draftRooms = draftPayload(rooms);
      await sbPatch('audit_orders', order.id, { audit_ticked: { draft: true, rooms: draftRooms } });
    } catch { /* best-effort — localStorage draft still covers this device */ }
  }, [rooms, order.id]);

  const addRoom = useCallback(() => {
    setRooms((prev) => [...prev, makeRoom(++seqRef.current, initialCategory(order))]);
  }, [order]);

  const removeRoom = useCallback((id: number) => {
    setRooms((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const updateRoom = useCallback((id: number, patch: RoomPatch) => {
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)));
  }, []);

  const saveStatusInfo = saveStatusDisplay(saveStatus);

  const handleFinish = useCallback(async () => {
    if (!signPadRef.current || signPadRef.current.isEmpty()) {
      showToast("Please capture the client's signature");
      return;
    }
    // Soft gate: a missing adjustment reason/photo, or a missing photo on a custom-measured
    // wall/floor, is never a hard block on a field auditor mid-visit — acknowledge once and the
    // job card records it as given (this repo's house style is soft-gate-and-surface, not
    // hard-blocking; see CLAUDE.md).
    const noReason = rooms.some((r) => {
      const cat = categoryFor(r.category);
      return r.segments.some((s) => adjMissingReason(cat, r, s.adjust));
    });
    const noAdjPhoto = rooms.some((r) => {
      const cat = categoryFor(r.category);
      return r.segments.some((s) => adjMissingPhoto(cat, r, s.adjust));
    });
    const noCustomPhoto = rooms.some((r) =>
      r.segments.some((s) => s.fields?.areaMode === 'Custom' && !(s.photos && s.photos.length)),
    );
    if (noReason || noAdjPhoto || noCustomPhoto) {
      const issues: string[] = [];
      if (noReason) issues.push('a reason for an area adjustment');
      if (noAdjPhoto) issues.push('a photo for an area adjustment');
      if (noCustomPhoto) issues.push('a photo for a custom-measured wall/floor');
      if (
        !window.confirm(
          `Missing: ${issues.join(', ')}.\n\nThese help the office understand what was measured/adjusted and why. Continue without them?`,
        )
      ) {
        return;
      }
    }
    setCompleting(true);
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    autosaveSeqRef.current++;

    const rawSignImg = signPadRef.current.export();
    let signImg = rawSignImg;
    try { signImg = await uploadPhoto(rawSignImg); } catch { /* keep raw captured data URL */ }
    const signData: SignData = { img: signImg, name: signName, tcCategories: [...new Set(rooms.map((r) => r.category))] };
    const finishedRooms = rooms.map(serializeRoom);
    const newLogEntry: LogEntry = {
      t: 'Site audit completed · JobCard signed',
      d: new Date().toISOString(),
      by: 'auto',
      who: actingAs.name,
    };
    const newLog = [...order.log, newLogEntry];
    const updatedOrder: Order = { ...order, status: 'completed', log: newLog, jobcard: { rooms: finishedRooms, sign: signData } };

    if (order.id) {
      try {
        await sbPatch('audit_orders', order.id, { status: 'completed', log: newLog });
        try {
          localStorage.removeItem('md_audit_ps_' + order.pi);
        } catch {}
        // The audit happened → confirm the OMS SERVICE leg, which is what raises its invoice.
        // Queues itself for retry on failure; a legacy-PO order has no leg and is skipped.
        try {
          const poRows = await sbGet('audit_orders?id=eq.' + order.id + '&select=po');
          const po = Array.isArray(poRows) && poRows[0] ? poRows[0].po : null;
          await confirmServicePerformed(po, 'Site audit completed by ' + actingAs.name);
        } catch {}
      } catch {
        showToast('Status not saved — will retry automatically');
        try {
          localStorage.setItem('md_audit_ps_' + order.pi, JSON.stringify({ id: order.id, log: newLog }));
        } catch {}
      }

      const ticked = {
        auditor: actingAs.name,
        date: dstr(todayMidnight()),
        sign: signData,
        rooms: finishedRooms,
      };
      completionWriteRef.current = { audit_ticked: ticked };
      try {
        await sbPatchLong('audit_orders', order.id, { audit_ticked: ticked });
        try {
          localStorage.removeItem('md_audit_' + order.pi);
        } catch {}
        try {
          localStorage.removeItem('md_audit_pjc_' + order.pi);
        } catch {}
      } catch {
        showToast('Job card save failed — will retry automatically on next open');
        try {
          localStorage.setItem('md_audit_pjc_' + order.pi, JSON.stringify({ id: order.id, ticked }));
        } catch {}
      }

    }

    locationTracker.stop();

    let url: string | null = null;
    try {
      url = await genPDF(updatedOrder, actingAs.name);
    } catch (e) {
      console.error('PDF error:', e);
    }
    setPdfUrl(url);
    setCompleting(false);
    setPhase('done');
    onCompleted(updatedOrder);
  }, [order, actingAs, rooms, signName, locationTracker, onCompleted, showToast]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => { flushAutosave(); onBack(rooms); }}
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
        >
          ←
        </button>
        <div>
          <div className="text-[15px] font-bold text-gray-900">Site Audit Job Card</div>
          <div className="text-[13px] text-gray-500">
            {order.pi} · {order.name}
          </div>
        </div>
        <div className={cn('ml-auto whitespace-nowrap text-[11px] font-bold', saveStatusInfo.className)}>{saveStatusInfo.text}</div>
      </div>

      {!initialized ? (
        <Spinner />
      ) : (
        <>
          {phase === 'rooms' && (
            <div>
              <JobDetailsHeader order={order} actingAs={actingAs} />
              <div className="my-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[12.5px] text-blue-900">
                Add a room for every space audited. Pick the product category — measurement fields and
                site-readiness checks adapt automatically.
              </div>
              {rooms.map((r, i) => (
                <RoomEditor key={r.id} room={r} index={i} onChange={(patch) => updateRoom(r.id, patch)} onRemove={() => removeRoom(r.id)} />
              ))}
            </div>
          )}

          {phase === 'review' && (
            <div>
              <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h2 className="mb-2 text-[15px] font-bold text-gray-900">Job summary</h2>
                <KV label="Client" value={order.name} />
                <KV label="PI No." value={order.pi} />
                <KV label="Address" value={order.addr} />
                <KV label="Auditor" value={actingAs.name} />
                <KV label="Date" value={fmtDateA(order.date)} />
                <KV label="Time slot" value={slotLabel(order.slot)} />
                <KV label="Rooms" value={String(rooms.length)} />
              </div>
              {rooms.map((r, i) => (
                <RoomReviewCard key={r.id} room={r} index={i} />
              ))}
              <div className="mb-6 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setPhase('rooms')}
                  className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
                >
                  ← Back to rooms
                </button>
                <button
                  type="button"
                  onClick={() => setPhase('pass')}
                  className="flex-1 rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:opacity-90"
                >
                  Proceed to client →
                </button>
              </div>
            </div>
          )}

          {phase === 'pass' && (
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-8 text-center">
              <div className="mb-4 text-5xl">📱</div>
              <div className="mb-2 text-xl font-bold text-gray-900">Please hand the phone to the client</div>
              <p className="mb-6 text-[13.5px] text-gray-500">The client will now complete the final steps:</p>
              <div className="mb-7 rounded-xl bg-gray-50 px-4 py-3.5 text-left text-[13.5px] leading-loose">
                <div>
                  <b>Step 1</b> &nbsp; Read &amp; agree to the Terms &amp; Conditions
                </div>
                <div>
                  <b>Step 2</b> &nbsp; Rate the service (3 questions)
                </div>
                <div>
                  <b>Step 3</b> &nbsp; Sign the job card
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPhase('terms')}
                className="w-full rounded-xl bg-green-600 py-3.5 text-[15px] font-bold text-white hover:opacity-90"
              >
                Client is ready →
              </button>
              <button
                type="button"
                onClick={() => setPhase('review')}
                className="mt-2.5 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                ← Back to job card
              </button>
            </div>
          )}

          {phase === 'terms' && (
            <div>
              <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4">
                <h2 className="mb-3 text-[15px] font-bold text-gray-900">Terms &amp; Conditions</h2>
                <div className="max-h-[200px] overflow-y-auto whitespace-pre-line rounded-lg border border-gray-200 p-3.5 text-[13px] leading-relaxed text-gray-800">
                  {buildAuditTC(mdInstallTermsBlock(rooms.map((r) => r.category)))}
                </div>
                <label className="mt-4 flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={tcAgree}
                    onChange={(e) => setTcAgree(e.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 accent-[#1F3A5F]"
                  />
                  <span className="text-[13.5px] font-semibold leading-tight">I have read and agree to the terms and conditions above</span>
                </label>
              </div>
              <div className="my-3.5 mb-6 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setPhase('pass')}
                  className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  disabled={!tcAgree}
                  onClick={() => setPhase('sign')}
                  className="flex-1 rounded-xl bg-[#1F3A5F] py-3 text-sm font-bold text-white disabled:opacity-40"
                >
                  Agree &amp; proceed →
                </button>
              </div>
            </div>
          )}

          {phase === 'sign' && (
            <div>
              <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4">
                <h2 className="mb-2 text-[15px] font-bold text-gray-900">Summary</h2>
                <KV label="Client" value={order.name} />
                <KV label="PI" value={order.pi} />
                <KV label="Rooms" value={String(rooms.length)} />
                <div className="mt-2.5 space-y-1.5">
                  {rooms.map((r, i) => (
                    <div key={r.id} className="flex text-[13px]">
                      <span className="w-20 shrink-0 text-gray-400">Room {i + 1}</span>
                      <span>
                        {r.name || '(unnamed)'} · {categoryFor(r.category).pdfLabel}
                        {r.variant ? ` (${r.variant})` : ''} · SKU {r.sku || 'NA'}
                        {categoryFor(r.category).segment.model === 'multi'
                          ? ` · ${r.segments.length} ${categoryFor(r.category).segment.segLabel.toLowerCase()}${r.segments.length === 1 ? '' : 's'}`
                          : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4">
                <h2 className="mb-2 text-[15px] font-bold text-gray-900">Client consent &amp; signature</h2>
                <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-[12.5px] text-gray-600">
                  By signing, the client confirms the site audit was carried out and the captured details are correct.
                </div>
                <label className="text-[13px] font-semibold text-gray-700">Client signature</label>
                <SignaturePad ref={signPadRef} className="mt-1.5" />
                <button
                  type="button"
                  onClick={() => signPadRef.current?.clear()}
                  className="mt-1.5 rounded-md border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Clear signature
                </button>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500">Client name (confirming)</label>
                    <input
                      value={signName}
                      onChange={(e) => setSignName(e.target.value)}
                      className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Date</label>
                    <input
                      value={fmtDateA(order.date)}
                      disabled
                      className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-500"
                    />
                  </div>
                </div>
              </div>
              <div className="my-3.5 mb-6 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setPhase('terms')}
                  className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  disabled={completing}
                  onClick={handleFinish}
                  className="flex-1 rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {completing ? 'Saving…' : 'Generate PDF & complete'}
                </button>
              </div>
            </div>
          )}

          {phase === 'done' && (
            <div className="mt-3 rounded-lg border border-gray-200 bg-white p-7 text-center">
              <div className="mb-3 text-5xl">✅</div>
              <div className="mb-1.5 text-xl font-bold text-green-600">Audit Complete!</div>
              <div className="mb-5 text-[13.5px] text-gray-500">Saved &amp; SM notified.</div>
              {pdfUrl ? (
                <>
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={pdfFileName(order)}
                    className="mb-2 block rounded-xl bg-green-600 py-4 text-[16px] font-bold text-white hover:opacity-90"
                  >
                    📥 Open Job Card PDF
                  </a>
                  <div className="mb-5 text-[11.5px] text-gray-400">iPhone: tap to view → use the share icon to save to Files</div>
                </>
              ) : (
                <div className="mb-5 rounded-lg bg-gray-50 p-3 text-left text-[13px] text-gray-600">
                  PDF could not be generated on this device. Download it from the order screen later.
                </div>
              )}
              <button
                type="button"
                onClick={onDone}
                className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                Done — Back to Orders
              </button>
            </div>
          )}
        </>
      )}

      {initialized && phase === 'rooms' && (
        <div className="sticky bottom-0 mt-4 flex gap-2.5 border-t border-gray-200 bg-white/95 py-3 backdrop-blur">
          <button
            type="button"
            onClick={addRoom}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            + Add room
          </button>
          <button
            type="button"
            onClick={() => {
              if (rooms.length === 0) {
                showToast('Add at least one room');
                return;
              }
              setPhase('review');
            }}
            className="flex-1 rounded-xl bg-[#1F3A5F] py-3 text-sm font-bold text-white hover:opacity-90"
          >
            Review &amp; sign
          </button>
        </div>
      )}
    </div>
  );
}

type Screen = { name: 'list' } | { name: 'detail'; pi: string } | { name: 'jobcard'; pi: string };

export default function SiteAuditorApp({ actingAs }: { actingAs: ActingAs }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [selDay, setSelDay] = useState<string>(() => dstr(todayMidnight()));
  const [screen, setScreen] = useState<Screen>({ name: 'list' });
  const [toast, setToast] = useState<string | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ordersRef = useRef<Order[]>([]);
  ordersRef.current = orders;
  const today = useMemo(() => todayMidnight(), []);
  const locationTracker = useLocationTracking(actingAs.email);

  const showToast = useCallback((m: string) => {
    setToast(m);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const refreshJobs = useCallback(async () => {
    const next = await loadJobs(actingAs.email, ordersRef.current);
    ordersRef.current = next;
    setOrders(next);
  }, [actingAs.email]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      await refreshJobs();
      if (alive) setLoading(false);
    })();
    locationTracker.start(null);
    const pollTimer = setInterval(() => {
      if (!document.hidden) refreshJobs();
    }, 30000);
    const onVis = () => {
      if (!document.hidden) refreshJobs();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onVis);
      locationTracker.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actingAs.email]);

  const updateOrder = useCallback((pi: string, updater: Partial<Order> | ((o: Order) => Order)) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.pi !== pi) return o;
        return typeof updater === 'function' ? updater(o) : { ...o, ...updater };
      }),
    );
  }, []);

  const curOrder = screen.name !== 'list' ? orders.find((o) => o.pi === screen.pi) || null : null;

  return (
    <div className="mx-auto max-w-3xl px-3 py-4 sm:px-0">
      {screen.name === 'list' && (
        <>
          <div className="mb-4">
            <h1 className="text-xl font-bold text-gray-900">Site Auditor</h1>
          </div>
          {loading ? (
            <Spinner />
          ) : (
            <JobListView orders={orders} selDay={selDay} onSelectDay={setSelDay} today={today} onOpenJob={(pi) => setScreen({ name: 'detail', pi })} />
          )}
        </>
      )}

      {screen.name === 'detail' &&
        (curOrder ? (
          <JobDetailView
            order={curOrder}
            actingAs={actingAs}
            onBack={() => setScreen({ name: 'list' })}
            onOpenJobCard={() => setScreen({ name: 'jobcard', pi: curOrder.pi })}
            onUpdateOrder={(updater) => updateOrder(curOrder.pi, updater)}
            showToast={showToast}
            locationTracker={locationTracker}
            refreshJobs={refreshJobs}
          />
        ) : (
          <NotFoundScreen onBack={() => setScreen({ name: 'list' })} />
        ))}

      {screen.name === 'jobcard' &&
        (curOrder ? (
          <JobCardWizard
            key={curOrder.pi}
            order={curOrder}
            actingAs={actingAs}
            onBack={(draftRooms) => {
              updateOrder(curOrder.pi, (o) => ({ ...o, jobcard: { rooms: draftRooms.map(serializeRoom) } }));
              setScreen({ name: 'detail', pi: curOrder.pi });
            }}
            onCompleted={(updatedOrder) => updateOrder(curOrder.pi, () => updatedOrder)}
            onDone={async () => {
              setScreen({ name: 'list' });
              await refreshJobs();
            }}
            showToast={showToast}
            locationTracker={locationTracker}
          />
        ) : (
          <NotFoundScreen onBack={() => setScreen({ name: 'list' })} />
        ))}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[400] -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

function NotFoundScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
      <div className="mb-3 text-2xl">🔍</div>
      <div className="mb-4 text-sm text-gray-500">This job could not be found — it may have been reassigned or removed.</div>
      <button
        type="button"
        onClick={onBack}
        className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-50"
      >
        ← Back to jobs
      </button>
    </div>
  );
}
