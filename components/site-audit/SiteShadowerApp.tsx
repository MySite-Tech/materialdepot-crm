'use client';

/* "My Shadowing" — port of material-depot-site's Site_Shadower_App.html.

   A read-only schedule of the sites this person has been assigned to shadow
   (observe), across BOTH audits (audit_orders.shadower_email) and
   installation sub-jobs (install_orders.subjobs[].shadower_email). There is
   deliberately no job card and no attendance here: a shadower only tags
   along, so nothing in this view writes.

   Shadowing is cross-role — anyone registered can be picked to shadow
   anything — so unlike SiteAuditorApp/SiteInstallerApp this view is not
   gated on a role, only on which person it is rendered for. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchSharedSlotLabels, fmtDateA, parseShadowers, sbGet } from './siteAuditShared';
import { typeTag } from './auditRegistry';

const AUDIT_COLS = 'id,pi,skus,bm,customer_name,phone,addr,status,slot,date,auditor_name,shadower_email,shadower_name';
const INSTALL_COLS = 'id,pi,bm,customer_name,phone,addr,status,subjobs';

const STATUS_LABEL: Record<string, { l: string; c: string }> = {
  pending: { l: 'Pending', c: 'bg-gray-100 text-gray-600' },
  created: { l: 'Service Created', c: 'bg-gray-100 text-gray-600' },
  scheduled: { l: 'Scheduled', c: 'bg-sky-100 text-sky-700' },
  assigned: { l: 'Assigned', c: 'bg-sky-100 text-sky-700' },
  callpending: { l: 'Call Pending', c: 'bg-amber-100 text-amber-700' },
  reschedule: { l: 'To Reschedule', c: 'bg-red-100 text-red-700' },
  call_na: { l: 'Call not picked', c: 'bg-amber-100 text-amber-700' },
  onway: { l: 'On The Way', c: 'bg-blue-100 text-blue-700' },
  atsite: { l: 'At Site', c: 'bg-indigo-100 text-indigo-700' },
  partial: { l: 'Partially Completed', c: 'bg-teal-100 text-teal-700' },
  deliv_ontime: { l: 'Delivery on time', c: 'bg-sky-100 text-sky-700' },
  deliv_delayed: { l: 'Delivery delayed', c: 'bg-amber-100 text-amber-700' },
  completed: { l: 'Completed', c: 'bg-green-100 text-green-700' },
};

type ShadowJob = {
  kind: 'audit' | 'install';
  id: string;
  pi: string;
  name: string;
  phone: string;
  addr: string;
  bm: string;
  date: string | null;
  slot: string | null;
  status: string;
  skus: string[];
  shadowingName: string;
  type: string;
};

function dstr(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function mapUrl(a: string) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a);
}
/* Slot ids (sf1/sw2/…) mean whatever the audit and install dashboards have
   them configured as, so resolve against those saved windows rather than
   assuming the stock three. Audit and install keep separate configs and reuse
   the same ids, hence two maps. Falls back to the stock windows when a
   dashboard has never customised them (or on a device that never opened one). */
const DEF_WINDOWS = ['9 AM – 12 PM', '12 PM – 3 PM', '3 PM – 6 PM'];

function readSlotMap(flKey: string, wpKey: string): Record<string, string> {
  const m: Record<string, string> = {};
  if (typeof window === 'undefined') return m;
  for (const key of [flKey, wpKey]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) for (const s of parsed) if (s && s.id && s.label) m[s.id] = s.label;
    } catch {
      /* malformed local override — the numeric fallback below still applies */
    }
  }
  return m;
}

function slotLabel(id: string | null | undefined, map: Record<string, string>): string {
  if (!id) return '—';
  if (map[id]) return map[id];
  if (/^\d{1,2}:\d{2}$/.test(id)) {
    const [h, m] = id.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  }
  const n = Number(String(id).slice(-1));
  return DEF_WINDOWS[n - 1] || '—';
}

/* A shadowed install sub-job's date/slot/installer comes from its (primary)
   assignment, falling back to the sub-job's own fields. */
function sjSched(sj: any): { date: string | null; slot: string | null; who: string } {
  const a = sj.assignments && sj.assignments.length ? sj.assignments.find((x: any) => x.primary) || sj.assignments[0] : null;
  return {
    date: (a && a.date) || sj.date || null,
    slot: (a && a.slots && a.slots[0]) || sj.slot || null,
    who: (a && a.installer_name) || sj.installer_name || 'Unassigned',
  };
}

export default function SiteShadowerApp({ actingAs }: { actingAs: { name: string; email: string } }) {
  const [jobs, setJobs] = useState<ShadowJob[]>([]);
  const [loading, setLoading] = useState(true);
  const today = useMemo(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; }, []);
  const [auditSlots, setAuditSlots] = useState<Record<string, string>>(() => readSlotMap('md_audit_slots_fl', 'md_audit_slots_wp'));
  const [installSlots, setInstallSlots] = useState<Record<string, string>>(() => readSlotMap('md_install_slots_fl', 'md_install_slots_wp'));
  /* A shadower's own phone has no copy of the office's slot config, so pull the
     shared copy the dashboards publish. Local wins where it exists. */
  useEffect(() => {
    let alive = true;
    fetchSharedSlotLabels(['md_audit_slots_fl', 'md_audit_slots_wp'])
      .then((m) => { if (alive && Object.keys(m).length) setAuditSlots((cur) => ({ ...m, ...cur })); })
      .catch(() => { /* stock windows remain */ });
    fetchSharedSlotLabels(['md_install_slots_fl', 'md_install_slots_wp'])
      .then((m) => { if (alive && Object.keys(m).length) setInstallSlots((cur) => ({ ...m, ...cur })); })
      .catch(() => { /* stock windows remain */ });
    return () => { alive = false; };
  }, []);
  const [selDay, setSelDay] = useState(() => dstr(new Date()));

  const load = useCallback(async () => {
    const me = (actingAs.email || '').toLowerCase();
    const mine = (emailStr?: string | null) => parseShadowers(emailStr).some((s) => s.email.toLowerCase() === me);
    const [aRows, iRows] = await Promise.all([
      // A comma-joined shadower_email can't be matched with eq — fetch all
      // shadowed audits and filter client-side (same as the source app).
      sbGet('audit_orders?shadower_email=not.is.null&select=' + AUDIT_COLS + '&status=neq.deleted&order=created_at.desc'),
      // The install shadower lives inside the subjobs jsonb, which PostgREST
      // can't cheaply filter on — fetch non-deleted orders (slim strips
      // photos) and match sub-jobs client-side.
      sbGet('install_orders_slim?select=' + INSTALL_COLS + '&status=neq.deleted&order=created_at.desc'),
    ]);
    const out: ShadowJob[] = [];
    if (Array.isArray(aRows)) {
      aRows.forEach((r: any) => {
        if (!mine(r.shadower_email)) return;
        out.push({
          kind: 'audit', id: String(r.id), pi: r.pi || '', name: r.customer_name || '', phone: r.phone || '',
          addr: r.addr || '', bm: r.bm || '', date: r.date || null, slot: r.slot || null, status: r.status,
          skus: (r.skus || []).filter((s: any) => !s.audit && s.c).map((s: any) => s.c),
          shadowingName: r.auditor_name || '', type: '',
        });
      });
    }
    if (Array.isArray(iRows)) {
      iRows.forEach((r: any) => {
        (r.subjobs || []).forEach((sj: any) => {
          if (!sj || !mine(sj.shadower_email)) return;
          const s = sjSched(sj);
          out.push({
            kind: 'install', id: String(r.id), pi: r.pi || '', name: r.customer_name || '', phone: r.phone || '',
            addr: r.addr || '', bm: r.bm || '', date: s.date, slot: s.slot, status: sj.status || r.status,
            skus: (sj.items || []).map((it: any) => it.sku).filter(Boolean),
            shadowingName: s.who, type: sj.type || '',
          });
        });
      });
    }
    setJobs(out);
    setLoading(false);
  }, [actingAs.email]);

  useEffect(() => {
    load();
    const tid = setInterval(() => { if (!document.hidden) load(); }, 30000);
    const vis = () => { if (!document.hidden) load(); };
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(tid); document.removeEventListener('visibilitychange', vis); };
  }, [load]);

  const todayStr = dstr(today);
  const days = useMemo(() => Array.from({ length: 37 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + (i - 30));
    return d;
  }), [today]);

  const dayJobs = jobs.filter((o) => o.date === selDay).sort((a, b) => (a.slot || '').localeCompare(b.slot || ''));
  const todo = dayJobs.filter((o) => o.status !== 'completed');
  const done = dayJobs.filter((o) => o.status === 'completed');
  const unscheduled = jobs.filter((o) => !o.date && !['completed', 'reschedule'].includes(o.status));

  function Card({ o, unsched }: { o: ShadowJob; unsched: boolean }) {
    const st = STATUS_LABEL[o.status] || { l: o.status, c: 'bg-gray-100 text-gray-600' };
    return (
      <div className={`rounded-xl border border-gray-200 bg-white p-3.5 mb-3 border-l-4 ${unsched ? 'border-l-amber-500' : 'border-l-teal-600'}`}>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 truncate font-bold text-[15px] text-gray-900">{o.name || '—'}</div>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap ${st.c}`}>{st.l}</span>
        </div>
        <div className="mt-1 font-mono text-[11px] text-gray-400 flex items-center gap-2 flex-wrap">
          <span>{o.pi} · BM {o.bm || '—'}</span>
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-extrabold tracking-wide ${o.kind === 'install' ? 'bg-teal-50 text-teal-700' : 'bg-sky-50 text-sky-700'}`}>
            {o.kind === 'install' ? 'INSTALL' + (o.type ? ' · ' + typeTag(o.type) : '') : 'AUDIT'}
          </span>
        </div>
        <div className="mt-2 space-y-1 text-[13px] text-gray-500">
          <div className="flex gap-2"><span className="w-4 text-center opacity-70">📱</span><a className="truncate text-blue-600" href={'tel:' + o.phone.replace(/\s/g, '')}>{o.phone || '—'}</a></div>
          <div className="flex gap-2"><span className="w-4 text-center opacity-70">📍</span><a className="truncate text-blue-600" href={mapUrl(o.addr)} target="_blank" rel="noopener noreferrer">{o.addr || '—'}</a></div>
        </div>
        {o.shadowingName ? <span className="mt-2 inline-block rounded bg-purple-50 px-2 py-0.5 text-[11.5px] font-bold text-purple-700">👁 Shadowing: {o.shadowingName}</span> : null}
        {o.skus.length ? <span className="mt-2 ml-1.5 inline-block rounded bg-teal-50 px-2 py-0.5 text-[11.5px] font-bold text-teal-700">📦 {o.skus.join(', ')}</span> : null}
        <hr className="my-2.5 border-gray-100" />
        <div className={`text-[12.5px] font-bold ${unsched ? 'text-amber-700' : 'text-gray-500'}`}>
          {unsched ? 'Awaiting date from office' : fmtDateA(o.date) + ' · ' + slotLabel(o.slot, o.kind === 'install' ? installSlots : auditSlots)}
        </div>
        <a className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-teal-50 py-2 text-[12.5px] font-bold text-teal-700" href={mapUrl(o.addr)} target="_blank" rel="noopener noreferrer">📍 Directions</a>
      </div>
    );
  }

  return (
    <div className="max-w-[560px]">
      <div className="mb-3.5 rounded-lg border border-amber-200 border-l-4 border-l-amber-500 bg-amber-50 px-3 py-2.5 text-[12.5px] font-semibold text-amber-800">
        👁 Read-only schedule of the sites {actingAs.name || 'this person'} is assigned to shadow (audits and installations). No job card or attendance — just go along and observe.
      </div>

      <div className="mb-3.5 flex gap-2 overflow-x-auto pb-1">
        {days.map((d) => {
          const ds = dstr(d);
          const n = jobs.filter((o) => o.date === ds).length;
          const on = selDay === ds;
          return (
            <button
              key={ds}
              onClick={() => setSelDay(ds)}
              className={`shrink-0 w-[88px] rounded-xl border px-2 py-2.5 text-center ${on ? 'border-[#1F3A5F] bg-[#1F3A5F] text-white' : 'border-gray-200 bg-white text-gray-700'}`}
            >
              <div className="text-[11px] font-bold opacity-80">{ds === todayStr ? 'Today' : d.toLocaleDateString('en-IN', { weekday: 'short' })}</div>
              <div className="text-[18px] font-extrabold">{d.getDate()}</div>
              <div className="text-[10px] opacity-75">{n > 0 ? n + (n !== 1 ? ' jobs' : ' job') : ''}</div>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#EAB308]" /></div>
      ) : (
        <>
          {unscheduled.length ? (
            <>
              <div className="mb-2 mt-3.5 text-[11px] font-extrabold uppercase tracking-wide text-amber-700">Awaiting schedule — no date set yet</div>
              {unscheduled.map((o, i) => <Card key={'u' + i} o={o} unsched />)}
            </>
          ) : null}
          <div className="mb-2 mt-3.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-400">
            {selDay === todayStr ? 'Today' : 'Jobs'} — {fmtDateA(selDay)}
          </div>
          {todo.length ? todo.map((o, i) => <Card key={'t' + i} o={o} unsched={false} />) : (
            <div className="py-10 text-center text-[13px] text-gray-400">No sites to shadow for this day.</div>
          )}
          {done.length ? (
            <>
              <div className="mb-2 mt-3.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-400">Completed</div>
              {done.map((o, i) => <Card key={'d' + i} o={o} unsched={false} />)}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
