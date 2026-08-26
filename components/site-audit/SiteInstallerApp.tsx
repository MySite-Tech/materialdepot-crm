'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { jsPDF } from 'jspdf';
import { sbGet, sbPost, sbPatch, sbPatchLong, uploadPhoto, fmtDateA, SQFT_PER_ROLL } from '@/components/site-audit/siteAuditShared';
import { confirmServicePerformed, retryQueuedServiceConfirms } from '@/components/site-audit/omsService';
import {
  SignaturePad,
  type SignaturePadHandle,
  useLocationTracking,
  ArrivalCameraModal,
  DocScannerModal,
} from '@/components/site-audit/fieldAppShared';
import {
  CATEGORY_LIST,
  MD_CATEGORIES,
  categoryFor,
  mdInstallTermsBlock,
  typeLabel,
  type FieldValues,
} from '@/components/site-audit/auditRegistry';
import { AuditRoomCard } from '@/components/site-audit/AuditRoomViews';
import {
  MD_INK,
  MD_MUTED,
  loadBrandLogo,
  mdBrandGrid,
  mdInfoTable,
  mdPdfAuditRoom,
  mdPdfConsent,
  mdPdfHeader,
  mdPdfInstallRoom,
} from '@/components/site-audit/pdfBrand';

/* Idiomatic React rewrite of material-depot-site's app/src/pages/SiteInstaller.jsx
   (1283 lines, vanilla DOM/innerHTML SPA). Business logic, status flow, validation
   rules and Supabase data shapes are ported to match exactly — only the
   implementation style changes (hooks/state/JSX instead of document.querySelector
   and innerHTML templates). Identity comes from the `actingAs` prop instead of
   the original's getSession()/localStorage, everything else (rollupStatus,
   loadJobs flattening, autoFlip, the read-merge-write status-advance sequence,
   the debounced/race-guarded job-card autosave, the primary-vs-additional
   installer finish branch, genPDF/genAuditPDF) is a verbatim port. */

/* ── Types ─────────────────────────────────────────────────────────────── */

type LogEntry = {
  t: string;
  d: string;
  by?: string;
  who?: string;
  lat?: number;
  lng?: number;
  arrivalPhoto?: string;
};

type SkuLine = { code: string; skuName: string; link: string; qty: string };

/* Flat v2 installation room — installed-detail fields come from the category registry's
   installFields, so a new product category needs no change here. The legacy
   {qty,height,width} keys are still read (older records) but never written. */
type PersistedRoom = {
  v?: number;
  category?: string;
  name: string;
  sku: string;
  fields?: FieldValues;
  photos: string[];
  /** Legacy single-photo field from older persisted records — reads only. */
  photo?: string;
  comments: string;
  /** Legacy pre-v2 fields — read-only, kept so old job cards still render. */
  qty?: string;
  height?: string;
  width?: string;
};

type Room = PersistedRoom & { id: number };

type Ratings = { q1: number; q2: number; q3: number; comments: string };

type JobCard = {
  draft?: boolean;
  /** Set by the PWA's partial-completion save ({partial, rooms, note, partialBy,
      partialAt}) — rooms done so far, no customer signature yet. */
  partial?: boolean;
  rooms: PersistedRoom[];
  // Ratings are collected via a D+1 COE call now (see components/site-audit/coe-ops), never
  // on-site — optional only so historical job cards with an old sign.ratings still render.
  sign?: { img: string; name: string; ratings?: Ratings; tcCategories?: string[] };
  installerSign?: { img: string; name: string };
};

type Job = {
  id: string;
  sjId: string;
  pi: string;
  name: string;
  phone: string;
  addr: string;
  bm: string;
  type: string;
  date: string | null;
  slot: string | null;
  slots: string[];
  /** What the screen shows — `status` with the display-only autoFlip applied. */
  status: string;
  /** What the DB actually holds for this installer, un-flipped. The stale-write
      guard compares against THIS: `callpending` 3h before the slot is a screen
      flip that is never persisted, so comparing `status` blocked every job on
      its own slot day. */
  storedStatus: string;
  sku: SkuLine[];
  auditBy: string | null;
  jobcard: JobCard | null;
  parentLog: LogEntry[];
  isPrimary: boolean;
};

type ActingAs = { id: string; name: string; email: string };

/* ── Local date helpers (mirrors StoreTeam.jsx's dstr/today pattern used
   elsewhere in this CRM's Site Audit tab) ────────────────────────────────── */
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
function addDays(base: Date, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

/* ── Business logic (verbatim from SiteInstaller.jsx) ─────────────────────── */
function itemQtyDisplay(it: any, isWallpaper: boolean): string {
  if (it.sqft) return it.sqft + ' sq.ft' + (isWallpaper ? ' (~' + Math.ceil((parseFloat(it.sqft) || 0) / SQFT_PER_ROLL) + ' rolls)' : '');
  if (isWallpaper && it.rolls) return it.rolls + ' rolls';
  return it.qty || '';
}

function buildSlots(): Record<string, { label: string; start: number }> {
  const m: Record<string, { label: string; start: number }> = {
    s1: { label: '9 AM – 12 PM', start: 9 },
    s2: { label: '12 PM – 3 PM', start: 12 },
    s3: { label: '3 PM – 6 PM', start: 15 },
  };
  if (typeof window === 'undefined') return m;
  const defFL = [{ id: 'sf1', label: '9 AM – 12 PM' }, { id: 'sf2', label: '12 PM – 3 PM' }, { id: 'sf3', label: '3 PM – 6 PM' }];
  const defWP = [{ id: 'sw1', label: '9 AM – 12 PM' }, { id: 'sw2', label: '12 PM – 3 PM' }, { id: 'sw3', label: '3 PM – 6 PM' }];
  let fl: any[] = defFL, wp: any[] = defWP;
  try {
    const sf = localStorage.getItem('md_install_slots_fl');
    const sw = localStorage.getItem('md_install_slots_wp');
    if (sf) fl = JSON.parse(sf);
    if (sw) wp = JSON.parse(sw);
  } catch {
    /* ignore malformed local overrides */
  }
  const st = [9, 12, 15];
  fl.forEach((s: any, i: number) => { m[s.id] = { label: s.label, start: st[i] || 9 }; });
  wp.forEach((s: any, i: number) => { m[s.id] = { label: s.label, start: st[i] || 9 }; });
  return m;
}

function rollupStatus(subjobs: any[], fallback: string): string {
  if (!subjobs || !subjobs.length) return fallback;
  const sts = subjobs.map((s) => s.status);
  if (sts.every((s) => s === 'completed')) return 'completed';
  if (sts.some((s) => s === 'completed') && sts.some((s) => s !== 'completed')) return 'partial';
  if (sts.some((s) => ['onway', 'atsite'].includes(s))) return sts.find((s) => ['onway', 'atsite'].includes(s))!;
  if (sts.some((s) => s === 'reschedule')) return 'reschedule';
  if (sts.some((s) => s === 'callpending')) return 'callpending';
  if (sts.some((s) => s === 'assigned')) return 'assigned';
  if (sts.some((s) => s === 'scheduled')) return 'scheduled';
  return fallback;
}

/* The status THIS installer is working against, in the vocabulary the screen
   uses. loadJobs and the stale-write guard in advanceStatus MUST both derive it
   from here — they were two hand-rolled derivations before, and every way they
   disagreed was a permanent hard block ("This job was just updated…" on a job
   nothing had updated, which no amount of refreshing could clear):
   - `assigned` is the DB spelling of what these field apps call `scheduled`;
   - on a shared sub-job only the PRIMARY writes `sj.status`, so an additional
     installer's own progress lives on their assignment row — and
     markAdditionalComplete writes it NOWHERE else;
   - an assignment created before per-assignee status existed has none, so fall
     back to the sub-job rather than reading it as blank. */
function statusForInstaller(sj: any, email: string): string {
  const assignments = Array.isArray(sj && sj.assignments) ? sj.assignments : [];
  const mine = assignments.find((a: any) => a && a.installer_email === email);
  const raw = (mine && mine.status) || (sj && sj.status) || '';
  return raw === 'assigned' ? 'scheduled' : raw;
}

function mapUrl(a: string) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a);
}

const INSTALL_STATUS: Record<string, { label: string; badge: string }> = {
  scheduled: { label: 'Scheduled', badge: 'bg-indigo-100 text-indigo-700' },
  callpending: { label: 'Call Pending', badge: 'bg-amber-100 text-amber-700' },
  reschedule: { label: 'To Reschedule', badge: 'bg-red-100 text-red-700' },
  onway: { label: 'On The Way', badge: 'bg-blue-100 text-blue-700' },
  atsite: { label: 'At Site', badge: 'bg-blue-100 text-blue-700' },
  // Written by Site_Installer_App.html's partial-completion flow in the
  // material-depot-site PWA against the same table — a sub-job status, not just
  // the order-level rollup. Missing here, it rendered as a raw 'partial' pill
  // above a detail screen with no stage card and no buttons at all.
  partial: { label: 'Partially Completed', badge: 'bg-teal-100 text-teal-700' },
  completed: { label: 'Completed', badge: 'bg-green-100 text-green-700' },
};

/* The statuses JobDetailScreen draws a stage card for. Anything else falls
   through to a self-describing block instead of an empty panel — `created` on a
   legacy sub-job the SM has since unscheduled lands there today, and these
   tables are shared with the material-depot-site PWA, which can add a status
   this port has never heard of (`partial` arrived exactly that way). */
const INSTALL_STAGES = ['scheduled', 'callpending', 'reschedule', 'onway', 'atsite', 'partial', 'completed'];

const DEFAULT_LOG_MESSAGES: Record<string, string> = {
  callpending: 'Pre-install call started',
  onway: 'Installer on the way · customer confirmed',
  reschedule: 'Customer declined → sent to office to reschedule',
  atsite: 'Installer arrived at site',
  completed: 'Installation completed',
};

/* Legacy audit field dicts removed — superseded by MD_CATEGORIES in auditRegistry.ts. */

function slotLabel(id: string | null, slots: Record<string, { label: string; start: number }>): string {
  if (!id) return '—';
  if (slots[id]) return slots[id].label;
  if (/^\d{1,2}:\d{2}$/.test(id)) {
    const [h, m] = id.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  }
  return '—';
}
function slotsLabel(j: Job, slots: Record<string, { label: string; start: number }>): string {
  if (j.slots && j.slots.length) {
    const lbls = j.slots.map((s) => slotLabel(s, slots)).filter((l) => l && l !== '—');
    if (lbls.length) return lbls.join(' · ');
  }
  return slotLabel(j.slot, slots) || '—';
}

/* The sub-job's own type picks the room's starting category; an unknown type falls back to
   flooring (same rule as the field app). */
function categoryForJob(job: Job | null, restore?: Partial<PersistedRoom>): string {
  const t = (restore && (restore.category || (restore as any).type)) || job?.type;
  return t && MD_CATEGORIES[t] ? t : 'flooring';
}

function appendRoomState(rooms: Room[], seqRef: { current: number }, job: Job | null, restore?: Partial<PersistedRoom>): Room[] {
  const id = ++seqRef.current;
  const firstSku = job?.sku[0];
  const category = categoryForJob(job, restore);
  const room: Room = restore
    ? {
        id,
        v: 2,
        category,
        name: restore.name || '',
        sku: restore.sku || '',
        fields: { ...(restore.fields || {}) },
        photos: restore.photos || (restore.photo ? [restore.photo] : []),
        comments: restore.comments || (restore as any).notes || '',
      }
    : {
        id,
        v: 2,
        category,
        name: '',
        sku: firstSku ? firstSku.code : '',
        fields: {},
        photos: [],
        comments: '',
      };
  return [...rooms, room];
}
function collectRooms(rooms: Room[]): PersistedRoom[] {
  return rooms.map(({ id: _id, ...rest }) => ({
    ...rest,
    v: 2,
    category: rest.category || 'flooring',
    fields: { ...(rest.fields || {}) },
    photos: rest.photos || [],
    comments: rest.comments || '',
  }));
}

/* Downscale only — the upload happens separately so the thumbnail can appear immediately (see
   handleFilesForRoom). On a weak site connection the old upload-then-show order left workers
   waiting up to ~20s and re-taking photos they had already captured. */
function resizeDataUrl(dataURL: string): Promise<string> {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => {
      try {
        const s = Math.min(1, 1600 / im.width, 1600 / im.height);
        const cv = document.createElement('canvas');
        cv.width = Math.round(im.width * s);
        cv.height = Math.round(im.height * s);
        cv.getContext('2d')!.drawImage(im, 0, 0, cv.width, cv.height);
        resolve(cv.toDataURL('image/jpeg', 0.88));
      } catch {
        resolve(dataURL);
      }
    };
    im.onerror = () => resolve(dataURL);
    im.src = dataURL;
  });
}

function compressForPdf(dataUrl: string | null | undefined): Promise<string | null> {
  if (!dataUrl) return Promise.resolve(null);
  return new Promise((res) => {
    const im = new Image();
    if (dataUrl.startsWith('http')) im.crossOrigin = 'anonymous';
    im.onload = () => {
      try {
        const s = Math.min(1, 1600 / Math.max(im.width, im.height));
        const w = Math.round(im.width * s), h = Math.round(im.height * s);
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        cv.getContext('2d')!.drawImage(im, 0, 0, w, h);
        res(cv.toDataURL('image/jpeg', 0.88));
      } catch {
        res(null);
      }
    };
    im.onerror = () => res(null);
    im.src = dataUrl;
  });
}

function renderSketch(r: any): string | null {
  if (!r.sketchStrokes || !r.sketchStrokes.length) return null;
  const W = 1000, H = 500;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  if (!x) return null;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, W, H);
  const s = Math.round(22 * (W / 360));
  x.fillStyle = '#b2b8c1';
  for (let yy = s; yy < H; yy += s) for (let xx = s; xx < W; xx += s) { x.beginPath(); x.arc(xx, yy, 2, 0, 7); x.fill(); }
  x.strokeStyle = '#1F3A5F';
  x.lineWidth = 3.2;
  x.lineJoin = 'round';
  x.lineCap = 'round';
  for (const st of r.sketchStrokes) {
    if (st.length < 1) continue;
    x.beginPath();
    st.forEach((p: any, i: number) => { const X = p.x * W, Y = p.y * H; if (i) x.lineTo(X, Y); else x.moveTo(X, Y); });
    x.stroke();
  }
  return c.toDataURL('image/jpeg', 0.85);
}

/* ── PDF generators (verbatim port of genPDF / genAuditPDF, lines 871-983) ── */
async function genInstallerPDF(job: Job, installerName: string): Promise<void> {
  await loadBrandLogo();
  const doc: any = new jsPDF('p', 'pt', 'a4');
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
  let y = M;
  const navy = MD_INK, muted = MD_MUTED;
  const rooms = job.jobcard?.rooms || [];
  const isPartial = !!(job.jobcard?.draft || job.jobcard?.partial);
  const cardTitle = 'Installation Job Card';
  function header() {
    y = mdPdfHeader(doc, { title: cardTitle, right: job.pi, M });
    return y;
  }
  header();
  y = mdInfoTable(doc, y, [['Proforma Invoice No.', job.pi], ['Client Name', job.name], ['Client Mobile', job.phone], ['Site Address', job.addr], ['BM', job.bm], ['Installer', installerName], ['Type', categoryFor(job.type).pdfLabel], ['Date', fmtDateA(job.date)]], M);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...navy); doc.text(isPartial ? 'Rooms installed so far' : 'Rooms installed', M, y + 4); y += 10;
  doc.autoTable(mdBrandGrid({
    startY: y, margin: { left: M, right: M }, styles: { fontSize: 8.5, cellPadding: 4, lineColor: [210, 216, 225] },
    head: [['#', 'Room', 'Category', 'SKU No.']], body: rooms.map((r, i) => [String(i + 1), r.name || '-', categoryFor(r.category || job.type).pdfLabel, r.sku || 'NA']),
  }));

  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    doc.addPage(); y = M; header();
    const cat = categoryFor(r.category || job.type);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...navy); doc.text('Room ' + (i + 1) + ': ' + (r.name || '-'), M, y + 2); y += 14;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...muted); doc.text(cat.pdfLabel + '  ·  SKU: ' + (r.sku || '-'), M, y + 10); y += 24;
    y = await mdPdfInstallRoom(doc, r, y, { M, W, H, compress: compressForPdf, header: () => mdPdfHeader(doc, { title: cardTitle, right: job.pi, M }) });
  }

  doc.addPage(); y = M; header();
  const R = job.jobcard?.sign?.ratings;
  if (R) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...navy); doc.text('Client Feedback', M, y); y += 14;
    doc.autoTable({
      startY: y, margin: { left: M, right: M }, theme: 'grid', styles: { fontSize: 9, cellPadding: 4 }, columnStyles: { 0: { cellWidth: 260, fontStyle: 'bold', textColor: navy, fillColor: [238, 243, 249] } },
      body: [['Overall installation experience', String(R.q1 || '—') + ' / 10'], ['Site Installer rating', String(R.q2 || '—') + ' / 10'], ['Site cleanliness after installation', String(R.q3 || '—') + ' / 10'], ...(R.comments ? [['Comments', R.comments]] : [])],
    });
    y = doc.lastAutoTable.finalY + 12;
  }
  await mdPdfConsent(doc, {
    y, M, W, H, compress: compressForPdf,
    consentText: 'I confirm that the installation for the above order has been carried out by the Material Depot installer, the rooms and products listed in this Job Card have been installed, and that I am satisfied with the service provided, and that the installation was carried out in line with the installation terms & conditions below.',
    termsBlock: mdInstallTermsBlock([job.type]),
    personName: job.jobcard?.sign?.name || job.name,
    personDate: fmtDateA(job.date),
    sign: job.jobcard?.sign,
    installerSign: job.jobcard?.installerSign,
    header: () => mdPdfHeader(doc, { title: cardTitle, right: job.pi, M }),
  });

  const fn = ('Installation_' + (job.name || 'client') + '_' + (job.pi || '') + '.pdf').replace(/[^a-z0-9_\-.]/gi, '_');
  doc.save(fn);
}

async function genAuditReportPDF(order: { pi: string; name: string; phone: string; addr: string; bm: string; date: string | null }, ticked: any): Promise<void> {
  await loadBrandLogo();
  const doc: any = new jsPDF('p', 'pt', 'a4');
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
  let y = M;
  const navy = MD_INK, muted = MD_MUTED;
  const rooms = ticked.rooms || [];
  function header() {
    y = mdPdfHeader(doc, { title: 'Site Audit Job Card', right: order.pi, M });
    return y;
  }
  header();
  y = mdInfoTable(doc, y, [['Proforma Invoice No.', order.pi], ['Client Name', order.name], ['Client Mobile', order.phone], ['Site Address', order.addr], ['BM', order.bm], ['Auditor', ticked.auditor || '—'], ['Date', fmtDateA(order.date)]], M);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...navy); doc.text('Rooms summary', M, y + 4); y += 10;
  doc.autoTable(mdBrandGrid({
    startY: y, margin: { left: M, right: M }, styles: { fontSize: 8.5, cellPadding: 4, lineColor: [210, 216, 225] },
    head: [['#', 'Room', 'Type', 'SKU No.']], body: rooms.map((r: any, i: number) => [String(i + 1), r.name || '-', categoryFor(r.category || r.type).pdfLabel, r.sku || 'NA']),
  }));
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    doc.addPage(); y = M; header();
    const cat = categoryFor(r.category || r.type);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...navy); doc.text('Room ' + (i + 1) + ': ' + (r.name || '-'), M, y + 2); y += 14;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...muted); doc.text(cat.pdfLabel + '  ·  SKU: ' + (r.sku || 'NA'), M, y + 10); y += 24;
    y = await mdPdfAuditRoom(doc, r, y, { M, W, H, compress: compressForPdf, sketchImg: renderSketch(r), header: () => mdPdfHeader(doc, { title: 'Site Audit Job Card', right: order.pi, M }) });
  }
  doc.addPage(); y = M; header();
  await mdPdfConsent(doc, {
    y, M, W, H, compress: compressForPdf,
    consentText: 'I confirm that the site audit for the above order has been carried out by the Material Depot auditor, that the rooms, measurements and details recorded in this Job Card are correct, and that I am satisfied with the service provided, and that I have read, understood and agree to the installation terms & conditions below.',
    termsBlock: mdInstallTermsBlock([...new Set<string>(rooms.map((r: any) => r.category || r.type))]),
    personName: ticked.sign?.name || order.name,
    personDate: fmtDateA(order.date),
    sign: ticked.sign,
    header: () => mdPdfHeader(doc, { title: 'Site Audit Job Card', right: order.pi, M }),
  });
  doc.save(('SiteAudit_' + (order.name || 'client') + '_' + (order.pi || '') + '.pdf').replace(/[^a-z0-9_\-.]/gi, '_'));
}

/* ── Small presentational bits ─────────────────────────────────────────── */
function StatusPill({ status }: { status: string }) {
  const s = INSTALL_STATUS[status] || { label: status, badge: 'bg-gray-100 text-gray-600' };
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${s.badge}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{s.label}</span>;
}

function Spinner() {
  return <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#EAB308]" />;
}

function CommentSheet({ open, title, onCancel, onConfirm }: { open: boolean; title: string; onCancel: () => void; onConfirm: (comment: string) => void }) {
  const [value, setValue] = useState('');
  useEffect(() => { if (open) setValue(''); }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[900] flex items-end justify-center bg-black/40 sm:items-center" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <div className="mb-3 text-base font-bold text-[#1F3A5F]">{title}</div>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Add a comment (optional — leave blank to skip)"
          className="mb-3 min-h-[90px] w-full resize-y rounded-xl border border-gray-200 p-3 text-sm outline-none focus:border-yellow-400"
        />
        <div className="grid grid-cols-3 gap-2.5">
          <button onClick={onCancel} className="rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={() => onConfirm(value.trim())} className="col-span-2 rounded-xl bg-[#1F3A5F] py-3 text-sm font-semibold text-white hover:opacity-90">Confirm</button>
        </div>
      </div>
    </div>
  );
}

/* ── Root component ────────────────────────────────────────────────────── */
export default function SiteInstallerApp({ actingAs }: { actingAs: ActingAs }) {
  const SLOTS = useMemo(() => buildSlots(), []);
  const days = useMemo(() => Array.from({ length: 37 }, (_, i) => addDays(today, i - 30)), []);
  const todayStr = dstr(today);

  const [installerType, setInstallerType] = useState<string>('flooring');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selDay, setSelDay] = useState(todayStr);
  const [screen, setScreen] = useState<'list' | 'detail'>('list');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [jobCardOpen, setJobCardOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [rescheduleFollowUp, setRescheduleFollowUp] = useState('');
  const [advBusy, setAdvBusy] = useState(false);
  const [arrivalOpen, setArrivalOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [commentSheet, setCommentSheet] = useState<{ title: string; onConfirm: (c: string) => void } | null>(null);
  const [locDenied, setLocDenied] = useState(false);

  const [toastMsg, setToastMsg] = useState('');
  const [toastShow, setToastShow] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastShow(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastShow(false), 2200);
  }, []);

  const location = useLocationTracking(actingAs.email);

  /* ── Fetch installer_type from profiles at mount (source line 165) ──── */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await sbGet('profiles?email=eq.' + encodeURIComponent(actingAs.email) + '&select=installer_type&limit=1');
        if (!alive) return;
        if (Array.isArray(rows) && rows[0] && rows[0].installer_type) setInstallerType(rows[0].installer_type);
      } catch {
        /* keep default */
      }
    })();
    return () => { alive = false; };
  }, [actingAs.email]);

  /* ── loadJobs (verbatim flattening, source lines 213-253) ────────────── */
  const loadJobs = useCallback(async () => {
    try {
      const rows = await sbGet('install_orders_slim?select=*&status=not.in.(pending,deliv_ontime,deliv_delayed,deleted)&order=created_at.desc');
      if (!Array.isArray(rows)) return;
      setJobs((prevJobs) => {
        const existing: Record<string, JobCard> = {};
        prevJobs.forEach((j) => { if (j.jobcard) existing[j.pi + '|' + j.sjId] = j.jobcard; });
        const newJobs: Job[] = [];
        rows.forEach((r: any) => {
          (r.subjobs || []).forEach((sj: any) => {
            const myAssign = (sj.assignments || []).find((a: any) => a.installer_email === actingAs.email);
            const legacyMatch = !(sj.assignments && sj.assignments.length) && sj.installer_email === actingAs.email;
            if (myAssign || legacyMatch) {
              const aDate: string | null = myAssign ? (myAssign.mode === 'custom' ? (myAssign.dates && myAssign.dates[0]) || null : myAssign.date || null) : sj.date || null;
              const aSlots: string[] = myAssign ? myAssign.slots || [] : sj.slot ? [sj.slot] : [];
              const isPrimary: boolean = myAssign
                ? myAssign.primary === true || (!sj.assignments.some((a: any) => a.primary) && sj.assignments.indexOf(myAssign) === 0)
                : true;
              // Their OWN status, not the primary's — see statusForInstaller.
              const myStatus = statusForInstaller(sj, actingAs.email);
              newJobs.push({
                id: r.id,
                sjId: sj.id,
                pi: r.pi || '',
                name: r.customer_name || '',
                phone: r.phone || '',
                addr: r.addr || '',
                bm: r.bm || '',
                type: sj.type || 'flooring',
                date: aDate,
                slot: aSlots[0] || null,
                slots: aSlots,
                status: myStatus,
                storedStatus: myStatus,
                sku: (sj.items || []).map((it: any) => ({ code: it.sku || '', skuName: it.name || it.num || '', link: it.link || '', qty: itemQtyDisplay(it, sj.type === 'wallpaper') })),
                auditBy: (r.service && r.service.audit_by) || null,
                jobcard: existing[r.pi + '|' + sj.id] || sj.jobcard || null,
                parentLog: r.log || [],
                isPrimary,
              });
            }
          });
        });
        return newJobs;
      });
    } catch (e) {
      console.error('loadJobs', e);
    }
  }, [actingAs.email]);

  /* ── autoFlip (verbatim, source line 268) — display-only, never persisted ── */
  const displayJobs = useMemo<Job[]>(() => {
    const now = new Date();
    return jobs.map((o) => {
      if (o.status === 'scheduled' && o.date === todayStr) {
        let startH: number | undefined;
        const slotDef = o.slot ? SLOTS[o.slot] : undefined;
        if (slotDef) startH = slotDef.start;
        else if (o.slot && /^\d{1,2}:\d{2}$/.test(o.slot)) {
          const [h, m] = o.slot.split(':').map(Number);
          startH = h + m / 60;
        } else return o;
        const start = new Date(today);
        start.setHours(Math.floor(startH), Math.round((startH % 1) * 60), 0, 0);
        // Only `status` flips; `storedStatus` is spread through untouched so the
        // stale-write guard still sees what the DB holds.
        if (now >= new Date(start.getTime() - 3 * 3600 * 1000)) return { ...o, status: 'callpending' };
      }
      return o;
    });
  }, [jobs, SLOTS, todayStr]);

  const activeJob = useMemo<Job | null>(() => {
    if (!activeKey) return null;
    return displayJobs.find((j) => j.pi + '|' + j.sjId === activeKey) || null;
  }, [activeKey, displayJobs]);

  /* ── Poll + visibility refresh (same pattern as elsewhere in this suite) ── */
  useEffect(() => {
    loadJobs();
    // Drain any OMS service confirmation that failed earlier (idempotent upstream) — an
    // unretried failure would leave a finished installation unbilled.
    retryQueuedServiceConfirms();
    location.start(null);
    const pollId = setInterval(() => { if (!document.hidden) loadJobs(); }, 30000);
    const onVis = () => { if (!document.hidden) loadJobs(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(pollId);
      document.removeEventListener('visibilitychange', onVis);
      location.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadJobs]);

  useEffect(() => {
    if (!navigator.permissions) return;
    let sub: PermissionStatus | null = null;
    navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((r) => {
      sub = r;
      const upd = () => setLocDenied(r.state === 'denied');
      upd();
      r.onchange = upd;
    }).catch(() => {});
    return () => { if (sub) sub.onchange = null; };
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  /* ── Day strip auto-centering ─────────────────────────────────────────── */
  const dayStripRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const strip = dayStripRef.current;
    if (!strip) return;
    const sel = strip.querySelector('[data-selected="true"]') as HTMLElement | null;
    if (sel) strip.scrollLeft = Math.max(0, sel.offsetLeft - strip.clientWidth / 2 + sel.offsetWidth / 2);
  }, [selDay]);

  /* ── Status-advance read-merge-write (verbatim, source lines 403-437) ──── */
  const advanceStatus = useCallback(async (job: Job, st: string, msg: string, logOverride?: string | null, extraLog?: Record<string, any>) => {
    if (advBusy) return;
    setAdvBusy(true);
    const logMsg = logOverride || DEFAULT_LOG_MESSAGES[st] || st;
    try {
      if (job.id && job.sjId) {
        const parentRows = await sbGet('install_orders?id=eq.' + job.id + '&select=subjobs,log,status,po');
        if (!Array.isArray(parentRows) || !parentRows[0]) { toast('Job not found — please refresh'); return; }
        const parent = parentRows[0];
        const subjobs = parent.subjobs || [];
        const sj = subjobs.find((s: any) => s.id === job.sjId);
        if (!sj) { toast('Job not found — please refresh'); return; }
        // Someone else (an SM rebooking after a reschedule, another assignee)
        // may have moved this sub-job since it was loaded — writing this
        // transition on top of that would silently clobber it. Both sides of
        // the comparison have to come from statusForInstaller against the
        // *stored* status; deriving the fresh half by hand and comparing it to
        // the flattened+autoFlipped `job.status` is what made this fire on
        // jobs nobody had touched.
        const curStatus = statusForInstaller(sj, actingAs.email);
        if (curStatus !== job.storedStatus) {
          const label = (INSTALL_STATUS[curStatus] || { label: curStatus }).label;
          toast('The office moved this job to "' + label + '" — showing the latest now');
          await loadJobs();
          return;
        }
        const dbSt = st === 'scheduled' ? 'assigned' : st;
        if (sj.assignments && sj.assignments.length) {
          const myA = sj.assignments.find((a: any) => a.installer_email === actingAs.email);
          if (myA) myA.status = dbSt; else sj.status = dbSt;
          const amPrimary = myA && (myA.primary === true || (!sj.assignments.some((a: any) => a.primary) && sj.assignments.indexOf(myA) === 0));
          if (amPrimary) sj.status = dbSt;
        } else {
          sj.status = dbSt;
        }
        const freshLog: LogEntry[] = Array.isArray(parent.log) ? [...parent.log] : [];
        freshLog.push({ t: logMsg, d: new Date().toISOString(), by: 'auto', who: actingAs.name, ...(extraLog || {}) });
        const parentStatus = rollupStatus(subjobs, parent.status || 'scheduled');
        await sbPatch('install_orders', job.id, { subjobs, status: parentStatus, log: freshLog });
        // Whole installation done (not just one sub-job) → confirm the OMS SERVICE leg, which is what
        // raises its invoice. A partial install must NOT bill, so this is gated on the rollup status.
        if (parentStatus === 'completed') {
          try {
            await confirmServicePerformed(parent.po, 'Installation completed by ' + actingAs.name);
          } catch {}
        }
      }
      if (st === 'atsite') location.start(job.pi);
      else if (st === 'completed' || st === 'reschedule') location.stop();
      await loadJobs();
      toast(msg);
    } catch {
      toast('Network error — try again');
    } finally {
      setAdvBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advBusy, actingAs.email, actingAs.name, loadJobs, location, toast]);

  /* ── Job-card wizard state (lifted to root so the debounced autosave and
     race-guard survive navigating back to the detail screen — mirrors the
     source's persistent module-scope jcJob/jcRooms/_autosaveTimer vars,
     which never get torn down just because #jcScreen is hidden) ─────────── */
  const jcJobRef = useRef<Job | null>(null);
  const jcSeqRef = useRef(0);
  const jcRoomsRef = useRef<Room[]>([]);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveSeqRef = useRef(0);
  const completionWriteRef = useRef<{ subjobs: any[] } | null>(null);

  const [jcRooms, setJcRooms] = useState<Room[]>([]);
  const [jcStage, setJcStage] = useState<'rooms' | 'review' | 'handoff' | 'tcs' | 'signature' | 'installerSignoff'>('rooms');
  const [signName, setSignName] = useState('');
  // Customer's uploaded signature URL, captured once they finish signing — the SAME signPadRef
  // canvas is cleared and reused for the installer's own signature on the next stage.
  const [customerSignImg, setCustomerSignImg] = useState<string | null>(null);
  const [installerSignName, setInstallerSignName] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'local'>('idle');
  const [scanTargetRoomId, setScanTargetRoomId] = useState<number | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [finishBusy, setFinishBusy] = useState(false);
  const signPadRef = useRef<SignaturePadHandle | null>(null);

  const triggerAutosave = useCallback(() => {
    const job = jcJobRef.current;
    if (!job) return;
    try {
      localStorage.setItem('md_install_' + job.pi + '_' + job.sjId, JSON.stringify({ rooms: collectRooms(jcRoomsRef.current), ts: Date.now() }));
    } catch { /* local persistence best-effort */ }
    setSaveStatus('saving');
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    const mySeq = ++autosaveSeqRef.current;
    autosaveTimerRef.current = setTimeout(async () => {
      if (autosaveSeqRef.current !== mySeq) return;
      if (completionWriteRef.current) { setSaveStatus('saved'); return; }
      const curJob = jcJobRef.current;
      if (!curJob || !curJob.id || !curJob.sjId) { setSaveStatus('local'); return; }
      try {
        const parentRows = await sbGet('install_orders?id=eq.' + curJob.id + '&select=subjobs');
        if (autosaveSeqRef.current !== mySeq || completionWriteRef.current) return;
        if (Array.isArray(parentRows) && parentRows[0]) {
          const subjobs = parentRows[0].subjobs || [];
          const sj = subjobs.find((s: any) => s.id === curJob.sjId);
          const draftRooms = collectRooms(jcRoomsRef.current).map(({ photos: _photos, ...rest }) => rest);
          if (sj) sj.jobcard = { draft: true, rooms: draftRooms };
          if (autosaveSeqRef.current !== mySeq || completionWriteRef.current) return;
          await sbPatch('install_orders', curJob.id, { subjobs });
          if (completionWriteRef.current) {
            try { await sbPatchLong('install_orders', curJob.id, completionWriteRef.current); } catch { /* best-effort */ }
          } else if (autosaveSeqRef.current === mySeq) {
            setSaveStatus('saved');
          }
        }
      } catch {
        setSaveStatus('local');
      }
    }, 3000);
  }, []);

  const updateRooms = useCallback((updater: (prev: Room[]) => Room[]) => {
    setJcRooms((prev) => {
      const next = updater(prev);
      jcRoomsRef.current = next;
      return next;
    });
    triggerAutosave();
  }, [triggerAutosave]);

  const openJobCard = useCallback((job: Job) => {
    jcJobRef.current = job;
    jcSeqRef.current = 0;
    completionWriteRef.current = null;
    setSaveStatus('idle');
    setJcStage('rooms');
    let restoreList: PersistedRoom[] | null = null;
    try {
      const raw = localStorage.getItem('md_install_' + job.pi + '_' + job.sjId);
      const d = raw ? JSON.parse(raw) : null;
      if (d && Array.isArray(d.rooms) && d.rooms.length) restoreList = d.rooms;
    } catch { /* ignore malformed draft */ }
    if (!restoreList && job.jobcard && Array.isArray(job.jobcard.rooms) && job.jobcard.rooms.length) restoreList = job.jobcard.rooms;
    const seeded = restoreList && restoreList.length
      ? restoreList.reduce<Room[]>((acc, r) => appendRoomState(acc, jcSeqRef, job, r), [])
      : appendRoomState([], jcSeqRef, job);
    setJcRooms(seeded);
    jcRoomsRef.current = seeded;
    setJobCardOpen(true);
  }, []);

  const handleAddRoom = useCallback(() => {
    updateRooms((prev) => appendRoomState(prev, jcSeqRef, jcJobRef.current));
  }, [updateRooms]);

  const handleJcBack = useCallback(() => {
    const job = jcJobRef.current;
    if (job) {
      const rooms = collectRooms(jcRoomsRef.current);
      setJobs((prev) => prev.map((j) => (j.pi === job.pi && j.sjId === job.sjId ? { ...j, jobcard: { rooms } } : j)));
      triggerAutosave();
    }
    setJobCardOpen(false);
    setScreen('detail');
  }, [triggerAutosave]);

  function validateRooms(rooms: Room[]): string | null {
    if (rooms.length === 0) return 'Add at least one room';
    for (const r of rooms) {
      if (!r.name.trim()) return 'Enter a room name';
      if (!r.sku.trim()) return 'Enter the SKU code';
      if (!r.photos || !r.photos.length) return 'Add at least one photo for ' + (r.name || 'each room');
    }
    return null;
  }

  const finishCard = useCallback(() => {
    const err = validateRooms(jcRooms);
    if (err) { toast(err); return; }
    setJcStage('review');
  }, [jcRooms, toast]);

  const markAdditionalComplete = useCallback(async () => {
    const job = jcJobRef.current;
    if (!job) return;
    if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null; }
    autosaveSeqRef.current++;
    const rooms = collectRooms(jcRoomsRef.current);
    const newJobcard: JobCard = { rooms };
    setFinishBusy(true);
    toast('Saving...');
    try {
      const parentRows = await sbGet('install_orders?id=eq.' + job.id + '&select=subjobs,log,status,po');
      if (Array.isArray(parentRows) && parentRows[0]) {
        const subjobs = parentRows[0].subjobs || [];
        const sj = subjobs.find((s: any) => s.id === job.sjId);
        if (sj) {
          if (sj.assignments && sj.assignments.length) {
            const myA = sj.assignments.find((a: any) => a.installer_email === actingAs.email);
            if (myA) myA.status = 'completed';
            sj.jobcard = newJobcard;
          } else {
            sj.status = 'completed';
            sj.jobcard = newJobcard;
          }
        }
        const freshLog: LogEntry[] = Array.isArray(parentRows[0].log) ? [...parentRows[0].log] : [];
        freshLog.push({ t: typeLabel(job.type) + ' installation done (additional installer: ' + actingAs.name + ')', d: new Date().toISOString(), by: 'auto' });
        const parentStatus = rollupStatus(subjobs, parentRows[0].status || 'completed');
        await sbPatch('install_orders', job.id, { subjobs, status: parentStatus, log: freshLog });
        try { localStorage.removeItem('md_install_' + job.pi + '_' + job.sjId); } catch { /* ignore */ }
        // Whole installation done (not just one sub-job) → confirm the OMS SERVICE leg, which is what
        // raises its invoice. A partial install must NOT bill, so this is gated on the rollup status.
        if (parentStatus === 'completed') {
          try {
            await confirmServicePerformed(parentRows[0].po, 'Installation completed by ' + actingAs.name);
          } catch {}
        }
      }
    } catch {
      toast("Network error — couldn't save. Try again");
      setFinishBusy(false);
      return;
    }
    await loadJobs();
    setJobCardOpen(false);
    setScreen('detail');
    setActiveKey(job.pi + '|' + job.sjId);
    toast('Your part marked complete');
    setFinishBusy(false);
  }, [actingAs.email, actingAs.name, loadJobs, toast]);

  // Customer has just signed (still on the 'signature' stage) — export + upload that signature,
  // clear the pad, and hand off to the installer's own confirmation + signature stage. The SAME
  // signPadRef canvas is reused, so nothing about finishInstallation's pad-export logic changes.
  const onSignNext = useCallback(async () => {
    if (signPadRef.current!.isEmpty()) { toast("Please take the customer's signature"); return; }
    const rawSig = signPadRef.current!.export();
    let sigImg = rawSig;
    try { sigImg = await uploadPhoto(rawSig); } catch { /* keep raw captured data URL */ }
    setCustomerSignImg(sigImg);
    signPadRef.current!.clear();
    setInstallerSignName(actingAs.name);
    setJcStage('installerSignoff');
  }, [actingAs.name, toast]);

  const finishInstallation = useCallback(async () => {
    const job = jcJobRef.current;
    if (!job) return;
    if (signPadRef.current!.isEmpty()) { toast('Please add the installer signature'); return; }
    if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null; }
    autosaveSeqRef.current++;
    const rooms = collectRooms(jcRoomsRef.current);
    const rawInstallerSig = signPadRef.current!.export();
    let installerSigImg = rawInstallerSig;
    try { installerSigImg = await uploadPhoto(rawInstallerSig); } catch { /* keep raw captured data URL */ }
    const newJobcard: JobCard = {
      rooms,
      sign: { img: customerSignImg || '', name: signName, tcCategories: [job.type] },
      installerSign: { img: installerSigImg, name: installerSignName },
    };
    job.jobcard = newJobcard;
    const newParentLog = [...(job.parentLog || []), { t: typeLabel(job.type) + ' installation completed', d: new Date().toISOString(), by: 'auto', who: actingAs.name }];
    setFinishBusy(true);
    toast('Saving...');
    try {
      const parentRows = await sbGet('install_orders?id=eq.' + job.id + '&select=subjobs,log,status,po');
      if (Array.isArray(parentRows) && parentRows[0]) {
        const subjobs = parentRows[0].subjobs || [];
        const sj = subjobs.find((s: any) => s.id === job.sjId);
        if (sj) {
          if (sj.assignments && sj.assignments.length) {
            const myA = sj.assignments.find((a: any) => a.installer_email === actingAs.email);
            if (myA) myA.status = 'completed';
            sj.status = 'completed';
          } else {
            sj.status = 'completed';
          }
          sj.jobcard = newJobcard;
        }
        const parentStatus = rollupStatus(subjobs, parentRows[0].status || 'completed');
        await sbPatch('install_orders', job.id, { status: parentStatus, log: newParentLog });
        // Whole installation done (not just one sub-job) → confirm the OMS SERVICE leg, which is what
        // raises its invoice. A partial install must NOT bill, so this is gated on the rollup status.
        if (parentStatus === 'completed') {
          try {
            await confirmServicePerformed(parentRows[0].po, 'Installation completed by ' + actingAs.name);
          } catch {}
        }
        const completionPatch = { subjobs };
        completionWriteRef.current = completionPatch;
        await sbPatchLong('install_orders', job.id, completionPatch);
        job.parentLog = newParentLog;
        try { localStorage.removeItem('md_install_' + job.pi + '_' + job.sjId); } catch { /* ignore */ }
      }
    } catch {
      toast("Network error — couldn't save. Try again");
      setFinishBusy(false);
      return;
    }
    // The job is already saved above — a PDF failure (jsPDF OOM on a low-end phone, a CORS-tainted
    // image) must never leave the worker stuck on a disabled "Saving…" button thinking it didn't finish.
    try { await genInstallerPDF(job, actingAs.name); } catch (e) { console.error('PDF:', e); }
    await loadJobs();
    setJobCardOpen(false);
    setScreen('detail');
    setActiveKey(job.pi + '|' + job.sjId);
    toast('Job finished & sent to office');
    setFinishBusy(false);
  }, [actingAs.email, actingAs.name, signName, customerSignImg, installerSignName, loadJobs, toast]);

  /* ── Photo handling for job-card rooms ─────────────────────────────────── */
  const swapRoomPhoto = useCallback((roomId: number, from: string, to: string) => {
    updateRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, photos: r.photos.map((p) => (p === from ? to : p)) } : r)));
  }, [updateRooms]);
  const addPhotoToRoom = useCallback((roomId: number, url: string) => {
    updateRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, photos: [...r.photos, url] } : r)));
  }, [updateRooms]);
  const removePhotoFromRoom = useCallback((roomId: number, idx: number) => {
    updateRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, photos: r.photos.filter((_p, i) => i !== idx) } : r)));
  }, [updateRooms]);
  const removeRoom = useCallback((roomId: number) => {
    updateRooms((prev) => prev.filter((r) => r.id !== roomId));
  }, [updateRooms]);
  const updateRoomField = useCallback((roomId: number, field: keyof PersistedRoom, value: string) => {
    updateRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, [field]: value } : r)));
  }, [updateRooms]);
  // Switching category clears the captured install fields — they belong to the old category's
  // installFields set (same as the field app).
  const updateRoomCategory = useCallback((roomId: number, category: string) => {
    updateRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, category, fields: {} } : r)));
  }, [updateRooms]);
  const updateRoomInstallField = useCallback((roomId: number, k: string, value: string) => {
    updateRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, fields: { ...(r.fields || {}), [k]: value } } : r)));
  }, [updateRooms]);

  const handleFilesForRoom = useCallback(async (roomId: number, files: FileList | null) => {
    if (!files || !files.length) return;
    for (const file of Array.from(files)) {
      const dataURL: string = await new Promise((resolve) => {
        const rd = new FileReader();
        rd.onload = () => resolve(rd.result as string);
        rd.readAsDataURL(file);
      });
      const resized = await resizeDataUrl(dataURL);
      addPhotoToRoom(roomId, resized);
      uploadPhoto(resized)
        .then((url) => swapRoomPhoto(roomId, resized, url))
        .catch(() => { /* keep the inline base64 — the draft/job card still carries the photo */ });
    }
  }, [addPhotoToRoom, swapRoomPhoto]);

  /* ── Audit report (read-only), source lines 483-514 ───────────────────── */
  const [auditState, setAuditState] = useState<{ loading: boolean; error: 'none' | 'network' | null; ticked: any; auditorName: string | null; date: string | null }>({ loading: true, error: null, ticked: null, auditorName: null, date: null });

  useEffect(() => {
    if (!auditOpen || !activeJob) return;
    let alive = true;
    setAuditState({ loading: true, error: null, ticked: null, auditorName: null, date: null });
    (async () => {
      try {
        const rows = await sbGet('audit_orders?phone=eq.' + encodeURIComponent(activeJob.phone) + '&status=eq.completed&order=created_at.desc&limit=1&select=audit_ticked,auditor_name,date');
        if (!alive) return;
        const row = Array.isArray(rows) ? rows[0] : null;
        const a = row && row.audit_ticked ? row.audit_ticked : null;
        if (!a || !a.rooms || !a.rooms.length) { setAuditState({ loading: false, error: 'none', ticked: null, auditorName: null, date: null }); return; }
        setAuditState({ loading: false, error: null, ticked: a, auditorName: row.auditor_name || null, date: row.date || null });
      } catch {
        if (alive) setAuditState({ loading: false, error: 'network', ticked: null, auditorName: null, date: null });
      }
    })();
    return () => { alive = false; };
  }, [auditOpen, activeJob]);

  /* ── Detail actions ─────────────────────────────────────────────────────── */
  const openDetail = useCallback((key: string) => {
    setActiveKey(key);
    setScreen('detail');
    setRescheduleOpen(false);
    setRescheduleReason('');
    setRescheduleFollowUp('');
  }, []);

  const handleDownloadPdf = useCallback(async (job: Job) => {
    setPdfBusy(true);
    try {
      const rows = await sbGet('install_orders?id=eq.' + job.id + '&select=subjobs');
      let jobcard = job.jobcard;
      if (Array.isArray(rows) && rows[0]) {
        const sj = (rows[0].subjobs || []).find((s: any) => s.id === job.sjId);
        if (sj && sj.jobcard) jobcard = sj.jobcard;
      }
      if (!jobcard) toast('Job card not available');
      else {
        try { await genInstallerPDF({ ...job, jobcard }, actingAs.name); }
        catch (e) { console.error('PDF:', e); toast('PDF generation failed — try again'); }
      }
    } finally {
      setPdfBusy(false);
    }
  }, [actingAs.name, toast]);

  const submitReschedule = useCallback(() => {
    const reason = rescheduleReason.trim();
    const followUp = rescheduleFollowUp.trim();
    if (!reason) { toast('Please enter a reason for rescheduling'); return; }
    if (!activeJob) return;
    setRescheduleOpen(false);
    setRescheduleReason('');
    setRescheduleFollowUp('');
    advanceStatus(activeJob, 'reschedule', 'Sent to office to reschedule', 'Reschedule requested: ' + reason + (followUp ? ' · Follow-up: ' + followUp : ''));
  }, [activeJob, advanceStatus, rescheduleFollowUp, rescheduleReason, toast]);

  /* ── List derived data ──────────────────────────────────────────────────── */
  const list = useMemo(() => displayJobs.filter((j) => j.date === selDay).sort((a, b) => (a.slot || '').localeCompare(b.slot || '')), [displayJobs, selDay]);
  const todo = useMemo(() => list.filter((j) => j.status !== 'completed'), [list]);
  const done = useMemo(() => list.filter((j) => j.status === 'completed'), [list]);
  const unscheduled = useMemo(() => displayJobs.filter((j) => !j.date && !['completed', 'reschedule'].includes(j.status)), [displayJobs]);
  const overdue = useMemo(() => (selDay === todayStr ? displayJobs.filter((j) => j.date && j.date < todayStr && !['completed', 'reschedule'].includes(j.status)) : []), [displayJobs, selDay, todayStr]);

  /* ── JSX ───────────────────────────────────────────────────────────────── */
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-black">My Installations</h1>
          <p className="text-[13px] text-gray-500">{actingAs.name} · {typeLabel(installerType)} Installer</p>
        </div>
      </div>

      {locDenied && (
        <div className="mb-4 rounded-md bg-red-700 px-4 py-2.5 text-center text-[13px] font-semibold text-white">
          ⚠ Location access is blocked. Enable location permission so the office can track you at site.
        </div>
      )}

      {screen === 'list' && (
        <JobListScreen
          days={days}
          selDay={selDay}
          todayStr={todayStr}
          onSelectDay={setSelDay}
          dayStripRef={dayStripRef}
          jobs={displayJobs}
          overdue={overdue}
          unscheduled={unscheduled}
          todo={todo}
          done={done}
          slots={SLOTS}
          onOpen={openDetail}
        />
      )}

      {screen === 'detail' && activeJob && (
        <JobDetailScreen
          job={activeJob}
          slots={SLOTS}
          advBusy={advBusy}
          pdfBusy={pdfBusy}
          rescheduleOpen={rescheduleOpen}
          rescheduleReason={rescheduleReason}
          rescheduleFollowUp={rescheduleFollowUp}
          onBack={() => { setScreen('list'); setRescheduleOpen(false); setRescheduleReason(''); setRescheduleFollowUp(''); }}
          onToCall={() => setCommentSheet({ title: 'Starting pre-install call', onConfirm: (c) => { setCommentSheet(null); advanceStatus(activeJob, 'callpending', 'Pre-install call started' + (c ? ' — ' + c : '')); } })}
          onYes={() => setCommentSheet({ title: 'Confirming on the way', onConfirm: (c) => { setCommentSheet(null); advanceStatus(activeJob, 'onway', "Installer on the way · customer confirmed" + (c ? ' — ' + c : '')); } })}
          onReached={() => setArrivalOpen(true)}
          onOpenJobCard={() => openJobCard(activeJob)}
          onTriggerReschedule={() => { setRescheduleReason(''); setRescheduleFollowUp(''); setRescheduleOpen(true); }}
          onCancelReschedule={() => { setRescheduleOpen(false); setRescheduleReason(''); setRescheduleFollowUp(''); }}
          onReasonChange={setRescheduleReason}
          onFollowUpChange={setRescheduleFollowUp}
          onSubmitReschedule={submitReschedule}
          onViewAudit={() => setAuditOpen(true)}
          onDownloadPdf={() => handleDownloadPdf(activeJob)}
        />
      )}

      {auditOpen && activeJob && (
        <AuditReportOverlay
          job={activeJob}
          state={auditState}
          onClose={() => setAuditOpen(false)}
          onDownload={() => {
            if (!auditState.ticked) return;
            genAuditReportPDF({ pi: activeJob.pi, name: activeJob.name, phone: activeJob.phone, addr: activeJob.addr, bm: activeJob.bm, date: auditState.date }, auditState.ticked);
          }}
        />
      )}

      {jobCardOpen && jcJobRef.current && (
        <JobCardWizardOverlay
          job={jcJobRef.current}
          installerName={actingAs.name}
          rooms={jcRooms}
          stage={jcStage}
          signName={signName}
          installerSignName={installerSignName}
          saveStatus={saveStatus}
          finishBusy={finishBusy}
          signPadRef={signPadRef}
          onBack={handleJcBack}
          onAddRoom={handleAddRoom}
          onRemoveRoom={removeRoom}
          onRoomField={updateRoomField}
          onRoomCategory={updateRoomCategory}
          onRoomInstallField={updateRoomInstallField}
          onRoomFiles={handleFilesForRoom}
          onRoomRemovePhoto={removePhotoFromRoom}
          onOpenScanner={(roomId) => setScanTargetRoomId(roomId)}
          onOpenLightbox={setLightboxSrc}
          onFinishCard={finishCard}
          onBackToRooms={() => setJcStage('rooms')}
          onProceed={() => { if (jcJobRef.current!.isPrimary) setJcStage('handoff'); else markAdditionalComplete(); }}
          onBackFromHandoff={() => setJcStage('review')}
          onClientReady={() => setJcStage('tcs')}
          onTcsBack={() => setJcStage('handoff')}
          onTcsProceed={() => {
            setSignName(jcJobRef.current!.name);
            setJcStage('signature');
          }}
          onSignBack={() => setJcStage('tcs')}
          onSignNameChange={setSignName}
          onSignNext={onSignNext}
          onInstallerSignNameChange={setInstallerSignName}
          onBackFromInstallerSignoff={() => setJcStage('signature')}
          onFinishInstallation={finishInstallation}
        />
      )}

      <ArrivalCameraModal
        open={arrivalOpen}
        onClose={() => setArrivalOpen(false)}
        onConfirm={({ photo, lat, lng }) => {
          setArrivalOpen(false);
          if (!activeJob) return;
          const extra: Record<string, any> = {};
          if (photo) extra.arrivalPhoto = photo;
          if (lat != null && lng != null) { extra.lat = lat; extra.lng = lng; }
          advanceStatus(activeJob, 'atsite', 'You are at the site', null, extra);
        }}
      />

      <DocScannerModal
        open={scanTargetRoomId !== null}
        onClose={() => setScanTargetRoomId(null)}
        onScanned={(url) => {
          if (scanTargetRoomId !== null) addPhotoToRoom(scanTargetRoomId, url);
          setScanTargetRoomId(null);
        }}
      />

      <CommentSheet
        open={commentSheet !== null}
        title={commentSheet?.title || ''}
        onCancel={() => setCommentSheet(null)}
        onConfirm={(c) => commentSheet?.onConfirm(c)}
      />

      {lightboxSrc && (
        <div className="fixed inset-0 z-[950] flex cursor-pointer items-center justify-center bg-black/90" onClick={() => setLightboxSrc(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxSrc} alt="" className="max-h-[94vh] max-w-[94vw] rounded-lg object-contain" />
        </div>
      )}

      <div className={`fixed bottom-6 left-1/2 z-[1000] -translate-x-1/2 rounded-md bg-gray-900 px-4 py-2.5 text-[13px] font-medium text-white shadow-lg transition-opacity duration-300 ${toastShow ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        {toastMsg}
      </div>
    </div>
  );
}

/* ── Job list screen ────────────────────────────────────────────────────── */
function JobListScreen({
  days, selDay, todayStr, onSelectDay, dayStripRef, jobs, overdue, unscheduled, todo, done, slots, onOpen,
}: {
  days: Date[];
  selDay: string;
  todayStr: string;
  onSelectDay: (ds: string) => void;
  dayStripRef: React.RefObject<HTMLDivElement | null>;
  jobs: Job[];
  overdue: Job[];
  unscheduled: Job[];
  todo: Job[];
  done: Job[];
  slots: Record<string, { label: string; start: number }>;
  onOpen: (key: string) => void;
}) {
  return (
    <div>
      {(overdue.length > 0 || unscheduled.length > 0) && (
        <div className="mb-4 flex flex-col gap-2">
          {overdue.length > 0 && (
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-red-600">Overdue — action needed</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {overdue.map((j) => <JobCardTile key={j.pi + '|' + j.sjId} job={j} slots={slots} variant="overdue" onClick={() => onOpen(j.pi + '|' + j.sjId)} />)}
              </div>
            </div>
          )}
          {unscheduled.length > 0 && (
            <div className="mt-1">
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-amber-600">Unscheduled — awaiting date from office</div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {unscheduled.map((j) => <JobCardTile key={j.pi + '|' + j.sjId} job={j} slots={slots} variant="unscheduled" onClick={() => onOpen(j.pi + '|' + j.sjId)} />)}
              </div>
            </div>
          )}
        </div>
      )}

      <div ref={dayStripRef} className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => {
          const ds = dstr(d);
          const n = jobs.filter((j) => j.date === ds).length;
          const isToday = ds === todayStr;
          const selected = ds === selDay;
          return (
            <div
              key={ds}
              data-selected={selected ? 'true' : undefined}
              onClick={() => onSelectDay(ds)}
              className={`flex h-16 w-16 shrink-0 cursor-pointer select-none flex-col items-center justify-center rounded-lg border ${selected ? 'border-[#EAB308] bg-yellow-50 text-gray-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              <div className="text-[10px] font-semibold uppercase tracking-wide">{isToday ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short' })}</div>
              <div className="text-sm font-bold">{d.getDate()}</div>
              <div className="text-[10px] text-gray-400">{n > 0 ? n + (n !== 1 ? ' jobs' : ' job') : ''}</div>
            </div>
          );
        })}
      </div>

      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-700">{selDay === todayStr ? 'Today' : 'Jobs'} — {fmtDateA(selDay)}</div>
      {todo.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-[13px] text-gray-400">No jobs for this day.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {todo.map((j) => <JobCardTile key={j.pi + '|' + j.sjId} job={j} slots={slots} variant="normal" onClick={() => onOpen(j.pi + '|' + j.sjId)} />)}
        </div>
      )}

      {done.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-700">Finished</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {done.map((j) => <JobCardTile key={j.pi + '|' + j.sjId} job={j} slots={slots} variant="normal" onClick={() => onOpen(j.pi + '|' + j.sjId)} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function JobCardTile({ job, slots, variant, onClick }: { job: Job; slots: Record<string, { label: string; start: number }>; variant: 'normal' | 'unscheduled' | 'overdue'; onClick: () => void }) {
  const borderClass = variant === 'overdue' ? 'border-red-300' : variant === 'unscheduled' ? 'border-amber-300' : 'border-gray-200';
  const timeText = variant === 'overdue' ? 'Overdue — ' + fmtDateA(job.date) : variant === 'unscheduled' ? 'No date set — tap to open' : slotsLabel(job, slots);
  const timeClass = variant === 'overdue' ? 'text-red-600' : variant === 'unscheduled' ? 'text-amber-600' : 'text-gray-500';
  return (
    <div onClick={onClick} className={`cursor-pointer rounded-lg border bg-white p-4 hover:bg-gray-50 ${borderClass}`}>
      <div className={`text-[12px] font-semibold ${timeClass}`}>{timeText}</div>
      <div className="mt-1 text-sm font-bold text-black">{job.name}</div>
      <div className="text-[12px] text-gray-500">{job.addr}</div>
      <div className="mt-2 flex items-center justify-between">
        <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${job.type === 'wallpaper' ? 'bg-purple-100 text-purple-700' : job.type === 'wallpanel' ? 'bg-teal-100 text-teal-700' : 'bg-yellow-100 text-yellow-800'}`}>
          {categoryFor(job.type).pdfLabel}
        </span>
        <StatusPill status={job.status} />
      </div>
    </div>
  );
}

/* ── Job detail screen ──────────────────────────────────────────────────── */
function JobDetailScreen({
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
                {/* Same gate as the SM drawer: a partial card is only worth downloading once it has rooms on it. */}
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

/* ── Audit report overlay (read-only), source lines 483-514 ────────────── */
function AuditReportOverlay({
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
              {/* Shared renderer — v2 segment audits (walls, prerequisites, per-segment photos) and
                  legacy single-block audits display identically here and in the SM dashboard. */}
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

/* ── Job card wizard overlay ────────────────────────────────────────────── */
function RoomBlock({
  room, index, onField, onCategory, onInstallField, onFiles, onOpenScanner, onRemovePhoto, onRemove, onOpenLightbox,
}: {
  room: Room;
  index: number;
  onField: (field: keyof PersistedRoom, value: string) => void;
  onCategory: (category: string) => void;
  onInstallField: (k: string, value: string) => void;
  onFiles: (files: FileList | null) => void;
  onOpenScanner: () => void;
  onRemovePhoto: (idx: number) => void;
  onRemove: () => void;
  onOpenLightbox: (src: string) => void;
}) {
  const camRef = useRef<HTMLInputElement | null>(null);
  const galRef = useRef<HTMLInputElement | null>(null);
  const cat = categoryFor(room.category);
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

      {/* Installed-detail fields come from the category registry — a new product category adapts
          automatically, no change needed here. */}
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
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e: ChangeEvent<HTMLInputElement>) => { onFiles(e.target.files); e.target.value = ''; }} />
      <input ref={galRef} type="file" accept="image/*" multiple className="hidden" onChange={(e: ChangeEvent<HTMLInputElement>) => { onFiles(e.target.files); e.target.value = ''; }} />
      <div className="mb-3 flex gap-2">
        <button onClick={() => camRef.current?.click()} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">📷 Camera</button>
        <button onClick={() => galRef.current?.click()} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">🖼 Gallery</button>
        <button onClick={onOpenScanner} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50">📄 Scan</button>
      </div>

      <label className="mb-1 block text-[12px] font-semibold">Comments (if any)</label>
      <textarea value={room.comments} onChange={(e) => onField('comments', e.target.value)} placeholder="Anything to note..." className="min-h-[70px] w-full resize-y rounded-lg border border-gray-200 p-2.5 text-sm outline-none focus:border-yellow-400" />
    </div>
  );
}

// `termsBlock` (from mdInstallTermsBlock) fills what used to be a literal, never-written-in
// placeholder — the installation terms for this job's category, so the customer is confirming the
// work was carried out per those terms, not just that it happened.
function buildInstallTC(termsBlock: string): string {
  return `Material Depot — Customer Acknowledgement

By ticking the box and signing below, I confirm that:

• The installation described in this job card has been carried out to my satisfaction.
• The rooms, materials and details recorded are accurate and correct.
• I am satisfied with the service provided by the Material Depot team.
• I consent to being contacted for quality feedback purposes if required.
• I have read, understood and agree to the installation terms & conditions below.

${termsBlock || '[Full terms and conditions will be provided by Material Depot]'}`;
}

function JobCardWizardOverlay({
  job, installerName, rooms, stage, signName, installerSignName, saveStatus, finishBusy, signPadRef,
  onBack, onAddRoom, onRemoveRoom, onRoomField, onRoomCategory, onRoomInstallField, onRoomFiles, onRoomRemovePhoto, onOpenScanner, onOpenLightbox,
  onFinishCard, onBackToRooms, onProceed, onBackFromHandoff, onClientReady, onTcsBack, onTcsProceed,
  onSignBack, onSignNameChange, onSignNext,
  onInstallerSignNameChange, onBackFromInstallerSignoff, onFinishInstallation,
}: {
  job: Job;
  installerName: string;
  rooms: Room[];
  stage: 'rooms' | 'review' | 'handoff' | 'tcs' | 'signature' | 'installerSignoff';
  signName: string;
  installerSignName: string;
  saveStatus: 'idle' | 'saving' | 'saved' | 'local';
  finishBusy: boolean;
  signPadRef: React.RefObject<SignaturePadHandle | null>;
  onBack: () => void;
  onAddRoom: () => void;
  onRemoveRoom: (id: number) => void;
  onRoomField: (id: number, field: keyof PersistedRoom, value: string) => void;
  onRoomCategory: (id: number, category: string) => void;
  onRoomInstallField: (id: number, k: string, value: string) => void;
  onRoomFiles: (id: number, files: FileList | null) => void;
  onRoomRemovePhoto: (id: number, idx: number) => void;
  onOpenScanner: (id: number) => void;
  onOpenLightbox: (src: string) => void;
  onFinishCard: () => void;
  onBackToRooms: () => void;
  onProceed: () => void;
  onBackFromHandoff: () => void;
  onClientReady: () => void;
  onTcsBack: () => void;
  onTcsProceed: () => void;
  onSignBack: () => void;
  onSignNameChange: (v: string) => void;
  onSignNext: () => void;
  onInstallerSignNameChange: (v: string) => void;
  onBackFromInstallerSignoff: () => void;
  onFinishInstallation: () => void;
}) {
  const [tcAgree, setTcAgree] = useState(false);
  useEffect(() => { if (stage === 'tcs') setTcAgree(false); }, [stage]);

  const saveStatusText = saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'local' ? '✓ Saved locally' : '';
  const saveStatusColor = saveStatus === 'saving' ? 'text-amber-600' : saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400';

  return (
    <div className="fixed inset-0 z-[900] flex flex-col bg-gray-50">
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <button onClick={stage === 'rooms' ? onBack : undefined} disabled={stage !== 'rooms'} className="text-lg text-gray-500 disabled:opacity-30">←</button>
        <div>
          <div className="text-sm font-bold text-black">Installation Card</div>
          <div className="text-[12px] text-gray-400">{job.pi} · {job.name}</div>
        </div>
        {stage === 'rooms' && <div className={`ml-auto text-[11px] font-semibold ${saveStatusColor}`}>{saveStatusText}</div>}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-2xl">
          {stage === 'rooms' && (
            <>
              <div className="mb-4 rounded-md bg-blue-50 px-3 py-2 text-[12px] text-blue-700">Fill one block per room. Each room needs a photo after installation. <span className="text-red-600">★</span> = required.</div>
              {rooms.map((r, i) => (
                <RoomBlock
                  key={r.id}
                  room={r}
                  index={i}
                  onField={(field, value) => onRoomField(r.id, field, value)}
                  onCategory={(category) => onRoomCategory(r.id, category)}
                  onInstallField={(k, value) => onRoomInstallField(r.id, k, value)}
                  onFiles={(files) => onRoomFiles(r.id, files)}
                  onOpenScanner={() => onOpenScanner(r.id)}
                  onRemovePhoto={(idx) => onRoomRemovePhoto(r.id, idx)}
                  onRemove={() => onRemoveRoom(r.id)}
                  onOpenLightbox={onOpenLightbox}
                />
              ))}
            </>
          )}

          {stage === 'review' && (
            <>
              <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h2 className="mb-3 text-base font-bold text-black">Job summary</h2>
                <div className="grid grid-cols-[100px_1fr] gap-y-1.5 text-[13px]">
                  <div className="text-gray-400">Customer</div><div>{job.name}</div>
                  <div className="text-gray-400">PI No.</div><div>{job.pi}</div>
                  <div className="text-gray-400">Address</div><div>{job.addr}</div>
                  <div className="text-gray-400">Installer</div><div>{installerName}</div>
                  <div className="text-gray-400">Date</div><div>{fmtDateA(job.date)}</div>
                  <div className="text-gray-400">Rooms</div><div>{rooms.length}</div>
                </div>
              </div>
              {rooms.map((r, i) => (
                <div key={r.id} className="mb-3 rounded-lg border border-gray-200 bg-white p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-[#1F3A5F] px-2.5 py-0.5 text-[12px] font-bold text-white">Room {i + 1}</span>
                    <b className="text-[15px]">{r.name}</b>
                    <span className="rounded-md bg-yellow-100 px-2 py-0.5 text-[11px] font-bold text-yellow-800">{categoryFor(r.category).pdfLabel}</span>
                    {r.sku && <span className="text-[12px] text-gray-400">SKU: {r.sku}</span>}
                  </div>
                  {(categoryFor(r.category).installFields || [])
                    .filter((f) => String(r.fields?.[f.k] ?? '') !== '')
                    .map((f) => (
                      <div key={f.k} className="text-[12px] text-gray-500">
                        {f.label}: <span className="text-gray-900">{String(r.fields?.[f.k])}</span>
                      </div>
                    ))}
                  {r.photos.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {r.photos.map((p, pi) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={pi} src={p} alt="" onClick={() => onOpenLightbox(p)} className="h-20 w-20 cursor-pointer rounded-lg border-2 border-gray-200 object-cover" />
                      ))}
                    </div>
                  )}
                  {r.comments && <div className="border-l-2 border-gray-200 pl-2.5 text-[13px] text-gray-500">{r.comments}</div>}
                </div>
              ))}
              {job.isPrimary ? (
                <button onClick={onProceed} className="mb-3 w-full rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:opacity-90">Proceed to client →</button>
              ) : (
                <>
                  <div className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-600">You are an <b>additional installer</b> — the primary installer handles the customer signature. Tap below to mark your part complete.</div>
                  <button disabled={finishBusy} onClick={onProceed} className="mb-3 w-full rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">{finishBusy ? 'Saving…' : 'Mark my part complete →'}</button>
                </>
              )}
              <button onClick={onBackToRooms} className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">← Back to rooms</button>
            </>
          )}

          {stage === 'handoff' && (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
              <div className="mb-4 text-5xl">📱</div>
              <div className="mb-2 text-lg font-bold text-[#1F3A5F]">Please hand the phone to the customer</div>
              <p className="mb-6 text-[13px] text-gray-500">The customer will now complete the final steps:</p>
              <div className="mb-7 rounded-lg bg-gray-50 px-4 py-3.5 text-left text-[13px] leading-loose">
                <div><b>Step 1</b> &nbsp; Read &amp; agree to the Terms &amp; Conditions</div>
                <div><b>Step 2</b> &nbsp; Rate the service (3 questions)</div>
                <div><b>Step 3</b> &nbsp; Provide their signature</div>
              </div>
              <button onClick={onClientReady} className="w-full rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:opacity-90">Customer is ready →</button>
              <button onClick={onBackFromHandoff} className="mt-2.5 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">← Back to job card</button>
            </div>
          )}

          {stage === 'tcs' && (
            <>
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <h2 className="mb-3 text-base font-bold text-black">Terms &amp; Conditions</h2>
                <div className="max-h-[200px] overflow-y-auto whitespace-pre-line rounded-lg border border-gray-200 p-3.5 text-[13.5px] leading-relaxed">
                  {buildInstallTC(mdInstallTermsBlock([job.type]))}
                </div>
                <label className="mt-5 flex cursor-pointer items-start gap-3">
                  <input type="checkbox" checked={tcAgree} onChange={(e) => setTcAgree(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#1F3A5F]" />
                  <span className="text-sm font-semibold leading-tight">I have read and agree to the terms and conditions above</span>
                </label>
              </div>
              <button disabled={!tcAgree} onClick={onTcsProceed} className="mt-3.5 w-full rounded-xl bg-[#1F3A5F] py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40">Agree &amp; proceed →</button>
              <button onClick={onTcsBack} className="mt-2.5 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">← Back</button>
            </>
          )}

          {stage === 'signature' && (
            <>
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <h2 className="mb-3 text-base font-bold text-black">Customer signature <span className="text-red-600">★</span></h2>
                <div className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-[12px] text-gray-500">Show the phone to the customer. Ask them to sign that the installation is done and they are happy.</div>
                <SignaturePad ref={signPadRef} className="mb-3" />
                <button onClick={() => signPadRef.current?.clear()} className="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">Clear signature</button>
                <div className="mt-3">
                  <label className="mb-1 block text-sm font-semibold">Customer name</label>
                  <input value={signName} onChange={(e) => onSignNameChange(e.target.value)} className="w-full rounded-lg border border-gray-200 p-2.5 text-sm outline-none focus:border-yellow-400" />
                </div>
              </div>
              <button onClick={onSignNext} className="mt-3.5 w-full rounded-xl bg-[#1F3A5F] py-3 text-sm font-bold text-white hover:opacity-90">Next: installer confirmation →</button>
              <button onClick={onSignBack} className="mt-2.5 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">← Back</button>
            </>
          )}

          {stage === 'installerSignoff' && (
            <>
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <h2 className="mb-3 text-base font-bold text-black">Installer confirmation <span className="text-red-600">★</span></h2>
                <div className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-[12px] text-gray-500">I confirm this installation was carried out in line with Material Depot&apos;s installation terms &amp; conditions for the categories involved.</div>
                <SignaturePad ref={signPadRef} className="mb-3" />
                <button onClick={() => signPadRef.current?.clear()} className="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">Clear signature</button>
                <div className="mt-3">
                  <label className="mb-1 block text-sm font-semibold">Installer name</label>
                  <input value={installerSignName} onChange={(e) => onInstallerSignNameChange(e.target.value)} className="w-full rounded-lg border border-gray-200 p-2.5 text-sm outline-none focus:border-yellow-400" />
                </div>
              </div>
              <button disabled={finishBusy} onClick={onFinishInstallation} className="mt-3.5 w-full rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">{finishBusy ? 'Saving…' : 'Save & finish job'}</button>
              <button onClick={onBackFromInstallerSignoff} className="mt-2.5 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">← Back</button>
            </>
          )}
        </div>
      </div>

      {stage === 'rooms' && (
        <div className="flex gap-2 border-t border-gray-200 bg-white p-3">
          <button onClick={onAddRoom} className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">+ Add room</button>
          <button onClick={onFinishCard} className="flex-1 rounded-xl bg-[#1F3A5F] py-3 text-sm font-bold text-white hover:opacity-90">Finish &amp; sign</button>
        </div>
      )}
    </div>
  );
}
