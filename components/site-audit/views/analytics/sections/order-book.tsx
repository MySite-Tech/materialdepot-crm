'use client';

import { mdFetch } from '@/lib/api';
import { CityFilter, sbGetLong } from '../../../shared';
import { DrillModal } from './drill';
import { Drill, DrillRow } from '../types';
import { useEffect, useState } from 'react';

/* The order book (Metabase) and this tab never count the same thing: the order book counts
   ORDERS on the day they were PLACED, this tab counts VISITS on the day they HAPPENED. This card
   puts the order book's own number next to ours for the selected range and says, order by order,
   whether each one reached the ops database — so a gap can be explained instead of argued about. */

type Kind = 'audit' | 'install';
type BookOrder = { id: number; pi: string; date: string; city: string; store: string; client: string; lines: Array<{ cat: string }> };
type CrmRow = { pi: string; status: string };
type Loaded = { book: BookOrder[]; crm: Record<Kind, Map<string, string[]>>; hasPi: boolean };

// A rescheduled job is re-keyed "<pi>-R" (sometimes "-R-R"), so compare on the bare enquiry id.
const leadKey = (pi: unknown) => String(pi || '').trim().replace(/(\s*-\s*(R|\d+))+$/i, '');

function index(rows: CrmRow[] | null): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const r of rows || []) {
    const k = leadKey(r.pi);
    if (!k) continue;
    m.set(k, [...(m.get(k) || []), String(r.status)]);
  }
  return m;
}

const CAT: Record<Kind, string> = { audit: 'site_audit', install: 'installation' };
const LABEL: Record<Kind, string> = { audit: 'Site Audit', install: 'Site Installation' };

export function OrderBookReconcile({ from, to, city, crmAudits, crmAttempts }: { from: string; to: string; city: CityFilter; crmAudits: number; crmAttempts: number }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: Loaded | null; key: string }>({ loading: false, error: null, data: null, key: '' });
  const [drill, setDrill] = useState<Drill | null>(null);
  const key = from + '|' + to;

  useEffect(() => {
    if (!open || state.key === key) return;
    let alive = true;
    setState({ loading: true, error: null, data: null, key });
    (async () => {
      try {
        const [ds, audits, installs] = await Promise.all([
          mdFetch(`/crm/cat-analytics/?from=${from}&to=${to}`),
          // Deleted rows included on purpose: "deleted in CRM" and "never imported" are different answers.
          sbGetLong('audit_orders?select=pi,status'),
          sbGetLong('install_orders?select=pi,status'),
        ]);
        if (!ds || !Array.isArray(ds.orders)) throw new Error('the order-book API returned an unexpected shape');
        const book = (ds.orders as BookOrder[]).filter((o) => o.date >= from && o.date <= to);
        if (alive)
          setState({
            loading: false,
            error: null,
            key,
            data: { book, crm: { audit: index(audits), install: index(installs) }, hasPi: book.length === 0 || book.some((o) => !!o.pi) },
          });
      } catch (e: any) {
        if (alive) setState({ loading: false, error: (e && e.message) || 'request failed', data: null, key });
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, key, from, to, state.key]);

  const data = state.data;
  const summary = (kind: Kind) => {
    if (!data) return null;
    const orders = data.book.filter((o) => (city === 'all' || o.city === city) && o.lines.some((l) => l.cat === CAT[kind]));
    const rows: DrillRow[] = orders.map((o) => {
      const statuses = data.crm[kind].get(leadKey(o.pi)) || [];
      const live = statuses.filter((s) => s !== 'deleted');
      const hit = !data.hasPi ? 'na' : live.length ? 'yes' : statuses.length ? 'na' : 'no';
      const result = !data.hasPi
        ? 'Order book has no enquiry id yet — backend update pending'
        : live.length
          ? '✓ In CRM — ' + live.join(', ')
          : statuses.length
            ? '● Deleted in CRM'
            : '✗ Not in CRM';
      return { pi: o.pi || '#' + o.id, customer: '—', phone: o.client || '', bm: o.store, person: '—', slot: '', date: o.date, result, hit };
    });
    const n = (h: DrillRow['hit']) => rows.filter((r) => r.hit === h).length;
    return { rows, inCrm: n('yes'), missing: n('no'), deleted: data.hasPi ? n('na') : 0 };
  };

  const openDrill = (kind: Kind) => {
    const s = summary(kind);
    if (!s) return;
    setDrill({
      title: LABEL[kind] + ' — order book vs CRM',
      note: 'Confirmed orders (cancelled and lost excluded) carrying a ' + LABEL[kind] + ' line, by order-placed date ' + from + ' to ' + to + '. Green = the order reached the CRM; red = never imported; grey = imported, then deleted in the CRM.',
      summary: `${s.rows.length} order(s) · ${s.inCrm} in CRM · ${s.missing} not in CRM · ${s.deleted} deleted in CRM`,
      rows: s.rows,
    });
  };

  const Stat = ({ v, l, c }: { v: number | string; l: string; c?: string }) => (
    <div className="min-w-[92px]">
      <div className={'text-[20px] font-bold ' + (c || 'text-black')}>{v}</div>
      <div className="text-[11px] uppercase tracking-wide text-gray-500">{l}</div>
    </div>
  );

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {drill ? <DrillModal drill={drill} onClose={() => setDrill(null)} /> : null}
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <span className="text-[15px] font-bold text-black">Reconcile with order book (Metabase)</span>
        <span className="text-[12px] text-gray-500">{open ? 'Hide' : 'Show'} — why this tab and Metabase disagree, order by order</span>
      </button>
      {open ? (
        <div className="space-y-4 border-t border-gray-100 px-5 py-4">
          <p className="text-[12.5px] leading-relaxed text-gray-500">
            Metabase counts <b>orders on the day they were placed</b>. This tab counts <b>visits on the day they happened</b> — and installation counts one
            attempt per job per scheduled day. So the two only match over long ranges, and installations never match exactly. Below, the order book&apos;s own count for this
            range, and whether each of those orders reached the CRM. Click a row to see the orders.
          </p>
          {state.loading ? <div className="text-[13px] text-gray-400">Loading order book…</div> : null}
          {state.error ? <div className="text-[13px] font-semibold text-red-600">⚠ Could not load the order book — {state.error}</div> : null}
          {data && !data.hasPi ? (
            <div className="text-[12.5px] font-semibold text-amber-600">
              The order book is not sending enquiry ids yet, so only totals are shown. The per-order match turns on once the backend update is deployed.
            </div>
          ) : null}
          {data
            ? (['audit', 'install'] as Kind[]).map((kind) => {
                const s = summary(kind)!;
                return (
                  <div
                    key={kind}
                    role="button"
                    tabIndex={0}
                    onClick={() => openDrill(kind)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openDrill(kind)}
                    className="flex cursor-pointer flex-wrap items-center gap-x-8 gap-y-3 rounded-lg border border-gray-200 px-4 py-3 transition hover:border-gray-400 hover:shadow-sm"
                  >
                    <div className="w-[150px] text-[13px] font-bold text-black">{LABEL[kind]}</div>
                    <Stat v={s.rows.length} l="Orders placed (Metabase)" />
                    {data.hasPi ? (
                      <>
                        <Stat v={s.inCrm} l="In CRM" c="text-green-600" />
                        <Stat v={s.missing} l="Not in CRM" c={s.missing ? 'text-red-600' : 'text-gray-400'} />
                        <Stat v={s.deleted} l="Deleted in CRM" c="text-gray-500" />
                      </>
                    ) : null}
                    <Stat v={kind === 'audit' ? crmAudits : crmAttempts} l={kind === 'audit' ? 'Audits visited (this tab)' : 'Install attempts (this tab)'} c="text-gray-700" />
                  </div>
                );
              })
            : null}
        </div>
      ) : null}
    </div>
  );
}
