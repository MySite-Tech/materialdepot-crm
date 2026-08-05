'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { cn } from '@/lib/utils';
import { sbGet, sbPost, sbPatch, sbPatchLong, uploadPhoto, fmtDateA } from '@/components/site-audit/siteAuditShared';
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

type Room = {
  id: number;
  type: 'flooring' | 'wallpaper';
  name: string;
  sku: string;
  photos: string[];
  calc: Record<string, string>;
  notes: string;
  sketchStrokes: SketchStroke[];
};

type SignData = {
  img: string;
  name: string;
  ratings: { q1: number; q2: number; q3: number; comments: string };
};

type JobCard = { rooms: Room[]; sign?: SignData | null };

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

const DEFAULT_LOG_TEXT: Record<string, string> = {
  callpending: 'Pre-visit call started',
  onway: 'Auditor on the way · customer confirmed',
  reschedule: 'Customer declined → sent to SM to reschedule',
  atsite: 'Auditor arrived at site',
  completed: 'Site audit completed',
};

type FieldDef = { k: string; label: string; ph?: string; type?: 'select'; opts?: readonly string[] };

const FLOOR_FIELDS: FieldDef[] = [
  { k: 'area', label: 'Area (sq.ft)', ph: 'e.g. 180' },
  { k: 'boxes', label: 'Boxes' },
  { k: 'skirt', label: 'Skirting (nos)' },
  { k: 'skirtH', label: 'Skirting height (mm)' },
  { k: 'lprof', label: 'L-profile (nos)' },
  { k: 'rprof', label: 'R-profile / Reducer (nos)' },
  { k: 'tprof', label: 'T-profile (nos)' },
  { k: 'corner', label: 'Corner beading (nos)' },
];

const WALL_FIELDS: FieldDef[] = [
  { k: 'warea', label: 'Wall area (sq.ft)' },
  { k: 'rolls', label: 'No. of rolls' },
  { k: 'repeat', label: 'Pattern repeat (mm)' },
  { k: 'match', label: 'Match type', type: 'select', opts: ['Straight', 'Offset', 'Free'] },
  { k: 'adh', label: 'Adhesive (packs)' },
  { k: 'primer', label: 'Primer needed', type: 'select', opts: ['No', 'Yes'] },
];

function fieldsFor(t: string): FieldDef[] {
  return t === 'wallpaper' ? WALL_FIELDS : FLOOR_FIELDS;
}

const MD_TC = `Material Depot — Client Acknowledgement

By ticking the box and signing below, I confirm that:

• The site visit described in this job card was carried out to my satisfaction.
• The details, measurements and room information recorded are accurate and correct.
• I am satisfied with the service provided by the Material Depot team.
• I consent to being contacted for quality feedback purposes if required.

[Full terms and conditions will be provided by Material Depot]`;

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
        '&status=neq.deleted&order=created_at.desc',
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
      status: r.status === 'assigned' ? 'scheduled' : r.status,
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
  const doc: any = new jsPDF('p', 'pt', 'a4');
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
  let y = M;
  const navy: [number, number, number] = [31, 58, 95];
  const blue: [number, number, number] = [46, 108, 168];
  const muted: [number, number, number] = [90, 100, 120];
  const rooms = order.jobcard?.rooms || [];

  function header() {
    doc.setFillColor(...navy);
    doc.rect(M, y, 34, 34, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('MD', M + 9, y + 22);
    doc.setFontSize(10);
    doc.setTextColor(...blue);
    doc.text('MATERIAL DEPOT', M + 44, y + 13);
    doc.setFontSize(15);
    doc.setTextColor(...navy);
    doc.text('Site Audit Job Card', M + 44, y + 30);
    y += 46;
    doc.setDrawColor(...navy);
    doc.setLineWidth(1.2);
    doc.line(M, y, W - M, y);
    y += 14;
  }
  header();
  doc.autoTable({
    startY: y,
    margin: { left: M, right: M },
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 5, lineColor: [210, 216, 225] },
    columnStyles: { 0: { cellWidth: 130, fontStyle: 'bold', textColor: navy, fillColor: [238, 243, 249] } },
    body: [
      ['Proforma Invoice No.', order.pi],
      ['Client Name', order.name],
      ['Client Mobile', order.phone],
      ['Site Address', order.addr],
      ['BM', order.bm],
      ['Auditor', auditorName],
      ['Date', fmtDateA(order.date)],
    ],
  });
  y = doc.lastAutoTable.finalY + 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...navy);
  doc.text('Rooms summary', M, y + 4);
  y += 10;
  doc.autoTable({
    startY: y,
    margin: { left: M, right: M },
    theme: 'grid',
    headStyles: { fillColor: navy, fontSize: 8.5 },
    styles: { fontSize: 8.5, cellPadding: 4, lineColor: [210, 216, 225] },
    head: [['#', 'Room', 'Type', 'SKU No.']],
    body: rooms.map((r, i) => [String(i + 1), r.name || '-', r.type === 'wallpaper' ? 'Wallpaper' : 'Flooring', r.sku || 'NA']),
  });

  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    doc.addPage();
    y = M;
    header();
    const fields = fieldsFor(r.type);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...navy);
    doc.text('Room ' + (i + 1) + ': ' + (r.name || '-'), M, y + 2);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...muted);
    doc.text((r.type === 'wallpaper' ? 'Wallpaper' : 'Wooden Flooring') + '  ·  SKU: ' + (r.sku || 'NA'), M, y + 10);
    y += 24;
    doc.autoTable({
      startY: y,
      margin: { left: M, right: M },
      theme: 'grid',
      headStyles: { fillColor: navy, fontSize: 9 },
      styles: { fontSize: 9, cellPadding: 5, lineColor: [210, 216, 225] },
      columnStyles: { 0: { cellWidth: 230, fontStyle: 'bold', textColor: navy, fillColor: [238, 243, 249] } },
      head: [['Calculation', 'Value']],
      body: fields.map((f) => [f.label, r.calc[f.k] || '']),
    });
    y = doc.lastAutoTable.finalY + 12;
    const colW = (W - 2 * M - 12) / 2, ih = colW * 0.78;
    const sketchImg = renderSketchData(r.sketchStrokes);
    const rPhotos = r.photos || [];
    if (sketchImg) {
      doc.setFontSize(8.5);
      doc.setTextColor(...muted);
      doc.text('2D Diagram', M, y);
      try {
        doc.addImage(sketchImg, 'JPEG', M, y + 6, colW, ih);
      } catch {}
    }
    if (rPhotos.length) {
      const photo = await compressImageDataUrl(rPhotos[0]);
      if (photo) {
        const px = M + (sketchImg ? colW + 12 : 0);
        doc.setFontSize(8.5);
        doc.setTextColor(...muted);
        doc.text('Room Photo', px, y);
        try {
          doc.addImage(photo, 'JPEG', px, y + 6, colW, ih);
        } catch {}
      }
    }
    y += ih + 18;
    for (let pi = 1; pi < rPhotos.length; pi++) {
      const xp = await compressImageDataUrl(rPhotos[pi]);
      if (xp) {
        if (y + colW * 0.78 + 20 > H - M) {
          doc.addPage();
          y = M;
          header();
        }
        doc.setFontSize(8.5);
        doc.setTextColor(...muted);
        doc.text('Room Photo ' + (pi + 1), M, y);
        const xw = W - 2 * M, xh = xw * 0.6;
        try {
          doc.addImage(xp, 'JPEG', M, y + 6, xw, xh);
        } catch {}
        y += xh + 18;
      }
    }
    if (r.notes) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(...navy);
      doc.text('Notes', M, y);
      y += 12;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(40, 40, 40);
      const ls = doc.splitTextToSize(r.notes, W - 2 * M);
      doc.text(ls, M, y);
    }
  }

  doc.addPage();
  y = M;
  header();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...navy);
  doc.text('Client Acknowledgement', M, y + 4);
  y += 26;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(40, 40, 40);
  const consent =
    'I confirm that the site audit for the above order has been carried out by the Material Depot auditor, that the rooms, measurements and details recorded in this Job Card are correct, and that I am satisfied with the service provided.';
  doc.text(doc.splitTextToSize(consent, W - 2 * M), M, y);
  y += 58;
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
  doc.setFontSize(10);
  doc.setTextColor(...muted);
  doc.text('Client name: ' + (order.jobcard?.sign?.name || order.name), M, y);
  y += 18;
  doc.text('Date: ' + fmtDateA(order.date), M, y);
  const sigW = 200, sigH = 80, sx = W - M - sigW, sy = H - M - sigH - 24;
  if (order.jobcard?.sign?.img) {
    const sigImg = await compressImageDataUrl(order.jobcard.sign.img);
    if (sigImg) {
      try {
        doc.addImage(sigImg, 'JPEG', sx, sy - 10, sigW, sigH);
      } catch {}
    }
  }
  doc.setDrawColor(...muted);
  doc.setLineWidth(0.8);
  doc.line(sx, sy + sigH - 6, sx + sigW, sy + sigH - 6);
  doc.setFontSize(9.5);
  doc.setTextColor(...muted);
  doc.text('Client signature', sx, sy + sigH + 10);
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

function StarRow({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className={cn(
            'h-8 w-8 rounded-md border text-xs font-bold',
            value === n ? 'border-[#EAB308] bg-[#EAB308] text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50',
          )}
        >
          {n}
        </button>
      ))}
    </div>
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
  onCancel,
  onConfirm,
}: {
  showToast: (m: string) => void;
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
          className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            if (!reason.trim()) {
              showToast('Please enter a reason for rescheduling');
              return;
            }
            onConfirm(reason.trim(), followUp.trim());
          }}
          className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-bold text-white hover:opacity-90"
        >
          Confirm Reschedule
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
    async (st: string, toastMsg: string, logOverride?: string | null, extraLog?: LogExtra) => {
      if (advBusy) return;
      setAdvBusy(true);
      try {
        const logText = logOverride || DEFAULT_LOG_TEXT[st] || st;
        const entry: LogEntry = { t: logText, d: new Date().toISOString(), by: 'auto', who: actingAs.name, ...extraLog };
        const dbStatus = st === 'scheduled' ? 'assigned' : st;
        let newLog = [...order.log, entry];
        if (order.id) {
          try {
            const rows = await sbGet('audit_orders?id=eq.' + order.id + '&select=log');
            const freshLog: LogEntry[] = Array.isArray(rows) && rows[0] && Array.isArray(rows[0].log) ? rows[0].log : order.log;
            newLog = [...freshLog, entry];
            await sbPatch('audit_orders', order.id, { status: dbStatus, log: newLog });
          } catch {
            showToast('Network error — try again');
            return;
          }
        }
        if (st === 'atsite') locationTracker.start(order.pi);
        else if (st === 'completed' || st === 'reschedule') locationTracker.stop();
        onUpdateOrder((o) => ({ ...o, status: st, log: newLog }));
        await refreshJobs();
        showToast(toastMsg);
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
          onCancel={() => setReschedOpen(false)}
          onConfirm={async (reason, followUp) => {
            const logMsg = 'Reschedule requested: ' + reason + (followUp ? ` · Follow-up: ${followUp}` : '');
            setReschedOpen(false);
            await adv('reschedule', 'Sent to SM to reschedule', logMsg);
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

/* ---- room editor (rooms phase of the job card wizard) ---- */
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
  const camInputRef = useRef<HTMLInputElement | null>(null);
  const galInputRef = useRef<HTMLInputElement | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

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
        const resized = await resizeImageDataUrl(dataUrl, 1600, 0.88);
        let url = resized || dataUrl;
        if (resized) {
          try {
            url = await uploadPhoto(resized);
          } catch {
            url = resized;
          }
        }
        const finalUrl = url;
        onChange((r) => ({ photos: [...r.photos, finalUrl] }));
      }
      setUploading(false);
    },
    [onChange],
  );

  const fields = fieldsFor(room.type);

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

      <div className="mb-3 inline-flex overflow-hidden rounded-lg border border-gray-200">
        <button
          type="button"
          onClick={() => onChange({ type: 'flooring', calc: {} })}
          className={cn('px-3 py-1.5 text-xs font-semibold', room.type === 'flooring' ? 'bg-[#1F3A5F] text-white' : 'bg-white text-gray-600')}
        >
          Wooden Flooring
        </button>
        <button
          type="button"
          onClick={() => onChange({ type: 'wallpaper', calc: {} })}
          className={cn('px-3 py-1.5 text-xs font-semibold', room.type === 'wallpaper' ? 'bg-[#1F3A5F] text-white' : 'bg-white text-gray-600')}
        >
          Wallpaper
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

      <div className="mt-3">
        <label className="text-xs text-gray-500">Room photos</label>
        <div className="mt-2 flex flex-wrap gap-2">
          {room.photos.map((p, idx) => (
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
                onClick={() => onChange((r) => ({ photos: r.photos.filter((_, i) => i !== idx) }))}
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
        {uploading && <div className="mt-1.5 text-[11px] text-gray-400">Uploading…</div>}
      </div>

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
        <label className="text-xs text-gray-500">Calculations</label>
        <div className="mt-1.5 grid grid-cols-2 gap-3">
          {fields.map((f) => (
            <div key={f.k}>
              <label className="text-xs text-gray-500">{f.label}</label>
              {f.type === 'select' ? (
                <select
                  value={room.calc[f.k] ?? ''}
                  onChange={(e) => onChange((r) => ({ calc: { ...r.calc, [f.k]: e.target.value } }))}
                  className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                >
                  <option value="" disabled hidden />
                  {(f.opts ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  inputMode="decimal"
                  placeholder={f.ph}
                  value={room.calc[f.k] || ''}
                  onChange={(e) => onChange((r) => ({ calc: { ...r.calc, [f.k]: e.target.value } }))}
                  className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <label className="text-xs text-gray-500">Notes</label>
        <textarea
          value={room.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Site notes, access, special instructions…"
          className="mt-1.5 min-h-[70px] w-full resize-y rounded-md border border-gray-200 p-2 text-sm"
        />
      </div>

      {scannerOpen && (
        <DocScannerModal
          open={scannerOpen}
          onClose={() => setScannerOpen(false)}
          onScanned={(url) => onChange((r) => ({ photos: [...r.photos, url] }))}
        />
      )}
    </div>
  );
}

/* ---- room review card (review phase summary) ---- */
function RoomReviewCard({ room, index }: { room: Room; index: number }) {
  const fields = fieldsFor(room.type).filter((f) => room.calc[f.k]);
  const sketchImg = useMemo(() => renderSketchData(room.sketchStrokes), [room.sketchStrokes]);
  return (
    <div className="mb-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-[#1F3A5F] px-2.5 py-0.5 text-xs font-bold text-white">Room {index + 1}</span>
        <b className="text-[15px]">{room.name || '(unnamed)'}</b>
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-[11px] font-bold',
            room.type === 'wallpaper' ? 'bg-purple-100 text-purple-700' : 'bg-yellow-100 text-yellow-800',
          )}
        >
          {room.type === 'wallpaper' ? 'Wallpaper' : 'Flooring'}
        </span>
        {room.sku && <span className="text-[11.5px] text-gray-500">SKU: {room.sku}</span>}
      </div>
      {fields.length ? (
        <div className="mb-2.5 grid grid-cols-2 gap-x-4 gap-y-1">
          {fields.map((f) => (
            <div key={f.k} className="contents">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{f.label}</div>
              <div className="text-[13px] text-gray-900">{room.calc[f.k]}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mb-2.5 text-xs text-gray-400">No measurements recorded.</div>
      )}
      {sketchImg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sketchImg} alt="Room sketch" className="mb-2 w-full rounded-lg border border-gray-200" />
      )}
      {room.photos.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {room.photos.map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={i} src={p} alt="" className="h-[72px] w-[72px] rounded-lg border border-gray-200 object-cover" />
          ))}
        </div>
      )}
      {room.notes && <div className="border-l-2 border-gray-200 pl-2.5 text-[12.5px] text-gray-500">{room.notes}</div>}
    </div>
  );
}

/* ---- job card wizard (rooms -> review -> pass-to-client -> terms -> ratings -> sign -> done) ---- */
type WizardPhase = 'rooms' | 'review' | 'pass' | 'terms' | 'ratings' | 'sign' | 'done';

function makeRoom(id: number, type: 'flooring' | 'wallpaper'): Room {
  return { id, type, name: '', sku: '', photos: [], calc: {}, notes: '', sketchStrokes: [] };
}

function normalizeRestoredRoom(r: any, id: number): Room {
  return {
    id,
    type: r.type === 'wallpaper' ? 'wallpaper' : 'flooring',
    name: r.name || '',
    sku: r.sku || '',
    photos: r.photos || (r.photo ? [r.photo] : []),
    calc: { ...(r.calc || {}) },
    notes: r.notes || '',
    sketchStrokes: r.sketchStrokes || [],
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
  const [ratings, setRatings] = useState({ q1: 0, q2: 0, q3: 0, comments: '' });
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
        const firstType: 'flooring' | 'wallpaper' = order.skus[0]?.type === 'wallpaper' ? 'wallpaper' : 'flooring';
        setRooms([makeRoom(++seqRef.current, firstType)]);
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
      localStorage.setItem('md_audit_' + order.pi, JSON.stringify({ rooms, ts: Date.now() }));
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
        const draftRooms = rooms.map(({ photos, ...rest }) => rest);
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
      const draftRooms = rooms.map(({ photos, ...rest }) => rest);
      await sbPatch('audit_orders', order.id, { audit_ticked: { draft: true, rooms: draftRooms } });
    } catch { /* best-effort — localStorage draft still covers this device */ }
  }, [rooms, order.id]);

  const addRoom = useCallback(() => {
    const firstType: 'flooring' | 'wallpaper' = order.skus[0]?.type === 'wallpaper' ? 'wallpaper' : 'flooring';
    setRooms((prev) => [...prev, makeRoom(++seqRef.current, firstType)]);
  }, [order.skus]);

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
    setCompleting(true);
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    autosaveSeqRef.current++;

    const rawSignImg = signPadRef.current.export();
    let signImg = rawSignImg;
    try { signImg = await uploadPhoto(rawSignImg); } catch { /* keep raw captured data URL */ }
    const signData: SignData = { img: signImg, name: signName, ratings };
    const finishedRooms = rooms.map((r) => ({ ...r }));
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
        rooms: finishedRooms.map((r) => ({
          name: r.name,
          type: r.type,
          sku: r.sku,
          calc: r.calc || {},
          notes: r.notes || '',
          photos: r.photos || [],
          sketchStrokes: r.sketchStrokes || [],
        })),
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

      try {
        await sbPost('ratings', {
          order_type: 'audit',
          pi: order.pi,
          order_id: order.id,
          staff_email: actingAs.email,
          staff_name: actingAs.name,
          q1_score: ratings.q1,
          q2_score: ratings.q2,
          q3_score: ratings.q3,
          comments: ratings.comments || '',
          customer_name: order.name,
          customer_phone: order.phone,
        });
      } catch {
        try {
          await sbPost('ratings', {
            order_type: 'audit',
            pi: order.pi,
            order_id: order.id,
            staff_email: actingAs.email,
            staff_name: actingAs.name,
            q1_score: ratings.q1,
            q2_score: ratings.q2,
            comments: ratings.comments || '',
            customer_name: order.name,
            customer_phone: order.phone,
          });
        } catch (e2) {
          console.error('ratings write failed', e2);
        }
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
  }, [order, actingAs, ratings, rooms, signName, locationTracker, onCompleted, showToast]);

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
                Add a room for every space audited. Pick the room type — calculation fields match Flooring or Wallpaper.
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
                  {MD_TC}
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
                  onClick={() => setPhase('ratings')}
                  className="flex-1 rounded-xl bg-[#1F3A5F] py-3 text-sm font-bold text-white disabled:opacity-40"
                >
                  Agree &amp; proceed →
                </button>
              </div>
            </div>
          )}

          {phase === 'ratings' && (
            <div>
              <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4">
                <h2 className="mb-3.5 text-[15px] font-bold text-gray-900">Client feedback</h2>
                <p className="mb-4.5 text-[13.5px] text-gray-500">
                  Please rate your experience. Tap a number from 1 (lowest) to 10 (highest).
                </p>
                <div className="mb-4.5">
                  <label className="text-sm font-bold text-gray-800">1. How would you rate the overall Site Audit experience?</label>
                  <StarRow value={ratings.q1} onChange={(n) => setRatings((r) => ({ ...r, q1: n }))} />
                </div>
                <div className="mb-4.5">
                  <label className="text-sm font-bold text-gray-800">2. How would you rate your site auditor and their behaviour?</label>
                  <StarRow value={ratings.q2} onChange={(n) => setRatings((r) => ({ ...r, q2: n }))} />
                </div>
                <div className="mb-4.5">
                  <label className="text-sm font-bold text-gray-800">3. How clean did the site auditor leave the site after the audit?</label>
                  <StarRow value={ratings.q3} onChange={(n) => setRatings((r) => ({ ...r, q3: n }))} />
                </div>
                <div>
                  <label className="text-sm font-bold text-gray-800">
                    Comments <span className="font-medium text-gray-400">(optional)</span>
                  </label>
                  <textarea
                    value={ratings.comments}
                    onChange={(e) => setRatings((r) => ({ ...r, comments: e.target.value }))}
                    placeholder="Any feedback or comments…"
                    className="mt-2 min-h-[80px] w-full resize-y rounded-lg border border-gray-200 p-2.5 text-[13.5px]"
                  />
                </div>
              </div>
              <div className="my-3.5 mb-6 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setPhase('terms')}
                  className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
                >
                  ← Back to terms
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!ratings.q1) {
                      showToast('Please rate the overall experience');
                      return;
                    }
                    if (!ratings.q2) {
                      showToast('Please rate the site auditor');
                      return;
                    }
                    if (!ratings.q3) {
                      showToast('Please rate the site cleanliness');
                      return;
                    }
                    setPhase('sign');
                  }}
                  className="flex-1 rounded-xl bg-[#1F3A5F] py-3 text-sm font-bold text-white hover:opacity-90"
                >
                  Next: Signature →
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
                        {r.name || '(unnamed)'} · {r.type === 'wallpaper' ? 'Wallpaper' : 'Flooring'} · SKU {r.sku || 'NA'}
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
                  onClick={() => setPhase('ratings')}
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
            <p className="mt-0.5 text-[13px] text-gray-400">Signed in as {actingAs.name}</p>
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
              updateOrder(curOrder.pi, (o) => ({ ...o, jobcard: { rooms: draftRooms } }));
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
