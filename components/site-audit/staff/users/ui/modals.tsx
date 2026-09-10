'use client';

import { CITIES, ROLES, crmPermissionsForSiteAuditRole, initials, phoneKey, sbPatch, sbPost } from '../../../shared';
import { INSTALLER_TYPES, PAY_FIELDS, ROLE_OPTIONS } from '../constants';
import { ProfileRow } from '../types';
import { Field, Foot, Modal, RoleBadge } from '.';
import { isInstallerRole } from '../utils';
import { inputCls } from '../../../constants';
import { addUser } from '@/lib/api';
import { useState } from 'react';

export function AddUserModal({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [itype, setItype] = useState('flooring');
  const [city, setCity] = useState(CITIES[0]);
  const [makeCrm, setMakeCrm] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    const nm = name.trim(), em = email.trim().toLowerCase(), ph = phone.replace(/\D/g, '');
    setErr('');
    if (!nm) { setErr('Please enter a full name.'); return; }
    if (!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { setErr('Please enter a valid email address.'); return; }
    if (!role) { setErr('Please select a role.'); return; }

    if (!/^\d{10}$/.test(ph)) { setErr('A 10-digit phone number is required — it is what links this person to their CRM login, their orders and their payouts.'); return; }
    setBusy(true);
    try {
      await sbPost('profiles', { name: nm, email: em, contact: ph || null, role, installer_type: isInstallerRole(role) ? itype : 'flooring', city, passcode: null });

      let note = '';
      if (makeCrm) {
        try {
          await addUser({ name: nm, phone: ph, role: 'post_sales', individualPermissions: crmPermissionsForSiteAuditRole(role) });
        } catch (e: any) {
          note = ' · ⚠ CRM login NOT created (' + (e?.message || 'backend error') + ')';
        }
      }
      onDone(`✓ ${nm} added as ${ROLES[role]?.label || role}` + note);
    } catch (e: any) {
      const msg = e?.message || '';
      setErr(/unique|duplicate/.test(msg) ? 'This email is already added.' : msg || 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <Modal title="Add New User" onClose={onClose}>
      <Field label="Full Name"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Sharma" className={inputCls} /></Field>
      <Field label="Work Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className={inputCls} /></Field>
      <Field label="Phone * (10 digits — links their field app and CRM logins)"><input inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" className={inputCls} /></Field>
      <Field label="Role">
        <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
          <option value="">— Select a role —</option>
          {ROLE_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      {isInstallerRole(role) ? (
        <Field label="Installer Domain">
          <select value={itype} onChange={(e) => setItype(e.target.value)} className={inputCls}>
            {INSTALLER_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
      ) : null}
      <Field label="City">
        <select value={city} onChange={(e) => setCity(e.target.value)} className={inputCls}>
          {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <label className="flex items-start gap-2 rounded-md border border-gray-200 px-3 py-2.5 text-[12.5px] text-gray-700">
        <input type="checkbox" checked={makeCrm} onChange={(e) => setMakeCrm(e.target.checked)} className="mt-0.5 accent-[#1F3A5F]" />
        <span>Also create their <b>CRM login</b> (phone-based) so they can sign in here and land on their own dashboard.</span>
      </label>
      <div className="rounded-md border-l-4 border-blue-400 bg-blue-50 px-3 py-2.5 text-[12px] text-[#1F3A5F]">The field-app PIN is set by the person on their first sign-in — you never see it.</div>
      {err ? <div className="rounded-md bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-600">{err}</div> : null}
      <Foot>
        <button onClick={onClose} className="rounded-md border border-gray-200 bg-white px-4 py-2 text-[13px] font-semibold text-gray-700">Cancel</button>
        <button disabled={busy} onClick={submit} className="rounded-md bg-[#1F3A5F] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">{busy ? 'Adding…' : 'Add User'}</button>
      </Foot>
    </Modal>
  );
}

export function EditUserModal({ user: u, crmLinked, onClose, onDone, onResetPasscode }: {
  user: ProfileRow; crmLinked: boolean; onClose: () => void; onDone: (msg: string) => void; onResetPasscode: () => void;
}) {
  const [role, setRole] = useState(u.role);
  const [itype, setItype] = useState(u.installer_type || 'flooring');
  const [city, setCity] = useState(u.city || CITIES[0]);
  const [contact, setContact] = useState(u.contact || '');
  const [pay, setPay] = useState<Record<string, string>>(() => {
    const pr = u.pay_rates || {};
    return Object.fromEntries(PAY_FIELDS.map(([k]) => [k, pr[k] != null ? String(pr[k]) : '']));
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [makingCrm, setMakingCrm] = useState(false);

  async function save() {
    setErr('');
    const ph = contact.replace(/\D/g, '');
    if (ph && !/^\d{10}$/.test(ph)) { setErr('Phone must be 10 digits.'); return; }
    const body: Record<string, any> = { role, installer_type: isInstallerRole(role) ? itype : 'flooring', city, contact: ph || null };
    if (isInstallerRole(role)) {

      const pr: Record<string, number | null> = {};
      let any = false;
      PAY_FIELDS.forEach(([k]) => {
        const v = pay[k] === '' ? null : parseFloat(pay[k]);
        pr[k] = v == null || isNaN(v) ? null : v;
        if (pr[k] != null) any = true;
      });
      body.pay_rates = any ? pr : null;
    }
    setBusy(true);
    try {
      await sbPatch('profiles', u.id, body);
      onDone(`✓ ${u.name} updated`);
    } catch (e: any) {
      const msg = e?.message || '';
      setErr(/violates|check/.test(msg) ? 'Role not allowed — the DB role constraint needs updating.' : msg || 'Unknown error');
      setBusy(false);
    }
  }

  async function createCrmLogin() {
    const ph = contact.replace(/\D/g, '');
    if (!/^\d{10}$/.test(ph)) { setErr('Enter a 10-digit phone number first.'); return; }
    setMakingCrm(true);
    try {

      if (phoneKey(ph) !== phoneKey(u.contact)) await sbPatch('profiles', u.id, { contact: ph });
      await addUser({ name: u.name, phone: ph, role: 'post_sales', individualPermissions: crmPermissionsForSiteAuditRole(role) });
      onDone(`✓ ${u.name} can sign into the CRM with ${ph} now`);
    } catch (e: any) {
      setErr('CRM login failed — ' + (e?.message || 'try again'));
      setMakingCrm(false);
    }
  }

  return (
    <Modal title="Edit User" onClose={onClose}>
      <div className="mb-1 flex items-center gap-2.5 rounded-lg bg-gray-50 p-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[12px] font-bold text-white" style={{ background: ROLES[u.role]?.color || '#999' }}>{initials(u.name)}</span>
        <div className="min-w-0">
          <b className="text-[13px]">{u.name}</b>
          <div className="truncate text-[12px] text-gray-400">{u.email}</div>
        </div>
        <div className="ml-auto"><RoleBadge role={u.role} /></div>
      </div>

      <Field label="Role">
        <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
          {ROLE_OPTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      {isInstallerRole(role) ? (
        <>
          <Field label="Installer Domain">
            <select value={itype} onChange={(e) => setItype(e.target.value)} className={inputCls}>
              {INSTALLER_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Pay-rate override (optional — blank = global default)">
            <div className="flex flex-wrap gap-2">
              {PAY_FIELDS.map(([k, l]) => (
                <div key={k} className="min-w-[96px] flex-1">
                  <div className="mb-0.5 text-[10.5px] text-gray-400">{l}</div>
                  <input type="number" min={0} step="0.01" value={pay[k]} onChange={(e) => setPay((p) => ({ ...p, [k]: e.target.value }))} className={inputCls} />
                </div>
              ))}
            </div>
          </Field>
        </>
      ) : null}
      <Field label="Phone (links their field app and CRM logins)">
        <div className="flex gap-2">
          <input inputMode="numeric" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="10 digits" className={inputCls} />
          {!crmLinked ? (
            <button disabled={makingCrm} onClick={createCrmLogin} className="shrink-0 whitespace-nowrap rounded-md border border-gray-200 bg-white px-2.5 py-2 text-[12px] font-bold text-gray-700 disabled:opacity-60">
              {makingCrm ? '…' : 'Create CRM login'}
            </button>
          ) : <span className="shrink-0 self-center whitespace-nowrap text-[11.5px] font-semibold text-green-700">✓ CRM linked</span>}
        </div>
      </Field>
      <Field label="City">
        <select value={city} onChange={(e) => setCity(e.target.value)} className={inputCls}>
          {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      {err ? <div className="rounded-md bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-600">{err}</div> : null}
      <Foot>
        <button onClick={onResetPasscode} className="mr-auto rounded-md border border-amber-400 bg-white px-3 py-2 text-[13px] font-semibold text-amber-700">Reset passcode</button>
        <button onClick={onClose} className="rounded-md border border-gray-200 bg-white px-4 py-2 text-[13px] font-semibold text-gray-700">Cancel</button>
        <button disabled={busy} onClick={save} className="rounded-md bg-[#1F3A5F] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save Changes'}</button>
      </Foot>
    </Modal>
  );
}
