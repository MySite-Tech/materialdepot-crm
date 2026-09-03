'use client';

/* The three staff modals every surface shares: add, retire, restore.

   There used to be two add-staff forms — `AddAuditorOverlay` in
   audit-ops/Overlays and `AddStaffOverlay` in install-ops/Overlays — with
   separate role lists, separate validation and separate copies of the CRM
   permission map. The consequence a service manager actually hit: the Audit
   dashboard's "+ Add Staff" offered Site Auditor and Auditor + Installer only,
   so an SM sitting in the audit console could not add a plain installer and
   had to know to cross over to the Install dashboard to do it. One form, one
   role list, both dashboards.

   Retiring is new here. It was previously admin-only, a hard `sbDel`, and
   reachable from exactly one screen — which is why the roster filled up with
   people who had left. See siteAuditShared's staff-exit section. */

import { useEffect, useMemo, useState } from 'react';
import { CITIES, EXIT_REASONS, ROLES, exitColumnsAvailable } from './siteAuditShared';
import { createFieldStaff, restoreFieldStaff, retireFieldStaff, validateStaffInput } from './staffDirectory';

/* ── Which roles a surface may create ─────────────────────────────────────
   The SM dashboards get the four field roles — the people they schedule.
   `bm`/`coe`/`branch_mgr`/`admin` stay admin-only: they are oversight
   accounts, not manpower, and they are created against a CRM login rather
   than a field profile. */
export const FIELD_STAFF_ROLES: Array<[string, string]> = [
  ['site_auditor', 'Site Auditor'],
  ['installer', 'Site Installer'],
  ['auditor_installer', 'Site Auditor + Installer'],
];
export const INSTALLER_TYPES: Array<[string, string]> = [
  ['flooring', 'Wooden Flooring'],
  ['wallpaper', 'Wallpaper'],
  ['wallpanel', 'Wall Panels'],
];
export const needsInstallerType = (r: string) => r === 'installer' || r === 'auditor_installer';

const inputCls = 'w-full rounded-md border border-gray-200 px-2.5 py-2 text-[13px] outline-none focus:border-blue-400';

function Shell({ title, sub, onClose, children }: { title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[950] flex items-center justify-center bg-black/30 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-gray-900">{title}</h3>
            {sub ? <p className="mt-0.5 text-[12px] text-gray-500">{sub}</p> : null}
          </div>
          <button className="shrink-0 text-xl leading-none text-gray-400" onClick={onClose}>×</button>
        </div>
        <div className="flex flex-col gap-3.5 px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="mb-1 text-[11.5px] font-semibold text-gray-600">{label}</div>{children}</label>;
}
function Foot({ children }: { children: React.ReactNode }) {
  return <div className="-mx-5 -mb-4 mt-1 flex justify-end gap-2 border-t border-gray-100 px-5 py-3.5">{children}</div>;
}

/* ── Add ──────────────────────────────────────────────────────────────────
   `defaultCity` is the city the SM is currently filtered to. An auditor or
   installer works only the city they are assigned on joining, and both older
   forms defaulted to Bengaluru (the install one wrote no city at all, which
   is how one live installer still has NULL and reads as Bengaluru), so
   defaulting to the city being looked at is the safer wrong answer. */
export function AddFieldStaffModal({
  open, onClose, onDone, defaultCity, roles = FIELD_STAFF_ROLES, defaultRole,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (msg: string) => Promise<void> | void;
  defaultCity?: string | null;
  roles?: Array<[string, string]>;
  defaultRole?: string;
}) {
  const city0 = defaultCity && defaultCity !== 'all' ? String(defaultCity) : CITIES[0];
  const role0 = defaultRole && roles.some(([k]) => k === defaultRole) ? defaultRole : roles[0][0];
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState(role0);
  const [itype, setItype] = useState('flooring');
  const [city, setCity] = useState(city0);
  const [withCrm, setWithCrm] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(''); setEmail(''); setPhone(''); setRole(role0); setItype('flooring'); setCity(city0); setWithCrm(true); setErr('');
  }, [open, city0, role0]);

  if (!open) return null;

  async function submit() {
    const input = { name, email, phone, role, city, installerType: needsInstallerType(role) ? itype : 'flooring', withCrmLogin: withCrm };
    const bad = validateStaffInput(input);
    if (bad) { setErr(bad); return; }
    setBusy(true);
    try {
      const res = await createFieldStaff(input);
      /* Says WHERE they landed, because the two SM dashboards keep separate
         rosters: "Auditors & caps" reads site_auditor + auditor_installer,
         "Installers" reads installer + auditor_installer. Adding a plain
         installer from the audit console works and is meant to, but the person
         then appears on the OTHER dashboard — without this the add looked like
         it had silently done nothing. */
      const lands = role === 'site_auditor'
        ? 'Audit dashboard → Auditors & caps'
        : role === 'installer'
          ? 'Install dashboard → Installers'
          : 'both Auditors & caps and Installers';
      await onDone(`✓ ${name.trim()} added as ${ROLES[role]?.label || role} — find them under ${lands}. They set their own PIN on first sign-in.` + res.crmNote);
      onClose();
    } catch (e: any) {
      const msg = e?.message || '';
      setErr(/unique|duplicate/i.test(msg) ? 'That email already has a profile — search for them instead.' : 'Failed: ' + (msg || 'unknown error'));
      setBusy(false);
    }
  }

  return (
    <Shell title="Add Field Staff" sub="Creates their field-app profile and their CRM login together." onClose={onClose}>
      <Field label="Full Name *"><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Sharma" className={inputCls} /></Field>
      <Field label="Email *"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" className={inputCls} /></Field>
      <Field label="Phone * (10 digits — links their field app and CRM logins)">
        <input inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" className={inputCls} />
      </Field>
      <Field label="Role *">
        <select value={role} onChange={(e) => setRole(e.target.value)} className={inputCls}>
          {roles.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      {needsInstallerType(role) ? (
        <Field label="Installer domain * (jobs only go to installers of the matching type)">
          <select value={itype} onChange={(e) => setItype(e.target.value)} className={inputCls}>
            {INSTALLER_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
      ) : null}
      <Field label="City * (they will only be scheduled for this city)">
        <select value={city} onChange={(e) => setCity(e.target.value)} className={inputCls}>
          {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <label className="flex items-start gap-2 rounded-md border border-gray-200 px-3 py-2.5 text-[12.5px] text-gray-700">
        <input type="checkbox" checked={withCrm} onChange={(e) => setWithCrm(e.target.checked)} className="mt-0.5 accent-[#1F3A5F]" />
        <span>Also create their <b>CRM login</b> so they can sign in here with this phone number and land on their own dashboard. Untick only if they already exist under Admin &gt; Users.</span>
      </label>
      <div className="rounded-md border-l-4 border-blue-400 bg-blue-50 px-3 py-2.5 text-[12px] text-[#1F3A5F]">The field-app PIN is set by the person on their first sign-in — you never see it.</div>
      {err ? <div className="rounded-md bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-600">{err}</div> : null}
      <Foot>
        <button onClick={onClose} className="rounded-md border border-gray-200 bg-white px-4 py-2 text-[13px] font-semibold text-gray-700">Cancel</button>
        <button disabled={busy} onClick={submit} className="rounded-md bg-[#1F3A5F] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">{busy ? 'Adding…' : 'Add Staff'}</button>
      </Foot>
    </Shell>
  );
}

/* ── Retire ───────────────────────────────────────────────────────────────
   A modal rather than `window.confirm` + `window.prompt`, because the reason
   is the whole point: it is what the attrition breakdown groups by, and
   `window.prompt` is the landmine this repo keeps re-treading (it is
   suppressed outright in an installed PWA, so a required reason collected
   that way is a dead end — see NoteModal). */
export type RetireTarget = { id: string; name: string; email: string; role: string; contact: string | null; city?: string | null };

export function RetireStaffModal({
  person, actorEmail, onClose, onDone,
}: {
  person: RetireTarget;
  /* Recorded as `deleted_by` so an accidental removal has an owner to ask. */
  actorEmail?: string | null;
  onClose: () => void;
  onDone: (msg: string) => Promise<void> | void;
}) {
  const [reason, setReason] = useState<string>(EXIT_REASONS[0]);
  const [note, setNote] = useState('');
  const [revokeCrm, setRevokeCrm] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [canRetire, setCanRetire] = useState<boolean | null>(null);

  /* The columns are probe-gated (migration 004). Asking up front means the
     operator learns the migration is missing BEFORE typing a reason, rather
     than on submit. */
  useEffect(() => { exitColumnsAvailable().then(setCanRetire); }, []);

  const finalReason = useMemo(() => {
    const n = note.trim();
    return n ? `${reason} — ${n}` : reason;
  }, [reason, note]);

  async function submit() {
    setErr('');
    setBusy(true);
    try {
      const res = await retireFieldStaff(person, { by: actorEmail, reason: finalReason, revokeCrm });
      await onDone(`${person.name} marked as no longer staff` + res.crmNote);
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'Could not remove them.');
      setBusy(false);
    }
  }

  return (
    <Shell title={`Remove ${person.name}`} sub={ROLES[person.role]?.label || person.role} onClose={onClose}>
      <div className="rounded-md border-l-4 border-amber-500 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-900">
        They come off every roster, assignment picker and availability count immediately. <b>Their record is kept</b> under Former staff, so their past jobs stay attributed and they still count towards attrition.
      </div>
      {canRetire === false ? (
        <div className="rounded-md bg-red-50 px-3 py-2.5 text-[12.5px] font-semibold text-red-700">
          Can&apos;t remove anyone yet — <code>site-audit-migration-004-staff-exit.sql</code> has not been run against the Site Audit Supabase project. Nothing has been changed.
        </div>
      ) : null}
      <Field label="Reason *">
        <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls}>
          {EXIT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. last working day 12 Sep" className={inputCls} />
      </Field>
      <label className="flex items-start gap-2 rounded-md border border-gray-200 px-3 py-2.5 text-[12.5px] text-gray-700">
        <input type="checkbox" checked={revokeCrm} onChange={(e) => setRevokeCrm(e.target.checked)} className="mt-0.5 accent-[#1F3A5F]" />
        <span>Also <b>deactivate their CRM login</b> so they can&apos;t sign in here either. The account is kept, not deleted, so their past orders stay attributed.</span>
      </label>
      {err ? <div className="rounded-md bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-600">{err}</div> : null}
      <Foot>
        <button onClick={onClose} className="rounded-md border border-gray-200 bg-white px-4 py-2 text-[13px] font-semibold text-gray-700">Cancel</button>
        <button disabled={busy || canRetire === false} onClick={submit} className="rounded-md bg-red-600 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">
          {busy ? 'Removing…' : 'Remove from staff'}
        </button>
      </Foot>
    </Shell>
  );
}

/* ── Restore ──────────────────────────────────────────────────────────────
   Retiring the wrong person is the cost of putting removal in more hands, so
   undoing it is one click and needs no form. */
export function RestoreStaffModal({
  person, onClose, onDone,
}: {
  person: RetireTarget & { exitReason?: string | null; deletedAt?: string | null };
  onClose: () => void;
  onDone: (msg: string) => Promise<void> | void;
}) {
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr('');
    setBusy(true);
    try {
      const res = await restoreFieldStaff(person);
      await onDone(`${person.name} is back on the roster` + res.crmNote);
      onClose();
    } catch (e: any) {
      setErr(e?.message || 'Could not restore them.');
      setBusy(false);
    }
  }

  return (
    <Shell title={`Bring back ${person.name}`} sub={ROLES[person.role]?.label || person.role} onClose={onClose}>
      <div className="rounded-md border-l-4 border-green-500 bg-green-50 px-3 py-2.5 text-[12.5px] text-green-900">
        They go back on the roster with the role, city, caps and availability they had, and their CRM login is re-activated. The exit reason on file is cleared.
      </div>
      {person.exitReason ? <div className="text-[12.5px] text-gray-600">Currently recorded as: <b>{person.exitReason}</b></div> : null}
      {err ? <div className="rounded-md bg-red-50 px-3 py-2 text-[12.5px] font-semibold text-red-600">{err}</div> : null}
      <Foot>
        <button onClick={onClose} className="rounded-md border border-gray-200 bg-white px-4 py-2 text-[13px] font-semibold text-gray-700">Cancel</button>
        <button disabled={busy} onClick={submit} className="rounded-md bg-[#1f7a3f] px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60">{busy ? 'Restoring…' : 'Bring back on roster'}</button>
      </Foot>
    </Shell>
  );
}
