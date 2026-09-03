'use client';

/* Add Order / Pending POs / Raise Rectification / Add Staff — ports of the four
   modals in SM_Audit_Dashboard.html. Pending POs calls this CRM's own
   /api/site-audit/install-pos route (the Django SiteAuditInstallationPOListAPI)
   with type=site_audit, same as the legacy app's /api/pos rewrite. */

import { useEffect, useRef, useState } from 'react';
import { CITIES, sbGet, sbPatch, sbPost } from '../siteAuditShared';
import { getToken } from '@/lib/mockApi';
import { AUDIT_SKU, type AuditOrder } from './shared';

type BmOption = { name: string; email?: string; contact?: string };

const inputCls = 'w-full rounded-md border border-gray-200 px-2.5 py-2 text-[13px] outline-none focus:border-blue-400';

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[940] flex items-center justify-center bg-black/30 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`max-h-[90vh] w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} overflow-y-auto rounded-lg bg-white shadow-xl`}>
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <button className="text-xl text-gray-400" onClick={onClose}>×</button>
        </div>
        <div className="flex flex-col gap-3 px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="mb-1 block text-[11px] font-semibold text-gray-500">{label}</label>{children}</div>;
}

/* ── Add order ────────────────────────────────────────────────────────── */
export interface AoState { pi: string; po: string; name: string; phone: string; addr: string; bm: string; city: string }
export const EMPTY_AO: AoState = { pi: '', po: '', name: '', phone: '', addr: '', bm: '', city: CITIES[0] };

const CATEGORY_TICKS: Array<[string, string]> = [
  ['Wooden Flooring', 'fl'],
  ['Standard Wallpapers', 'wp'],
  ['Custom Wallpapers', 'cwp'],
  ['CNC', 'cnc'],
  ['Wall Panels', 'wpnl'],
];

export function AddOrderOverlay({
  open, ao, setAo, skuText, setSkuText, ticks, setTicks, bmOptions, orders, attribution, note, onClose, onSaved, toast,
}: {
  open: boolean; ao: AoState; setAo: (fn: (p: AoState) => AoState) => void;
  skuText: string; setSkuText: (v: string) => void;
  ticks: Record<string, boolean>; setTicks: (fn: (p: Record<string, boolean>) => Record<string, boolean>) => void;
  bmOptions: BmOption[]; orders: AuditOrder[]; attribution: string; note: boolean;
  onClose: () => void; onSaved: () => Promise<void>; toast: (m: string) => void;
}) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (!open) return null;
  const set = (f: keyof AoState, v: string) => setAo((p) => ({ ...p, [f]: v }));

  async function submit() {
    const pi = ao.pi.trim(), name = ao.name.trim(), phone = ao.phone.trim(), addr = ao.addr.trim();
    setErr('');
    if (!pi) { setErr('PI Number is required.'); return; }
    if (!name) { setErr('Customer name is required.'); return; }
    if (!phone) { setErr('Customer phone is required.'); return; }
    if (!addr) { setErr('Address is required.'); return; }
    if (orders.find((o) => o.pi === pi)) { setErr('An order with this PI number already exists.'); return; }

    const po = ao.po.trim() ? ao.po.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const skus = skuText.trim() ? skuText.split(',').map((s) => s.trim()).filter(Boolean).map((c) => ({ c, n: c, audit: false })) : [];
    skus.push({ c: AUDIT_SKU, n: 'Site Audit', audit: true });

    // Auto-detect the audited categories from the SKU codes when the boxes
    // weren't ticked manually — same heuristics as the source.
    const up = skuText.toUpperCase();
    const ticked: string[] = [];
    if (ticks.fl || up.includes('WF-') || up.includes('FLOOR')) ticked.push('Wooden Flooring');
    if (ticks.wp || up.includes('WP-') || up.includes('WALL')) ticked.push('Standard Wallpapers');
    if (ticks.cwp || up.includes('CWP-') || up.includes('CUSTOM')) ticked.push('Custom Wallpapers');
    if (ticks.cnc) ticked.push('CNC');
    if (ticks.wpnl) ticked.push('Wall Panels');

    const bmMatch = bmOptions.find((b) => (b.email || b.name) === ao.bm);
    const payload: Record<string, any> = {
      pi, po: po.join(','), skus, audit_ticked: ticked,
      bm: (bmMatch ? bmMatch.name : ao.bm.trim()) || '—',
      customer_name: name, phone, addr, status: 'pending', city: ao.city,
      log: [{ t: 'Order added manually by ' + attribution, d: new Date().toISOString() }],
      created_by_email: attribution,
      ...(bmMatch?.email ? { bm_email: bmMatch.email } : {}),
    };

    setBusy(true);
    try {
      // A unique constraint on `pi` blocks re-inserting even a deleted row, so
      // update in place when one already exists.
      const existing = await sbGet('audit_orders?select=id&pi=eq.' + encodeURIComponent(pi) + '&limit=1').catch(() => []);
      const id = Array.isArray(existing) && existing.length ? existing[0].id : null;
      if (id) await sbPatch('audit_orders', String(id), payload);
      else await sbPost('audit_orders', payload);
      await onSaved();
      toast('✓ Audit order ' + pi + ' saved');
      onClose();
    } catch (e: any) {
      setErr('Save failed: ' + (e?.message || 'unknown error'));
    }
    setBusy(false);
  }

  return (
    <Modal title="Add New Audit Order" onClose={onClose}>
      {note ? <div className="rounded-md border-l-4 border-blue-400 bg-blue-50 px-3 py-2.5 text-[12px] text-[#1F3A5F]">Pre-filled from the backend — verify the PI number, address and details before saving.</div> : null}
      <div className="grid grid-cols-2 gap-3">
        <Field label="PI Number *"><input value={ao.pi} onChange={(e) => set('pi', e.target.value)} placeholder="ENQ…" className={inputCls} /></Field>
        <Field label="PO numbers"><input value={ao.po} onChange={(e) => set('po', e.target.value)} placeholder="comma separated" className={inputCls} /></Field>
      </div>
      <Field label="Customer name *"><input value={ao.name} onChange={(e) => set('name', e.target.value)} className={inputCls} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone *"><input value={ao.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} /></Field>
        <Field label="City"><select value={ao.city} onChange={(e) => set('city', e.target.value)} className={inputCls}>{CITIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></Field>
      </div>
      <Field label="Address *"><input value={ao.addr} onChange={(e) => set('addr', e.target.value)} className={inputCls} /></Field>
      <Field label="BM / Sales person">
        {bmOptions.length
          ? (
            <select value={ao.bm} onChange={(e) => set('bm', e.target.value)} className={inputCls}>
              <option value="">— Select a BM —</option>
              {bmOptions.map((b) => <option key={b.email || b.name} value={b.email || b.name}>{b.name}</option>)}
            </select>
          )
          : <input value={ao.bm} onChange={(e) => set('bm', e.target.value)} placeholder="Name" className={inputCls} />}
      </Field>
      <Field label="SKUs in cart (comma separated, excluding the audit SKU)">
        <input value={skuText} onChange={(e) => setSkuText(e.target.value)} placeholder="WF-OAK-12MM, WP-FLORAL-01" className={inputCls} />
      </Field>
      <Field label="Audit ticked for">
        <div className="flex flex-wrap gap-2">
          {CATEGORY_TICKS.map(([label, key]) => (
            <label key={key} className="flex items-center gap-1.5 rounded-md border border-gray-200 px-2.5 py-1.5 text-[12.5px]">
              <input type="checkbox" className="accent-[#1F3A5F]" checked={!!ticks[key]} onChange={(e) => setTicks((p) => ({ ...p, [key]: e.target.checked }))} />
              {label}
            </label>
          ))}
        </div>
      </Field>
      {err ? <div className="rounded-md bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-600">{err}</div> : null}
      <div className="-mx-5 -mb-4 mt-1 flex justify-end gap-2 border-t border-gray-100 px-5 py-3.5">
        <button onClick={onClose} className="rounded-md border border-gray-200 bg-white px-4 py-2 text-[13px] font-semibold text-gray-700">Cancel</button>
        <button disabled={busy} onClick={submit} className="rounded-md bg-[#1F3A5F] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save order'}</button>
      </div>
    </Modal>
  );
}

/* ── Pending POs (backend import) ─────────────────────────────────────── */
export function KylasOverlay({
  open, orders, onClose, onUse,
}: {
  open: boolean; orders: AuditOrder[]; onClose: () => void; onUse: (row: any) => void;
}) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    async function load(search: string) {
      setRows(null); setErr('');
      try {
        const params = new URLSearchParams({ type: 'site_audit', page_size: '100' });
        if (search) params.set('search', search);
        const token = getToken();
        const res = await fetch('/api/site-audit/install-pos?' + params.toString(), {
          headers: token ? { Authorization: 'Bearer ' + token } : undefined,
        });
        const data = await res.json();
        if (!alive) return;
        if (data.error) { setErr(data.error); setRows([]); return; }
        setRows(data.results || []);
      } catch (e: any) {
        if (alive) { setErr(e?.message || 'Could not load pending POs'); setRows([]); }
      }
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => load(q.trim()), q ? 400 : 0);
    return () => { alive = false; if (timer.current) clearTimeout(timer.current); };
  }, [open, q]);

  if (!open) return null;
  const known = new Set(orders.map((o) => o.pi));
  const list = rows || [];
  const fresh = list.filter((r) => !known.has(r.estimate_lead_id));
  const done = list.filter((r) => known.has(r.estimate_lead_id));

  function Card({ r, already }: { r: any; already: boolean }) {
    return (
      <div className={`mb-2 rounded-lg border p-3 ${already ? 'border-gray-100 bg-gray-50' : 'border-gray-200 bg-white'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <b className="font-mono text-[12.5px]">{r.estimate_lead_id || '—'}</b>
          <span className="text-[12.5px] text-gray-600">{(r.customer && r.customer.name) || '—'}</span>
          {r.po_number ? <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">{r.po_number}</span> : null}
          {already ? <span className="ml-auto text-[11.5px] font-semibold text-green-700">already in system</span>
            : <button onClick={() => onUse(r)} className="ml-auto rounded-md bg-[#1F3A5F] px-2.5 py-1.5 text-[12px] font-semibold text-white">Use this</button>}
        </div>
        <div className="mt-1 text-[12px] text-gray-500">
          {(r.customer && r.customer.contact) || '—'} · BM {(r.bm && r.bm.name) || '—'}
          {r.shipping_address && r.shipping_address.address ? <> · {r.shipping_address.address}</> : null}
        </div>
      </div>
    );
  }

  return (
    <Modal title="Pending POs — site audit" onClose={onClose} wide>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search PI, customer, phone…" className={inputCls} />
      {rows === null ? <div className="py-8 text-center text-[13px] font-semibold text-gray-400">Fetching pending POs…</div>
        : err ? <div className="rounded-md border-l-4 border-red-400 bg-red-50 px-3 py-2.5 text-[12.5px] text-red-700">Could not load pending POs: {err}</div>
          : !list.length ? <div className="py-8 text-center text-[13px] text-gray-400">No pending POs found.</div>
            : (
              <>
                <div className="border-b border-gray-100 pb-2 text-[12px] text-gray-500">
                  <b>{list.length}</b> shown · <b className="text-green-700">{fresh.length}</b> not yet imported · <b>{done.length}</b> already in system
                </div>
                {fresh.map((r, i) => <Card key={'f' + i} r={r} already={false} />)}
                {done.length ? (
                  <details>
                    <summary className="cursor-pointer text-[12px] font-semibold text-gray-500">{done.length} already imported</summary>
                    <div className="mt-2">{done.map((r, i) => <Card key={'d' + i} r={r} already />)}</div>
                  </details>
                ) : null}
              </>
            )}
    </Modal>
  );
}

/* ── Raise rectification ──────────────────────────────────────────────── */
export function RectOverlay({
  order, attribution, onClose, onSaved, toast,
}: {
  order: AuditOrder | null; attribution: string; onClose: () => void; onSaved: () => Promise<void>; toast: (m: string) => void;
}) {
  if (!order) return null;
  return <RectForm order={order} attribution={attribution} onClose={onClose} onSaved={onSaved} toast={toast} />;
}

function RectForm({
  order: o, attribution, onClose, onSaved, toast,
}: {
  order: AuditOrder; attribution: string; onClose: () => void; onSaved: () => Promise<void>; toast: (m: string) => void;
}) {
  const [issue, setIssue] = useState('');
  const [svcType, setSvcType] = useState<'audit' | 'install'>('audit');
  const [newPi, setNewPi] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setIssue(''); setSvcType('audit'); setNewPi(o.pi + '-R'); setErr(''); }, [o]);

  async function submit() {
    setErr('');
    if (!issue.trim()) { setErr('Please describe the issue.'); return; }
    if (!newPi.trim()) { setErr('Enter a PI number for the new order.'); return; }
    setBusy(true);
    try {
      const rectSvc = { rectification_of: o.pi, issue: issue.trim(), flooring: o.service?.flooring || [], wallpaper: o.service?.wallpaper || [] };
      const base: Record<string, any> = {
        pi: newPi.trim(), po: (o.po || []).join(','), skus: o.skus || [], bm: o.bm,
        // Carry the owner across: a rectification belongs to whoever owned the original. Without
        // this the clone lands unattributed even though the parent was linked.
        ...((o as any).bm_email ? { bm_email: (o as any).bm_email } : {}),
        customer_name: o.name, phone: o.phone, addr: o.addr, status: 'pending', service: rectSvc,
        log: [{ t: 'Rectification order for ' + o.pi, d: new Date().toISOString(), by: 'manual' }],
        created_by_email: attribution, city: o.city,
      };
      if (svcType === 'audit') await sbPost('audit_orders', { ...base, audit_ticked: [] });
      else await sbPost('install_orders', { ...base, status: 'deliv_ontime', matched_audit: false, delivery_date: null, custom_wp: false, subjobs: null });
      await sbPatch('audit_orders', o.id, {
        service: { ...(o.service || {}), rectification_raised: true, rectification_pi: newPi.trim(), rectification_type: svcType },
        log: [...o.log, { t: 'Rectification raised — ' + (svcType === 'audit' ? 're-audit' : 're-installation') + ' · new order ' + newPi.trim(), d: new Date().toISOString(), by: 'manual' as const, who: attribution }],
      });
      await onSaved();
      toast('Rectification raised — ' + newPi.trim());
      onClose();
    } catch (e: any) {
      setErr('Failed: ' + (e?.message || 'unknown error'));
    }
    setBusy(false);
  }

  return (
    <Modal title={'Raise Rectification — ' + o.pi} onClose={onClose}>
      <Field label="Issue reported *"><textarea value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="What went wrong on site?" className={inputCls + ' min-h-[80px]'} /></Field>
      <Field label="New service type">
        <select value={svcType} onChange={(e) => setSvcType(e.target.value as 'audit' | 'install')} className={inputCls}>
          <option value="audit">Re-audit (new audit order)</option>
          <option value="install">Re-installation (new install order)</option>
        </select>
      </Field>
      <Field label="New PI number *"><input value={newPi} onChange={(e) => setNewPi(e.target.value)} className={inputCls} /></Field>
      {err ? <div className="rounded-md bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-600">{err}</div> : null}
      <div className="-mx-5 -mb-4 mt-1 flex justify-end gap-2 border-t border-gray-100 px-5 py-3.5">
        <button onClick={onClose} className="rounded-md border border-gray-200 bg-white px-4 py-2 text-[13px] font-semibold text-gray-700">Cancel</button>
        <button disabled={busy} onClick={submit} className="rounded-md bg-amber-600 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Raise rectification'}</button>
      </div>
    </Modal>
  );
}

/* `AddAuditorOverlay` used to live here: its own form, its own validation and
   its own two-of-four copy of the CRM permission map, which is why an SM in
   the audit console could add an auditor but not an installer. It is now
   `AddFieldStaffModal` in ../StaffModals, shared with the install dashboard
   and with Site Audit > Users. */
