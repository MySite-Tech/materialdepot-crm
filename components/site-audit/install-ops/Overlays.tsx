'use client';

/* Modal overlays — port of AddOrderOverlay / KylasOverlay / RectOverlay /
   AddStaffOverlay from SMInstall.jsx. KylasOverlay is the one with an actual
   backend change: it calls this CRM's own `/api/site-audit/install-pos`
   Next.js route (proxying Django's SiteAuditInstallationPOListAPI) instead
   of the legacy app's `/api/pos` Vercel rewrite — same upstream endpoint,
   same query params (`type`, `page_size`, `search`), same {results,count}
   response shape. */

import { useEffect, useRef, useState } from 'react';
import { sbPatch, sbPost } from '../siteAuditShared';
import type { InstallOrder, SkuType } from './types';

/* ── Add / Edit Order ─────────────────────────────────────────────────── */
export interface AoState { pi: string; po: string; name: string; phone: string; addr: string; bm: string; delivery: string }
export interface AoSkuRow { code: string; type: SkuType; name: string }

interface AddOrderOverlayProps {
  open: boolean;
  ao: AoState;
  setAo: (fn: (prev: AoState) => AoState) => void;
  aoSkus: AoSkuRow[];
  setAoSkus: (fn: (prev: AoSkuRow[]) => AoSkuRow[]) => void;
  aoCwp: boolean;
  setAoCwp: (v: boolean) => void;
  aoErr: string;
  aoKylasNote: boolean;
  aoBusy: boolean;
  onClose: () => void;
  onAddSku: () => void;
  onSubmit: () => void;
}

export function AddOrderOverlay({ open, ao, setAo, aoSkus, setAoSkus, aoCwp, setAoCwp, aoErr, aoKylasNote, aoBusy, onClose, onAddSku, onSubmit }: AddOrderOverlayProps) {
  if (!open) return null;
  const set = (f: keyof AoState, v: string) => setAo((prev) => ({ ...prev, [f]: v }));
  const setSku = (i: number, f: keyof AoSkuRow, v: string) => setAoSkus((rows) => rows.map((r, ri) => (ri === i ? { ...r, [f]: v } : r)));
  return (
    <div className="fixed inset-0 bg-black/30 z-[900] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200"><h3 className="text-base font-bold text-gray-900">Add New Installation Order</h3><button className="text-gray-400 text-xl" onClick={onClose}>×</button></div>
        <div className="px-5 py-4 flex flex-col gap-3.5">
          {aoKylasNote ? <div className="text-[12.5px] text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2.5">Pre-filled from backend — verify PI number, address and details before saving.</div> : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="PI Number *"><input placeholder="PI-2026-00XXX" value={ao.pi} onChange={(e) => set('pi', e.target.value)} className="px-2.5 py-2 border border-gray-200 rounded-md text-[13px] w-full box-border outline-none focus:border-blue-400" /></Field>
            <Field label="PO Numbers"><input placeholder="PO-WF-1234, PO-WP-1235" value={ao.po} onChange={(e) => set('po', e.target.value)} className="px-2.5 py-2 border border-gray-200 rounded-md text-[13px] w-full box-border outline-none focus:border-blue-400" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Customer Name *"><input placeholder="Full name" value={ao.name} onChange={(e) => set('name', e.target.value)} className="px-2.5 py-2 border border-gray-200 rounded-md text-[13px] w-full box-border outline-none focus:border-blue-400" /></Field>
            <Field label="Customer Phone *"><input placeholder="98XXX XXXXX" inputMode="tel" value={ao.phone} onChange={(e) => set('phone', e.target.value)} className="px-2.5 py-2 border border-gray-200 rounded-md text-[13px] w-full box-border outline-none focus:border-blue-400" /></Field>
          </div>
          <Field label="Address *"><textarea placeholder="Full address with city and pincode" value={ao.addr} onChange={(e) => set('addr', e.target.value)} className="px-2.5 py-2 border border-gray-200 rounded-md text-[13px] w-full box-border outline-none focus:border-blue-400 resize-y min-h-[70px]" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="BM / Sales Person"><input placeholder="Name" value={ao.bm} onChange={(e) => set('bm', e.target.value)} className="px-2.5 py-2 border border-gray-200 rounded-md text-[13px] w-full box-border outline-none focus:border-blue-400" /></Field>
            <Field label="Delivery Date"><input type="date" value={ao.delivery} onChange={(e) => set('delivery', e.target.value)} className="px-2.5 py-2 border border-gray-200 rounded-md text-[13px] w-full box-border outline-none focus:border-blue-400" /></Field>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-500 mb-1">SKUs &amp; Types</label>
            {aoSkus.map((row, i) => (
              <div className="grid grid-cols-[1fr_auto] gap-2 mt-1.5" key={i}>
                <input className="px-2.5 py-2 border border-gray-200 rounded-md text-[13px] w-full box-border outline-none focus:border-blue-400" placeholder={i === 0 ? 'SKU code e.g. WF-OAK-12MM' : 'SKU code'} value={row.code} onChange={(e) => setSku(i, 'code', e.target.value)} />
                <select className="px-2.5 py-2 border border-gray-200 rounded-md text-[13px] w-full box-border outline-none focus:border-blue-400 w-32" value={row.type} onChange={(e) => setSku(i, 'type', e.target.value)}>
                  <option value="flooring">Flooring</option>
                  <option value="wallpaper">Wallpaper</option>
                </select>
              </div>
            ))}
            <button className="border border-dashed border-blue-500 bg-white text-blue-600 rounded-md px-3 py-1.5 text-[12.5px] font-semibold mt-1.5 w-full" onClick={onAddSku}>+ Add another SKU</button>
          </div>
          <label className="flex items-center gap-2 cursor-pointer text-[13px]">
            <input type="checkbox" checked={aoCwp} onChange={(e) => setAoCwp(e.target.checked)} className="w-4 h-4 accent-[#1F3A5F]" />
            Custom Wallpaper order
          </label>
          {aoErr ? <div className="bg-red-50 text-red-600 rounded-md px-3 py-2 text-[12.5px] font-semibold">{aoErr}</div> : null}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-100">
          <button className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-md text-[13px] font-semibold" onClick={onClose}>Cancel</button>
          <button className="bg-[#1F3A5F] text-white px-4 py-2 rounded-md text-[13px] font-semibold disabled:opacity-60" disabled={aoBusy} onClick={onSubmit}>Add Order</button>
        </div>
      </div>
    </div>
  );
}
function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return <div><label className="block text-[11px] font-semibold text-gray-500 mb-1">{label}</label>{children}</div>;
}

/* ── Kylas / Pending POs picker ───────────────────────────────────────── */
interface KylasRow {
  po_number: string; po_status: string; delivery_date?: string; created_at?: string; estimate_lead_id?: string;
  customer?: { name?: string; contact?: string }; bm?: { name?: string };
  shipping_address?: { address?: string; map_link?: string };
  skus?: Array<{ product_name?: string }>;
}

export function KylasOverlay({ open, orders, onClose, onUse }: { open: boolean; orders: InstallOrder[]; onClose: () => void; onUse: (row: KylasRow) => void }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<KylasRow[]>([]);
  const [count, setCount] = useState(0);
  const [err, setErr] = useState('');
  const [search, setSearch] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load(searchVal: string) {
    setLoading(true); setErr('');
    try {
      const params = new URLSearchParams({ type: 'installation', page_size: '100' });
      if (searchVal) params.set('search', searchVal);
      const res = await fetch('/api/site-audit/install-pos?' + params.toString());
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      setRows(data.results || []); setCount(data.count || (data.results || []).length); setLoading(false);
    } catch (e: any) {
      setRows([]); setCount(0); setErr(e?.message || 'failed'); setLoading(false);
    }
  }

  useEffect(() => { if (open) { setSearch(''); load(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  function onSearchInput(v: string) {
    setSearch(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => load(v.trim()), 400);
  }

  if (!open) return null;

  const stLabel: Record<string, string> = { dispatch_pending: 'Dispatch Pending', pickup_attempted: 'Pickup Attempted', delivered: 'Delivered', cancelled: 'Cancelled' };
  const stColor: Record<string, string> = { dispatch_pending: 'text-amber-600', pickup_attempted: 'text-amber-600', delivered: 'text-green-700', cancelled: 'text-red-600' };
  const existingPOs = new Set(orders.flatMap((o) => o.po || []));
  const newRows = rows.filter((r) => !existingPOs.has(r.po_number));
  const doneRows = rows.filter((r) => existingPOs.has(r.po_number));

  const Card = ({ r, done }: { r: KylasRow; done: boolean }) => {
    const sl = stLabel[r.po_status] || r.po_status;
    const sc = done ? 'text-gray-400' : stColor[r.po_status] || 'text-gray-400';
    const sa = r.shipping_address;
    const addr = sa && sa.address ? (sa.address.length > 80 ? sa.address.slice(0, 80) + '…' : sa.address) : '';
    const skuNames = (r.skus || []).slice(0, 2).map((s) => s.product_name).filter(Boolean).join(', ');
    const date = (r.delivery_date || r.created_at || '').slice(0, 10);
    return (
      <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border mb-1.5 ${done ? 'border-gray-200 opacity-50' : 'border-blue-200 bg-blue-50/40'}`}>
        <div className="flex-1 min-w-0">
          <div className="font-extrabold text-sm text-[#1F3A5F]">{r.customer?.name || '—'}<span className="font-medium text-gray-400 text-xs ml-1.5">{r.customer?.contact || ''}</span></div>
          <div className="text-xs text-gray-500 mt-0.5">PI: <b>{r.estimate_lead_id || '—'}</b> · PO: <b>{r.po_number}</b> · BM: {r.bm?.name || '—'} · {date} <span className={`font-bold ml-1 ${sc}`}>{sl}</span></div>
          {addr ? <div className="text-[11.5px] text-gray-400 mt-0.5">{addr}{sa?.map_link ? <> <a href={sa.map_link} target="_blank" rel="noreferrer" className="text-blue-600">📍 Map</a></> : null}</div> : null}
          {skuNames ? <div className="text-[11.5px] text-gray-700 mt-0.5">{skuNames}</div> : null}
        </div>
        {done ? <span className="shrink-0 text-xs bg-green-100 text-green-700 rounded-full px-2.5 py-0.5">Imported</span> : <button className="shrink-0 bg-[#1F3A5F] text-white px-3 py-1.5 rounded-md text-xs font-semibold" onClick={() => onUse(r)}>Use this</button>}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/30 z-[900] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200"><h3 className="text-base font-bold text-gray-900">📋 Pending POs — Import Orders</h3><button className="text-gray-400 text-xl" onClick={onClose}>×</button></div>
        <div className="px-5 pt-3 border-b border-gray-100 pb-3">
          <input placeholder="Search by PO, customer, lead ID…" value={search} onChange={(e) => onSearchInput(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-md text-[13px] outline-none focus:border-yellow-400" />
        </div>
        <div className="px-5 py-4">
          {loading ? <div className="text-center py-8 text-gray-400 font-semibold">Fetching pending POs…</div>
            : err ? <div className="rounded-md border border-red-300 bg-red-50 text-red-600 px-3 py-2.5 text-[12.5px]">Could not load pending POs: {err}</div>
              : !rows.length ? <div className="rounded-md border-l-4 border-blue-400 bg-blue-50 px-3 py-2.5 text-[12.5px] text-[#1F3A5F]">No POs found.</div>
                : (
                  <>
                    <div className="text-xs text-gray-500 pb-3 mb-2.5 border-b border-gray-100">
                      Showing <b>{rows.length}</b> of <b>{count}</b> · <b className="text-green-700">{newRows.length}</b> not yet imported · <b>{doneRows.length}</b> already in system
                    </div>
                    {newRows.length
                      ? newRows.map((r, i) => <Card key={i} r={r} done={false} />)
                      : <div className="rounded-md border-l-4 border-green-600 bg-green-50 text-green-700 px-3 py-2.5 text-[12.5px]">All shown POs are already in the system.</div>}
                    {doneRows.length ? (
                      <details className="mt-3">
                        <summary className="text-xs font-bold text-gray-500 cursor-pointer mb-2">{doneRows.length} already imported</summary>
                        <div className="mt-2">{doneRows.map((r, i) => <Card key={i} r={r} done />)}</div>
                      </details>
                    ) : null}
                  </>
                )}
        </div>
      </div>
    </div>
  );
}

/* ── Rectification ────────────────────────────────────────────────────── */
export function RectOverlay({ order, onClose, reload, toast, attribution }: { order: InstallOrder | null; onClose: () => void; reload: () => Promise<void>; toast: (m: string) => void; attribution: string }) {
  const [issue, setIssue] = useState('');
  const [svcType, setSvcType] = useState<'install' | 'audit'>('install');
  const [newPi, setNewPi] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (order) { setIssue(''); setSvcType('install'); setNewPi(order.pi + '-R'); setErr(''); }
  }, [order]);

  if (!order) return null;
  const o = order;

  async function submit() {
    setErr('');
    if (!issue.trim()) { setErr('Please describe the issue.'); return; }
    if (!newPi.trim()) { setErr('Enter a PI number for the new order.'); return; }
    setBusy(true);
    try {
      const rectSvc = { rectification_of: o.pi, issue: issue.trim(), flooring: (o.service && o.service.flooring) || [], wallpaper: (o.service && o.service.wallpaper) || [] };
      const base = {
        pi: newPi.trim(), po: (o.po || []).join(','), skus: o.skus || [], bm: o.bm, customer_name: o.name, phone: o.phone, addr: o.addr,
        status: 'pending', service: rectSvc, log: [{ t: 'Rectification order for ' + o.pi, d: new Date().toISOString(), by: 'manual', who: attribution }], created_by_email: attribution,
      };
      if (svcType === 'install') await sbPost('install_orders', { ...base, status: 'deliv_ontime', matched_audit: false, delivery_date: null, custom_wp: false, subjobs: null });
      else await sbPost('audit_orders', { ...base, audit_ticked: [] });
      const updSvc = { ...(o.service || {}), rectification_raised: true, rectification_pi: newPi.trim(), rectification_type: svcType };
      const updLog = [...o.log, { t: 'Rectification raised — ' + (svcType === 'install' ? 're-installation' : 're-audit') + ' · new order ' + newPi.trim(), d: new Date().toISOString(), by: 'manual' as const, who: attribution }];
      await sbPatch('install_orders', String(o.id), { service: updSvc, log: updLog });
      onClose();
      await reload();
      toast('Rectification raised — ' + newPi.trim());
    } catch (e: any) {
      setErr('Failed: ' + (e?.message || 'unknown error'));
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-[900] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200"><h3 className="text-base font-bold text-gray-900">↩ Raise Rectification</h3><button className="text-gray-400 text-xl" onClick={onClose}>×</button></div>
        <div className="px-5 py-4 flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Original PI No."><input value={o.pi} disabled className="px-2.5 py-2 border border-gray-200 rounded-md text-[13px] w-full box-border outline-none focus:border-blue-400 bg-gray-50 text-gray-500" /></Field>
            <Field label="Customer Name"><input value={o.name} disabled className="px-2.5 py-2 border border-gray-200 rounded-md text-[13px] w-full box-border outline-none focus:border-blue-400 bg-gray-50 text-gray-500" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone"><input value={o.phone} disabled className="px-2.5 py-2 border border-gray-200 rounded-md text-[13px] w-full box-border outline-none focus:border-blue-400 bg-gray-50 text-gray-500" /></Field>
            <Field label="BM"><input value={o.bm} disabled className="px-2.5 py-2 border border-gray-200 rounded-md text-[13px] w-full box-border outline-none focus:border-blue-400 bg-gray-50 text-gray-500" /></Field>
          </div>
          <Field label="Address"><input value={o.addr} disabled className="px-2.5 py-2 border border-gray-200 rounded-md text-[13px] w-full box-border outline-none focus:border-blue-400 bg-gray-50 text-gray-500" /></Field>
          <Field label={<>Issue / Complaint <span className="text-red-600">*</span></>}><textarea placeholder="Describe the issue the client is facing…" className="px-2.5 py-2 border border-gray-200 rounded-md text-[13px] w-full box-border outline-none focus:border-blue-400 resize-y min-h-[80px]" value={issue} onChange={(e) => setIssue(e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={<>New service type <span className="text-red-600">*</span></>}>
              <select className="px-2.5 py-2 border border-gray-200 rounded-md text-[13px] w-full box-border outline-none focus:border-blue-400" value={svcType} onChange={(e) => setSvcType(e.target.value as 'install' | 'audit')}>
                <option value="install">Site Installation (re-installation)</option>
                <option value="audit">Site Audit (re-audit)</option>
              </select>
            </Field>
            <Field label={<>New PI No. <span className="text-red-600">*</span></>}><input placeholder="e.g. PI-2026-00123-R" value={newPi} onChange={(e) => setNewPi(e.target.value)} className="px-2.5 py-2 border border-gray-200 rounded-md text-[13px] w-full box-border outline-none focus:border-blue-400" /></Field>
          </div>
          {err ? <div className="bg-red-50 text-red-600 rounded-md px-3 py-2 text-[12.5px] font-semibold">{err}</div> : null}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-100">
          <button className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-md text-[13px] font-semibold" onClick={onClose}>Cancel</button>
          <button className="bg-amber-600 text-white px-4 py-2 rounded-md text-[13px] font-semibold disabled:opacity-60" disabled={busy} onClick={submit}>↩ Raise Rectification</button>
        </div>
      </div>
    </div>
  );
}

/* ── Add Staff ────────────────────────────────────────────────────────── */
export function AddStaffOverlay({ open, onClose, reload, toast }: { open: boolean; onClose: () => void; reload: () => Promise<void>; toast: (m: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [roleVal, setRoleVal] = useState('installer_flooring');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setName(''); setEmail(''); setRoleVal('installer_flooring'); setErr(''); } }, [open]);

  if (!open) return null;

  async function submit() {
    setErr('');
    const nm = name.trim(); const em = email.trim().toLowerCase();
    if (!nm) { setErr('Name is required.'); return; }
    if (!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { setErr('Enter a valid email address.'); return; }
    const role = roleVal === 'site_auditor' ? 'site_auditor' : roleVal.startsWith('auditor_installer') ? 'auditor_installer' : 'installer';
    const installer_type = roleVal === 'installer_flooring' || roleVal === 'auditor_installer_flooring' ? 'flooring' : roleVal === 'installer_wallpaper' || roleVal === 'auditor_installer_wallpaper' ? 'wallpaper' : null;
    setBusy(true);
    try {
      await sbPost('profiles', { name: nm, email: em, role, installer_type, passcode: null });
      await reload();
      onClose();
      toast('Staff member added — they will set their PIN on first login');
    } catch (e: any) {
      setErr('Failed: ' + (e?.message || 'unknown error'));
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 bg-black/30 z-[900] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200"><h3 className="text-base font-bold text-gray-900">Add Staff Member</h3><button className="text-gray-400 text-xl" onClick={onClose}>×</button></div>
        <div className="px-5 py-4 flex flex-col gap-3.5">
          <Field label="Full Name *"><input placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} className="px-2.5 py-2 border border-gray-200 rounded-md text-[13px] w-full box-border outline-none focus:border-blue-400" /></Field>
          <Field label="Email *"><input placeholder="name@example.com" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="px-2.5 py-2 border border-gray-200 rounded-md text-[13px] w-full box-border outline-none focus:border-blue-400" /></Field>
          <Field label="Role *">
            <select className="px-2.5 py-2 border border-gray-200 rounded-md text-[13px] w-full box-border outline-none focus:border-blue-400" value={roleVal} onChange={(e) => setRoleVal(e.target.value)}>
              <option value="installer_flooring">Flooring Installer</option>
              <option value="installer_wallpaper">Wallpaper Installer</option>
              <option value="site_auditor">Site Auditor</option>
              <option value="auditor_installer_flooring">Auditor + Flooring Installer</option>
              <option value="auditor_installer_wallpaper">Auditor + Wallpaper Installer</option>
            </select>
          </Field>
          <div className="rounded-md border-l-4 border-blue-400 bg-blue-50 px-3 py-2.5 text-[12px] text-[#1F3A5F]">Passcode will be set by the staff member on their first login. You will not see their PIN.</div>
          {err ? <div className="bg-red-50 text-red-600 rounded-md px-3 py-2 text-[12.5px] font-semibold">{err}</div> : null}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3.5 border-t border-gray-100">
          <button className="bg-white border border-gray-200 text-gray-700 px-4 py-2 rounded-md text-[13px] font-semibold" onClick={onClose}>Cancel</button>
          <button className="bg-[#1F3A5F] text-white px-4 py-2 rounded-md text-[13px] font-semibold disabled:opacity-60" disabled={busy} onClick={submit}>Add Staff Member</button>
        </div>
      </div>
    </div>
  );
}
