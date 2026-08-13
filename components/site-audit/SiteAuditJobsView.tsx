'use client';

import { useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  inCity, joinShadowers, parseShadowers, sbGet, sbPatch, JOB_STATUS, fmtDateA, fmtLog,
  type CityFilter, type Shadower,
} from './siteAuditShared';
import ShadowerSelect, { type ShadowerOption } from './install-ops/ShadowerSelect';
import { categoryFor } from './auditRegistry';
import { AuditRoomCard, InstallRoomCard } from './AuditRoomViews';
import RoomSkuEditor, { auditRoomSkuSaver, installRoomSkuSaver } from './RoomSkuEditor';

/* Who the activity log credits for edits made from this view. */
const JOBS_ATTRIBUTION = 'Service Manager (CRM)';
import {
  MD_INK,
  MD_MUTED,
  loadBrandLogo,
  mdBrandGrid,
  mdInfoTable,
  mdPdfHeader,
  mdPdfInstallRoom,
} from './pdfBrand';
/* The audit job-card PDF lives with Audit Ops now — both views build the same document. */
import { compressForPdf, genAuditPDF } from './audit-ops/pdf';

/* Read-only port of JobsView + JobDetailModal from material-depot-site's
   Admin.jsx (app/src/pages/Admin.jsx lines 787-1063). No writes — the only
   "action" here is client-side PDF generation (genAuditPDF/genInstallPDF),
   ported verbatim from the same file (lines 95-200). */

/* Legacy audit field dicts removed — superseded by MD_CATEGORIES in auditRegistry.ts, which drives
   both the on-screen room cards and the PDF bodies (v2 segment audits + legacy rooms). */

const STATUS_BADGE_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  created: 'bg-indigo-100 text-indigo-700',
  follow_up: 'bg-indigo-100 text-indigo-700',
  call_na: 'bg-gray-100 text-gray-600',
  assigned: 'bg-indigo-100 text-indigo-700',
  callpending: 'bg-indigo-100 text-indigo-700',
  scheduled: 'bg-indigo-100 text-indigo-700',
  onway: 'bg-blue-100 text-blue-700',
  atsite: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  reschedule: 'bg-red-100 text-red-700',
};

function JobChip({ s }: { s: string }) {
  const st = JOB_STATUS[s] || { l: s, c: 'pending' };
  const color = STATUS_BADGE_COLORS[s] || 'bg-gray-100 text-gray-600';
  return <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${color}`}>{st.l}</span>;
}

async function genInstallPDF(order: any, sj: any, jobcard: any, installerName: string) {
  await loadBrandLogo();
  const doc: any = new jsPDF('p', 'pt', 'a4');
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40; let y = M;
  const navy = MD_INK, muted = MD_MUTED;
  const rooms = jobcard.rooms || [];
  function header() {
    y = mdPdfHeader(doc, { title: 'Installation Job Card', right: order.pi, M });
    return y;
  }
  header();
  y = mdInfoTable(doc, y, [['Proforma Invoice No.', order.pi || ''], ['Client Name', order.customer_name || ''], ['Client Mobile', order.phone || ''], ['Site Address', order.addr || ''], ['BM', order.bm || ''], ['Installer', installerName || '—'], ['Type', categoryFor(sj.type).pdfLabel], ['Date', fmtDateA(sj.date)]], M);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...navy); doc.text('Rooms installed', M, y + 4); y += 10;
  doc.autoTable(mdBrandGrid({ startY: y, margin: { left: M, right: M }, styles: { fontSize: 8.5, cellPadding: 4, lineColor: [210, 216, 225] }, head: [['#', 'Room', 'Category', 'SKU No.']], body: rooms.map((r: any, i: number) => [String(i + 1), r.name || '-', categoryFor(r.category || sj.type).pdfLabel, r.sku || '-']) }));
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    doc.addPage(); y = M; header();
    const cat = categoryFor(r.category || sj.type);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...navy); doc.text('Room ' + (i + 1) + ': ' + (r.name || '-'), M, y + 2); y += 14;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...muted); doc.text(cat.pdfLabel + '  ·  SKU: ' + (r.sku || '-'), M, y + 10); y += 24;
    y = await mdPdfInstallRoom(doc, r, y, { M, W, H, compress: compressForPdf, header: () => mdPdfHeader(doc, { title: 'Installation Job Card', right: order.pi, M }) });
  }
  doc.addPage(); y = M; header();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...navy); doc.text('Client Acknowledgement', M, y + 4); y += 26;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(40, 40, 40);
  doc.text(doc.splitTextToSize('I confirm that the installation for the above order has been carried out by the Material Depot installer, the rooms and products listed in this Job Card have been installed, and that I am satisfied with the service provided.', W - 2 * M), M, y); y += 58;
  const RI = jobcard.sign && jobcard.sign.ratings;
  if (RI) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...navy); doc.text('Client Feedback', M, y); y += 12;
    doc.autoTable({
      startY: y, margin: { left: M, right: M }, theme: 'grid', styles: { fontSize: 9, cellPadding: 4 }, columnStyles: { 0: { cellWidth: 260, fontStyle: 'bold', textColor: navy, fillColor: [238, 243, 249] } },
      body: [['Overall installation experience', String(RI.q1 || '—') + ' / 10'], ['Site Installer rating', String(RI.q2 || '—') + ' / 10'], ['Site cleanliness after installation', String(RI.q3 || '—') + ' / 10'], ...(RI.comments ? [['Comments', RI.comments]] : [])].filter(Boolean),
    });
    y = doc.lastAutoTable.finalY + 10;
  }
  doc.setFontSize(10); doc.setTextColor(...muted); doc.text('Client name: ' + ((jobcard.sign && jobcard.sign.name) || order.customer_name || ''), M, y); y += 18; doc.text('Date: ' + fmtDateA(sj.date), M, y);
  const sigW = 200, sigH = 80, sx = W - M - sigW, sy = H - M - sigH - 24;
  if (jobcard.sign && jobcard.sign.img) { const si = await compressForPdf(jobcard.sign.img); if (si) try { doc.addImage(si, 'JPEG', sx, sy - 10, sigW, sigH); } catch (e) { } }
  doc.setDrawColor(...muted); doc.setLineWidth(.8); doc.line(sx, sy + sigH - 6, sx + sigW, sy + sigH - 6);
  doc.setFontSize(9.5); doc.setTextColor(...muted); doc.text('Client signature', sx, sy + sigH + 10);
  doc.save(('Installation_' + (order.customer_name || 'client') + '_' + (order.pi || '') + '.pdf').replace(/[^a-z0-9_\-.]/gi, '_'));
}


function JdLog({ log }: { log: any[] }) {
  return (
    <>
      {(log || []).slice().reverse().slice(0, 10).map((l, i) => (
        <div key={i} className="py-2 border-t border-gray-100 first:border-t-0">
          <div className="text-[13px] text-gray-900">
            {l.who ? <><span className="font-bold text-gray-900">{l.who}</span>{' · '}</> : null}
            {l.t}
            {l.lat && l.lng ? <a href={`https://maps.google.com/?q=${l.lat},${l.lng}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-[11px] ml-1.5">📍 Map</a> : null}
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">{fmtLog(l.d)}{l.by === 'auto' ? ' · installer/auditor' : l.by === 'manual' ? ' · SM' : ''}</div>
          {l.arrivalPhoto ? <img src={l.arrivalPhoto} className="w-14 h-[42px] object-cover rounded mt-1 block cursor-pointer" onClick={(e) => window.open((e.target as HTMLImageElement).src)} alt="Arrival photo" /> : null}
        </div>
      ))}
    </>
  );
}

type JobDetailState = { loading: boolean; error: string | null; kind: 'audit' | 'install' | null; order: any; ticked: any; subjobs: any };

export function JobDetailModal({ pi, type, closeModal, attribution = JOBS_ATTRIBUTION, hideClose = false }: { pi: string; type: 'audit' | 'install'; closeModal: () => void; attribution?: string; hideClose?: boolean }) {
  const [state, setState] = useState<JobDetailState>({ loading: true, error: null, kind: null, order: null, ticked: null, subjobs: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (type === 'audit') {
          const rows = await sbGet('audit_orders?pi=eq.' + encodeURIComponent(pi) + '&select=*&limit=1');
          if (!alive) return;
          if (!Array.isArray(rows) || !rows[0]) { setState({ loading: false, error: 'notfound', kind: null, order: null, ticked: null, subjobs: null }); return; }
          const o = rows[0];
          setState({ loading: false, error: null, kind: 'audit', order: o, ticked: o.audit_ticked, subjobs: null });
        } else {
          const rows = await sbGet('install_orders?pi=eq.' + encodeURIComponent(pi) + '&select=*&limit=1');
          if (!alive) return;
          if (!Array.isArray(rows) || !rows[0]) { setState({ loading: false, error: 'notfound', kind: null, order: null, ticked: null, subjobs: null }); return; }
          const o = rows[0];
          setState({ loading: false, error: null, kind: 'install', order: o, ticked: null, subjobs: o.subjobs || [] });
        }
      } catch (e: any) { if (alive) setState({ loading: false, error: e.message || 'error', kind: null, order: null, ticked: null, subjobs: null }); }
    })();
    return () => { alive = false; };
  }, [pi, type]);

  const fdt = (ds: string | null) => { if (!ds) return '—'; const d = new Date(ds + 'T00:00'); return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };
  /* Stacked on a page (audit + install together) there is nothing to close back
     to, so the caller drops the button rather than showing a dead one. */
  const closeBtn = hideClose ? null : <button className="bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-md text-[13px] font-medium cursor-pointer hover:bg-gray-50" onClick={closeModal}>Close</button>;

  if (state.loading) return (
    <div className="flex items-center justify-center py-10">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#EAB308]" />
    </div>
  );
  if (state.error === 'notfound') return <div className="p-6 text-[13px] text-gray-400">Order not found.</div>;
  if (state.error) return <><div className="p-6 text-[13px] text-red-600">Error: {state.error}</div><div className="px-6 pb-5">{closeBtn}</div></>;

  if (state.kind === 'audit') {
    const o = state.order, at = state.ticked;
    const rooms = (at && at.rooms) || [];
    const hasSign = at && at.sign && at.sign.img;
    const isDraft = at && !Array.isArray(at) && at.draft && !hasSign;
    const hasCard = rooms.length || hasSign;
    /* Same SKU editor as the Audit Ops drawer — this modal is where an SM is
       already standing when they spot a card printing "SKU: NA". Saving swaps
       in the re-fetched audit_ticked, so the PDF button below picks it up
       without reopening. */
    const setTicked = (t: any) => setState((s) => ({ ...s, ticked: t }));
    const roomsEls = rooms.map((r: any, i: number) => (
      <div key={i}>
        <AuditRoomCard room={r} index={i} />
        <RoomSkuEditor room={r} save={auditRoomSkuSaver(String(o.id), i, attribution)} onSaved={setTicked} />
      </div>
    ));
    const signEl = hasSign ? <div className="text-[13px] mt-1.5">Signed by <b>{at.sign.name || '—'}</b>{at.sign.ratings ? <>{` · ⭐ ${at.sign.ratings.q1}/10 · 👤 ${at.sign.ratings.q2}/10 · 🧹 ${at.sign.ratings.q3 || '—'}/10`}</> : null}</div> : null;
    let jcSection;
    if (isDraft) jcSection = <div className="mt-4"><div className="text-xs font-bold uppercase tracking-wider text-yellow-700 mb-3 pb-2 border-b border-gray-100">⚠️ Job Card Draft — {rooms.length} room{rooms.length !== 1 ? 's' : ''} recorded, client sign-off not yet completed</div>{roomsEls}</div>;
    else if (rooms.length) jcSection = <div className="mt-4"><div className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3 pb-2 border-b border-gray-100">Job Card — {rooms.length} room{rooms.length !== 1 ? 's' : ''} audited</div>{roomsEls}{signEl}</div>;
    else jcSection = <div className="mt-4 text-[13px] text-gray-400">No job card data found for this order.</div>;
    return (
      <>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200"><div className="text-sm font-bold text-gray-900">{o.pi} · Site Audit</div><JobChip s={o.status} /></div>
        <div className="px-6 py-4 space-y-2">
          <div className="flex text-[13px]"><span className="w-28 shrink-0 text-gray-400">Customer</span><span><b>{o.customer_name || '—'}</b> · <a className="text-blue-600" href={'tel:' + (o.phone || '').replace(/\s/g, '')}>{o.phone || '—'}</a></span></div>
          <div className="flex text-[13px]"><span className="w-28 shrink-0 text-gray-400">Address</span><span>{o.addr || '—'}</span></div>
          <div className="flex text-[13px]"><span className="w-28 shrink-0 text-gray-400">BM</span><span>{o.bm || '—'}</span></div>
          <div className="flex text-[13px]"><span className="w-28 shrink-0 text-gray-400">Date / Slot</span><span>{fdt(o.date)} · {o.slot || '—'}</span></div>
          <div className="flex text-[13px]"><span className="w-28 shrink-0 text-gray-400">Auditor</span><span>{o.auditor_name || '—'}</span></div>
        </div>
        <div className="px-6"><AuditShadowers order={o} /></div>
        <div className="px-6">{jcSection}</div>
        <div className="flex gap-2 px-6 py-4 border-t border-gray-100">
          {hasCard ? <button className="bg-[#EAB308] text-white border-none px-4 py-2 rounded-md text-[13px] font-semibold cursor-pointer hover:opacity-90" onClick={() => genAuditPDF(o, at)}>{isDraft ? '📥 Download Draft PDF (missing signature)' : '📥 Download Job Card PDF'}</button> : null}
          {closeBtn}
        </div>
        {o.log && o.log.length ? <div className="px-6 pb-5"><div className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3 pb-2 border-b border-gray-100">Activity</div><div>{<JdLog log={o.log} />}</div></div> : null}
      </>
    );
  }

  const o = state.order, subjobs = state.subjobs;
  return (
    <>
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200"><div className="text-sm font-bold text-gray-900">{o.pi} · Installation</div><JobChip s={o.status} /></div>
      <div className="px-6 py-4 space-y-2">
        <div className="flex text-[13px]"><span className="w-28 shrink-0 text-gray-400">Customer</span><span><b>{o.customer_name || '—'}</b> · <a className="text-blue-600" href={'tel:' + (o.phone || '').replace(/\s/g, '')}>{o.phone || '—'}</a></span></div>
        <div className="flex text-[13px]"><span className="w-28 shrink-0 text-gray-400">Address</span><span>{o.addr || '—'}</span></div>
        <div className="flex text-[13px]"><span className="w-28 shrink-0 text-gray-400">BM</span><span>{o.bm || '—'}</span></div>
        <div className="flex text-[13px]"><span className="w-28 shrink-0 text-gray-400">Delivery</span><span>{fdt(o.delivery_date)}</span></div>
      </div>
      {subjobs.length === 0
        ? <div className="px-6 pb-4 text-[13px] text-gray-400">No sub-jobs created yet.</div>
        : subjobs.map((sj: any, si: number) => {
          const jc = sj.jobcard; const rooms = (jc && jc.rooms) || []; const hasSign = jc && jc.sign && jc.sign.img;
          const hasCard = rooms.length || hasSign;
          const asgns = sj.assignments && sj.assignments.length ? sj.assignments : (sj.installer_email ? [{ installer_email: sj.installer_email, installer_name: '—' }] : []);
          const names = asgns.map((a: any) => a.installer_name || a.installer_email || '—').join(', ');
          const typeLabel = categoryFor(sj.type).pdfLabel;
          const signEl = hasSign ? <div className="text-[13px] mt-1.5">Signed by <b>{jc.sign.name || '—'}</b>{jc.sign.ratings ? <>{` · ⭐ ${jc.sign.ratings.q1}/10 · 👤 ${jc.sign.ratings.q2}/10 · 🧹 ${jc.sign.ratings.q3 || '—'}/10`}</> : null}</div> : null;
          function dl() {
            const a2 = sj.assignments && sj.assignments.length ? sj.assignments : [];
            const primary = a2.find((a: any) => a.primary) || a2[0] || {};
            if (!sj.jobcard) return;
            genInstallPDF(o, sj, sj.jobcard, primary.installer_name || sj.installer_email || '—');
          }
          return (
            <div className="px-6 py-4 border-t border-gray-100" key={si}>
              <div className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3 pb-2 border-b border-gray-100 flex items-center gap-2">{typeLabel} · <JobChip s={sj.status} /></div>
              <div className="flex text-[13px]"><span className="w-28 shrink-0 text-gray-400">Installer(s)</span><span>{names}</span></div>
              {parseShadowers(sj.shadower_email, sj.shadower_name).length ? (
                <div className="flex text-[13px]"><span className="w-28 shrink-0 text-gray-400">Shadowed by</span><span className="text-purple-700 font-semibold">👁 {parseShadowers(sj.shadower_email, sj.shadower_name).map((x) => x.name).join(', ')}</span></div>
              ) : null}
              {rooms.length
                ? <div className="mt-2.5">
                    {rooms.map((r: any, i: number) => (
                      <div key={i}>
                        <InstallRoomCard room={r} index={i} />
                        {/* Swapping the saved jobcard back into state keeps the
                            PDF button below in sync without reopening. */}
                        <RoomSkuEditor
                          room={r}
                          save={installRoomSkuSaver(String(o.id), String(sj.id), i, attribution)}
                          onSaved={(card) => setState((s) => ({
                            ...s,
                            subjobs: (s.subjobs || []).map((x: any) => (String(x.id) === String(sj.id) ? { ...x, jobcard: card } : x)),
                          }))}
                        />
                      </div>
                    ))}
                    {signEl}
                  </div>
                : (!hasCard ? <div className="text-xs text-gray-400 mt-2">No job card data yet.</div> : <div className="text-xs text-yellow-700 mt-2">⚠️ Job card draft — not yet completed</div>)}
              {hasCard ? <div className="mt-3"><button className="bg-[#EAB308] text-white border-none px-3.5 py-2 rounded-md text-xs font-semibold cursor-pointer hover:opacity-90" onClick={dl}>📥 Download Job Card PDF</button></div> : null}
            </div>
          );
        })}
      <div className="flex gap-2 px-6 py-4 border-t border-gray-100">{closeBtn}</div>
      {o.log && o.log.length ? <div className="px-6 pb-5"><div className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3 pb-2 border-b border-gray-100">Activity</div><div>{<JdLog log={o.log} />}</div></div> : null}
    </>
  );
}

/* Audit-side "Shadowed by" — the only writable control in this otherwise
   read-only view. Installation shadowers are assigned in Install Ops (next to
   the installer assignment they belong to); audits have no assignment surface
   in this CRM, so they're edited here. Multiple shadowers of any role are
   allowed; they persist comma-joined on audit_orders. */
function AuditShadowers({ order: o }: { order: any }) {
  const [pool, setPool] = useState<ShadowerOption[]>([]);
  const [value, setValue] = useState<Shadower[]>(() => parseShadowers(o.shadower_email, o.shadower_name));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    let alive = true;
    sbGet('profiles?role=neq.store_staff&select=name,email,role&order=name').then((rows) => {
      if (alive && Array.isArray(rows)) setPool(rows.map((r: any) => ({ name: r.name, email: r.email, role: r.role })));
    });
    return () => { alive = false; };
  }, []);

  async function save() {
    setBusy(true); setMsg('');
    try {
      const prev = parseShadowers(o.shadower_email, o.shadower_name);
      const joined = joinShadowers(value);
      const prevSet = new Set(prev.map((s) => s.email)), nextSet = new Set(value.map((s) => s.email));
      const added = value.filter((s) => !prevSet.has(s.email)), removed = prev.filter((s) => !nextSet.has(s.email));
      const now = new Date().toISOString();
      const log = [...(o.log || [])];
      if (added.length) log.push({ t: 'Shadower(s) assigned: ' + added.map((s) => s.name).join(', ') + ' (observing this audit)', d: now, by: 'manual', who: 'Service Manager (CRM)' });
      if (removed.length) log.push({ t: 'Shadower(s) removed: ' + removed.map((s) => s.name).join(', '), d: now, by: 'manual', who: 'Service Manager (CRM)' });
      await sbPatch('audit_orders', String(o.id), { shadower_email: joined.email, shadower_name: joined.name, log });
      o.shadower_email = joined.email; o.shadower_name = joined.name; o.log = log;
      setMsg('Shadowers saved');
    } catch (e: any) {
      setMsg('Save failed — ' + (e?.message || 'try again'));
    }
    setBusy(false);
  }

  return (
    <div className="mt-3 rounded-lg border border-gray-200 p-3">
      <ShadowerSelect options={pool} value={value} onChange={setValue} label="Shadowed by (optional) — anyone observing this audit" />
      <div className="mt-2 flex items-center gap-2">
        <button disabled={busy} onClick={save} className="rounded-md bg-[#1F3A5F] px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save shadowers'}</button>
        {msg ? <span className="text-[11.5px] text-gray-500">{msg}</span> : null}
      </div>
    </div>
  );
}

/* ---- Jobs list view (verbatim, lines 787-912) ---- */
type Job = {
  id: string;
  type: 'audit' | 'install';
  customer: string;
  addr: string;
  assignee: string | null;
  status: string;
  date: string | null;
  installDates?: string[];
};

const FILTER_KEYS = ['all', 'audit', 'install', 'pending', 'assigned', 'scheduled', 'onway', 'atsite', 'completed', 'reschedule'];

export default function SiteAuditJobsView({ city = 'all' }: { city?: CityFilter } = {}) {
  const [loading, setLoading] = useState(true);
  const [realJobs, setRealJobs] = useState<Job[]>([]);
  const [jobsFilter, setJobsFilter] = useState('all');
  const [jobsDateFilter, setJobsDateFilter] = useState('');
  const [jobsSearch, setJobsSearch] = useState('');
  const [selectedJob, setSelectedJob] = useState<{ pi: string; type: 'audit' | 'install' } | null>(null);

  useEffect(() => {
    let alive = true;
    const nameMap: Record<string, string> = {};
    async function load() {
      const [auditRes, installRes, profileRes] = await Promise.all([
        sbGet('audit_orders?select=pi,customer_name,addr,auditor_name,auditor_email,status,date,city&status=not.in.(deleted,slot_reserved,slot_converted)&order=created_at.desc'),
        sbGet('install_orders_slim?select=pi,customer_name,addr,subjobs,status,delivery_date,city&status=neq.deleted&order=created_at.desc'),
        sbGet('profiles?select=name,email&role=neq.admin'),
      ]);
      if (!alive) return;
      if (Array.isArray(profileRes)) profileRes.forEach((p: any) => { nameMap[p.email] = p.name; });
      const jobs: Job[] = [];
      // City scope — the header toggle filters both job types by their own city.
      if (Array.isArray(auditRes)) {
        inCity(auditRes, city).forEach((r: any) => jobs.push({
          id: r.pi || '—', type: 'audit',
          customer: r.customer_name || '—', addr: r.addr || '—',
          assignee: r.auditor_name || (r.auditor_email ? nameMap[r.auditor_email] : null),
          status: r.status || 'pending', date: r.date || null,
        }));
      }
      if (Array.isArray(installRes)) {
        inCity(installRes, city).forEach((r: any) => {
          const emails = [...new Set((r.subjobs || []).flatMap((sj: any) => {
            if (sj.assignments && sj.assignments.length) return sj.assignments.map((a: any) => a.installer_email).filter(Boolean);
            return sj.installer_email ? [sj.installer_email] : [];
          }))] as string[];
          const installDates = [...new Set((r.subjobs || []).flatMap((sj: any) => {
            const asgns = sj.assignments && sj.assignments.length ? sj.assignments : (sj.installer ? [{ date: sj.date, mode: 'standard', dates: [] }] : []);
            return asgns.flatMap((a: any) => a.mode === 'custom' ? (a.dates || []) : (a.date ? [a.date] : []));
          }))] as string[];
          jobs.push({
            id: r.pi || '—', type: 'install',
            customer: r.customer_name || '—', addr: r.addr || '—',
            assignee: emails.length ? emails.map((e) => nameMap[e] || e.split('@')[0]).join(', ') : null,
            status: r.status || 'pending', date: r.delivery_date || null,
            installDates,
          });
        });
      }
      setRealJobs(jobs);
      setLoading(false);
    }
    setLoading(true);
    load();
    const tid = setInterval(() => { if (!document.hidden) load(); }, 30000);
    return () => { alive = false; clearInterval(tid); };
  }, [city]);

  const jc = useMemo(() => {
    const c = { total: realJobs.length, active: 0, done: 0, unassigned: 0 };
    realJobs.forEach((j) => {
      if (['assigned', 'onway', 'atsite', 'scheduled'].includes(j.status)) c.active++;
      if (j.status === 'completed') c.done++;
      if (!j.assignee) c.unassigned++;
    });
    return c;
  }, [realJobs]);

  const filtered = useMemo(() => realJobs.filter((j) => {
    if (jobsFilter === 'audit') return j.type === 'audit';
    if (jobsFilter === 'install') return j.type === 'install';
    if (JOB_STATUS[jobsFilter]) return j.status === jobsFilter;
    return true;
  }).filter((j) => {
    if (!jobsDateFilter) return true;
    if (j.type === 'audit') return j.date === jobsDateFilter;
    return (j.installDates || []).includes(jobsDateFilter);
  }).filter((j) => {
    if (!jobsSearch) return true;
    const q = jobsSearch.toLowerCase();
    return j.id.toLowerCase().includes(q) || j.customer.toLowerCase().includes(q);
  }), [realJobs, jobsFilter, jobsDateFilter, jobsSearch]);

  if (loading) {
    return (
      <>
        <div className="mb-4"><h1 className="text-xl font-bold text-gray-900">Jobs Overview</h1><p className="text-[13px] text-gray-400 mt-0.5">All audit and installation jobs across your team.</p></div>
        <div className="flex items-center justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#EAB308]" />
        </div>
      </>
    );
  }

  return (
    <>
      <div className="mb-4"><h1 className="text-xl font-bold text-gray-900">Jobs Overview</h1><p className="text-[13px] text-gray-400 mt-0.5">All audit and installation jobs across your team.</p></div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total Jobs</p><p className="mt-1 font-mono text-[22px] font-bold text-black">{jc.total}</p></div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Active Now</p><p className="mt-1 font-mono text-[22px] font-bold text-black">{jc.active}</p></div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Completed</p><p className="mt-1 font-mono text-[22px] font-bold text-black">{jc.done}</p></div>
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-3"><p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Unassigned</p><p className="mt-1 font-mono text-[22px] font-bold text-black">{jc.unassigned}</p></div>
      </div>
      {!realJobs.length ? (
        <div className="rounded-lg border border-gray-200 bg-white px-4 sm:px-6 py-4">
          <div className="text-center py-8">
            <div className="text-2xl mb-2">📋</div>
            <div className="text-[13px] text-gray-400">No jobs yet — orders will appear here once Service Managers start adding them.</div>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-x-auto">
          <div className="flex flex-wrap items-center gap-2 px-4 sm:px-6 py-3 border-b border-gray-100">
            <div className="relative" style={{ maxWidth: 280, minWidth: 180, flexShrink: 0 }}>
              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">🔍</span>
              <input type="text" placeholder="Search Enquiry ID or customer…" value={jobsSearch} onChange={(e) => setJobsSearch(e.target.value)} className="w-full pl-8 pr-3 py-2 text-[13px] border border-gray-200 rounded-md outline-none focus:border-yellow-400" />
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {FILTER_KEYS.map((f) => (
                <button
                  key={f}
                  className={jobsFilter === f
                    ? 'bg-[#1A1A1A] text-white px-3 py-1.5 rounded-full text-xs font-semibold'
                    : 'bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-full text-xs font-semibold'}
                  onClick={() => setJobsFilter(f)}
                >
                  {f === 'all' ? 'All Jobs' : f === 'audit' ? 'Audit' : f === 'install' ? 'Install' : JOB_STATUS[f]?.l || f}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 ml-auto shrink-0">
              <input
                type="date"
                value={jobsDateFilter}
                title="Filter by scheduled date"
                onChange={(e) => setJobsDateFilter(e.target.value)}
                className={`border rounded-md px-2.5 py-1.5 text-[13px] font-semibold outline-none cursor-pointer bg-white ${jobsDateFilter ? 'border-yellow-400 text-gray-900' : 'border-gray-200 text-gray-400'}`}
              />
              {jobsDateFilter && <button onClick={() => setJobsDateFilter('')} className="border-0 bg-red-100 text-red-600 rounded-md px-2.5 py-1.5 font-bold text-xs cursor-pointer whitespace-nowrap">✕ Clear date</button>}
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Job ID</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Type</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Customer</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Location</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Assigned To</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Status</th>
                <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap">Date</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length ? filtered.map((j, i) => (
                <tr key={i} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedJob({ pi: j.id, type: j.type })}>
                  <td className="px-3 py-2.5 text-[13px] border-t border-gray-100"><b className="font-mono text-xs text-gray-900">{j.id}</b></td>
                  <td className="px-3 py-2.5 text-[13px] border-t border-gray-100"><span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${j.type === 'audit' ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'}`}>{j.type === 'audit' ? 'Audit' : 'Install'}</span></td>
                  <td className="px-3 py-2.5 text-[13px] border-t border-gray-100"><b>{j.customer}</b></td>
                  <td className="px-3 py-2.5 text-[13px] border-t border-gray-100 text-gray-400">{j.addr}</td>
                  <td className="px-3 py-2.5 text-[13px] border-t border-gray-100">{j.assignee || <span className="text-red-600 font-semibold">Unassigned</span>}</td>
                  <td className="px-3 py-2.5 text-[13px] border-t border-gray-100"><JobChip s={j.status} /></td>
                  <td className="px-3 py-2.5 text-[13px] border-t border-gray-100 text-gray-400">{j.date || '—'}</td>
                </tr>
              )) : <tr><td colSpan={7} className="border-t border-gray-100"><div className="text-center py-8"><div className="text-2xl mb-2">🔍</div><div className="text-[13px] text-gray-400">No jobs match this filter</div></div></td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {selectedJob && (
        <div className="fixed inset-0 bg-black/30 z-[900] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) setSelectedJob(null); }}>
          <div className="bg-white rounded-lg shadow-xl border border-gray-200 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
            <JobDetailModal pi={selectedJob.pi} type={selectedJob.type} closeModal={() => setSelectedJob(null)} />
          </div>
        </div>
      )}
    </>
  );
}
