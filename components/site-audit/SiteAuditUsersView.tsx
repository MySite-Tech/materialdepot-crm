'use client';

/* Users — port of the Users view from material-depot-site's Admin.html
   (renderUsers / openAddUser / openEditRole / resetPasscode / deleteUser).

   This is the single place to manage a Site Audit person: role, installer
   domain, city, per-installer pay-rate override, passcode reset and removal.

   Two additions over the original, both about the CRM living alongside the
   field apps rather than replacing them:
   - `contact` is a first-class field. It's the only bridge between a field-app
     profile (email-keyed) and a CRM login (contact-keyed), so every form here
     collects it and the table flags anyone missing it.
   - adding a user can also create their CRM login in one go (backend
     UserOrganisation + the `crm.site_audit` permissions), so a new person
     doesn't have to be entered twice in two different screens. */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CITIES, ROLES, fmtDate, initials, phoneKey, planSiteAuditRoleSync, randomPasscode, sbDel, sbGet, sbPatch, sbPatchWhere, sbPost, syntheticSiteAuditEmail } from './siteAuditShared';
import { addUser, fetchUsers } from '@/lib/mockApi';

type ProfileRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  contact: string | null;
  installer_type: string | null;
  city: string | null;
  passcode: string | null;
  pay_rates: Record<string, number | null> | null;
  created_at?: string;
};

const ROLE_OPTIONS: Array<[string, string]> = [
  ['service_mgr', 'Service Manager'],
  ['site_auditor', 'Site Auditor'],
  ['installer', 'Site Installer'],
  ['auditor_installer', 'Site Auditor + Installer'],
  ['bm', 'Business Manager'],
  ['branch_mgr', 'Branch Manager'],
  ['coe', 'Category Ops Executive'],
  ['admin', 'Admin'],
];
const INSTALLER_TYPES: Array<[string, string]> = [
  ['flooring', 'Wooden Flooring'],
  ['wallpaper', 'Wallpaper'],
  ['wallpanel', 'Wall Panels'],
];
const PAY_FIELDS: Array<[string, string]> = [
  ['fl_sqft', 'Flooring ₹/sqft'],
  ['wp_std_roll', 'Std WP ₹/roll'],
  ['wp_custom_sqft', 'Custom WP ₹/sqft'],
  ['wpnl_sqft', 'Wall Panels ₹/sqft'],
];
/* Site-audit role → the CRM sub-permission that routes them to the right
   view once they sign in. Roles absent here (bm/admin) get the oversight
   dashboard instead of a field app. */
const CRM_PERMISSION_FOR: Record<string, string> = {
  site_auditor: 'site_audit.site_auditor',
  installer: 'site_audit.installer',
  auditor_installer: 'site_audit.auditor_installer',
  service_mgr: 'site_audit.service_manager',
};

const isInstallerRole = (r: string) => r === 'installer' || r === 'auditor_installer';

function RoleBadge({ role }: { role: string }) {
  const meta = ROLES[role];
  return (
    <span className="inline-block rounded-md px-2 py-0.5 text-[10.5px] font-bold text-white" style={{ background: meta?.color || '#999' }}>
      {meta?.label || role}
    </span>
  );
}

export default function SiteAuditUsersView() {
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [crmUsers, setCrmUsers] = useState<Array<{ id: string | number; name: string; phone: string; role: string; allowedBranches?: string[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ProfileRow | null>(null);
  const [toast, setToast] = useState('');

  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); }, []);

  const load = useCallback(async () => {
    const [res, users] = await Promise.all([
      sbGet('profiles?select=*&order=created_at.desc'),
      fetchUsers().catch(() => []),
    ]);
    if (!Array.isArray(res)) { setErr('Could not load users.'); setLoading(false); return; }
    setErr('');
    setRows(res);
    setCrmUsers((users as Array<{ id: string | number; name: string; phone: string; role: string; allowedBranches?: string[] }>) || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const crmPhones = useMemo(() => new Set(crmUsers.map((u) => phoneKey(u.phone)).filter(Boolean)), [crmUsers]);

  /* Suggest a missing phone number from the CRM roster, but ONLY when it's
     unambiguous — exactly one CRM user with that exact name, whose number
     isn't already on another profile. A wrong guess would hand someone else's
     jobs, availability and payout to them. */
  const suggestFor = useCallback((p: ProfileRow): string | null => {
    const target = p.name.trim().toLowerCase().replace(/\s+/g, ' ');
    const hits = crmUsers.filter((u) => (u.name || '').trim().toLowerCase().replace(/\s+/g, ' ') === target);
    if (hits.length !== 1) return null;
    const ph = phoneKey(hits[0].phone);
    if (!ph || rows.some((q) => q.id !== p.id && phoneKey(q.contact) === ph)) return null;
    return ph;
  }, [crmUsers, rows]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach((r) => { c[r.role] = (c[r.role] || 0) + 1; });
    return c;
  }, [rows]);

  const filtered = rows.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (!q) return true;
    return (u.name + u.email + u.role + (u.contact || '')).toLowerCase().includes(q.toLowerCase());
  });

  const missingPhone = rows.filter((u) => !phoneKey(u.contact));
  const unlinked = missingPhone.length;
  const noCrm = rows.filter((u) => phoneKey(u.contact) && !crmPhones.has(phoneKey(u.contact))).length;
  const suggestable = missingPhone.map((p) => ({ p, ph: suggestFor(p) })).filter((x) => x.ph) as Array<{ p: ProfileRow; ph: string }>;

  async function linkAllSuggested() {
    if (!suggestable.length) return;
    if (!window.confirm('Link ' + suggestable.length + ' person(s) to the CRM login with the exact same name?\n\n' + suggestable.map((x) => x.p.name + ' → ' + x.ph).join('\n'))) return;
    let ok = 0;
    for (const { p, ph } of suggestable) {
      try { await sbPatch('profiles', p.id, { contact: ph }); ok++; } catch { /* keep going; report the total */ }
    }
    await load();
    flash('✓ Linked ' + ok + ' of ' + suggestable.length);
  }

  /* ── Legacy BM links ────────────────────────────────────────────────────
     `audit_orders.bm` is free text (typed by the store team, or prefilled from
     the Kylas PO payload); `bm_email` is the real link that the BM dashboard
     keys off. Everything created from this CRM writes both, so this only ever
     has legacy rows to clean up. Linking is exact-name-only and never
     ambiguous: one BM profile per name, or the name is left alone — a false
     positive would show one BM another BM's customer. */
  const bmProfiles = useMemo(() => rows.filter((r) => r.role === 'bm' && r.email), [rows]);
  const [bmOrders, setBmOrders] = useState<Array<{ bm: string | null }> | null>(null);
  const [linkingBm, setLinkingBm] = useState(false);
  const [bmPanel, setBmPanel] = useState(false);
  useEffect(() => {
    let alive = true;
    sbGet('audit_orders?select=bm&bm_email=is.null&status=neq.deleted')
      .then((r) => { if (alive) setBmOrders(Array.isArray(r) ? r : []); })
      .catch(() => { if (alive) setBmOrders([]); });
    return () => { alive = false; };
  }, [rows]);

  const bmLink = useMemo(() => {
    const unlinkedOrders = bmOrders ? bmOrders.length : 0;
    const byName = new Map<string, number>();
    for (const o of bmOrders || []) {
      const raw = (o.bm || '').trim();
      if (!raw || raw === '—') continue;
      byName.set(raw, (byName.get(raw) || 0) + 1);
    }
    const plan: Array<{ raw: string; email: string; name: string; count: number }> = [];
    for (const [raw, count] of byName) {
      const target = raw.toLowerCase().replace(/\s+/g, ' ');
      const hits = bmProfiles.filter((p) => p.name.trim().toLowerCase().replace(/\s+/g, ' ') === target);
      if (hits.length !== 1) continue;
      plan.push({ raw, email: hits[0].email, name: hits[0].name, count });
    }
    const autoBy = new Map(plan.map((p) => [p.raw, p.email]));
    const names = [...byName.entries()]
      .map(([raw, count]) => ({ raw, count, auto: autoBy.get(raw) || null }))
      .sort((a, b) => b.count - a.count || a.raw.localeCompare(b.raw));
    return { unlinkedOrders, plan, names, linkable: plan.reduce((s, p) => s + p.count, 0) };
  }, [bmOrders, bmProfiles]);

  /* Names the store team/Kylas spell differently from the BM's own account
     ("Dhruv" vs "Dhruv Gangrade") can't be auto-linked without guessing, so
     they're linked one name at a time by an explicit human choice here. */
  async function linkOneBmName(raw: string, email: string) {
    const prof = bmProfiles.find((p) => p.email === email);
    if (!prof) return;
    const n = bmLink.names.find((x) => x.raw === raw)?.count || 0;
    if (!window.confirm('Link ' + n + ' order(s) with BM "' + raw + '" to ' + prof.name + ' (' + prof.email + ')?\n\nThose orders will appear on that BM\'s dashboard and the name will be rewritten to "' + prof.name + '".')) return;
    setLinkingBm(true);
    try {
      const done = await sbPatchWhere(
        'audit_orders',
        'bm=eq.' + encodeURIComponent(raw) + '&bm_email=is.null&status=neq.deleted',
        { bm: prof.name, bm_email: prof.email }
      );
      flash('✓ Linked ' + done + ' order(s) to ' + prof.name);
    } catch (e: any) {
      flash('⚠ ' + (e?.message || 'Could not link'));
    }
    setLinkingBm(false);
    setBmOrders(null);
    await load();
  }

  async function linkBmOrders() {
    if (!bmLink.plan.length) return;
    const preview = bmLink.plan.slice(0, 12).map((p) => p.raw + ' → ' + p.email + ' (' + p.count + ')').join('\n');
    if (!window.confirm(
      'Link ' + bmLink.linkable + ' audit order(s) to a BM account by exact name?\n\n' + preview
      + (bmLink.plan.length > 12 ? '\n…and ' + (bmLink.plan.length - 12) + ' more name(s)' : '')
      + '\n\nOnly orders with no BM account link are touched. Their BM dashboards start showing these orders immediately.'
    )) return;
    setLinkingBm(true);
    let ok = 0;
    for (const p of bmLink.plan) {
      try {
        // Filter re-asserts bm_email=is.null so a row linked by someone else
        // in the meantime is skipped rather than overwritten.
        ok += await sbPatchWhere(
          'audit_orders',
          'bm=eq.' + encodeURIComponent(p.raw) + '&bm_email=is.null&status=neq.deleted',
          { bm: p.name, bm_email: p.email }
        );
      } catch { /* keep going; the total below reports what landed */ }
    }
    setLinkingBm(false);
    setBmOrders(null);
    await load();
    flash('✓ Linked ' + ok + ' order(s) to a BM account');
  }

  /* ── CRM permission → Site Audit role sync ─────────────────────────────
     The company's master employee/permission list lives in the CRM's own
     Django backend (fetchUsers()); this derives each person's Site Audit
     role from their CRM permission instead of assigning it twice by hand.
     Pure computation lives in planSiteAuditRoleSync (siteAuditShared.ts) —
     this is just the preview/confirm/apply UI around it, matching the
     linkAllSuggested/linkBmOrders pattern above. */
  const roleSync = useMemo(() => planSiteAuditRoleSync(crmUsers, rows), [crmUsers, rows]);
  const [syncingRoles, setSyncingRoles] = useState(false);
  const [roleSyncPanel, setRoleSyncPanel] = useState(false);

  const roleSyncTotal = roleSync.ready.length + roleSync.noProfileYet.length;

  async function applyRoleSync() {
    if (!roleSyncTotal) return;
    const updateLines = roleSync.ready.map((r) => r.name + ': ' + r.currentRole + ' → ' + r.targetRole + (r.branch ? ' (branch: ' + r.branch + ')' : ''));
    const createLines = roleSync.noProfileYet.map((r) => r.name + ': (new account) → ' + r.targetRole + (r.branch ? ' (branch: ' + r.branch + ')' : ''));
    const preview = [...updateLines, ...createLines].slice(0, 12).join('\n');
    if (!window.confirm(
      'Sync ' + roleSyncTotal + ' role(s) from CRM permissions? (' + roleSync.ready.length + ' update' + (roleSync.ready.length === 1 ? '' : 's') + ', ' + roleSync.noProfileYet.length + ' new account' + (roleSync.noProfileYet.length === 1 ? '' : 's') + ')\n\n' + preview
      + (updateLines.length + createLines.length > 12 ? '\n…and ' + (updateLines.length + createLines.length - 12) + ' more' : '')
      + '\n\nNew accounts get a random passcode (nobody needs it — their access is via this CRM login, not a direct passcode login) and can then be linked to any matching orders.\n\nTheir Site Audit dashboard changes immediately.'
    )) return;
    setSyncingRoles(true);
    let ok = 0;
    for (const r of roleSync.ready) {
      try { await sbPatch('profiles', r.profileId, { role: r.targetRole, branch: r.branch }); ok++; } catch { /* keep going; report the total */ }
    }
    for (const r of roleSync.noProfileYet) {
      try {
        await sbPost('profiles', {
          name: r.name, role: r.targetRole, branch: r.branch, contact: r.phone,
          email: syntheticSiteAuditEmail(r.phone), city: 'Bengaluru', installer_type: 'flooring', passcode: randomPasscode(),
        });
        ok++;
      } catch { /* keep going; report the total */ }
    }
    setSyncingRoles(false);
    await load();
    flash('✓ Synced ' + ok + ' of ' + roleSyncTotal + ' role(s)');
  }

  async function resetPasscode(u: ProfileRow) {
    if (!window.confirm(`Reset ${u.name}'s passcode? They will be asked to create a new one on their next sign-in.`)) return;
    try {
      await sbPatch('profiles', u.id, { passcode: null });
      setEditing(null);
      await load();
      flash(`✓ ${u.name}'s passcode has been reset`);
    } catch (e: any) {
      flash('⚠ ' + (e?.message || 'Could not reset passcode'));
    }
  }

  async function removeUser(u: ProfileRow) {
    if (!window.confirm(`Remove ${u.name} from the Site Audit field apps? They lose access immediately.\n\nThis deletes ONLY their field-app profile. Their CRM login in the backend user table is left untouched — remove that under Admin > Users if you also want to revoke CRM access.`)) return;
    try {
      await sbDel('profiles', u.id);
      await load();
      flash(`${u.name} removed from the field apps (CRM login untouched)`);
    } catch (e: any) {
      flash('⚠ ' + (e?.message || 'Could not remove'));
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-lg font-bold text-black">Users</h1>
          <p className="text-[13px] text-gray-400">Manage who has access to the field apps and what role they hold.</p>
        </div>
        <button onClick={() => setAdding(true)} className="ml-auto rounded-md bg-[#1F3A5F] px-3.5 py-2 text-[13px] font-semibold text-white">+ Add User</button>
      </div>

      {unlinked || noCrm ? (
        <div className="mb-3 rounded-md border-l-4 border-amber-500 bg-amber-50 px-3 py-2.5 text-[12.5px] text-amber-800">
          {unlinked ? <><b>{unlinked}</b> {unlinked === 1 ? 'person has' : 'people have'} no phone number — they can&apos;t be matched with a CRM login (availability, payouts, their own dashboard and BM attribution all key off it). </> : null}
          {noCrm ? <><b>{noCrm}</b> {noCrm === 1 ? 'has' : 'have'} a phone but no CRM login. </> : null}
          Set the number on a person with Edit below.
          {suggestable.length ? (
            <button onClick={linkAllSuggested} className="ml-2 rounded-md bg-[#1F3A5F] px-2.5 py-1 text-[12px] font-bold text-white">
              Link {suggestable.length} exact name match{suggestable.length === 1 ? '' : 'es'}
            </button>
          ) : null}
        </div>
      ) : null}

      {bmLink.unlinkedOrders ? (
        <div className="mb-3 rounded-md border-l-4 border-sky-500 bg-sky-50 px-3 py-2.5 text-[12.5px] text-sky-900">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              <b>{bmLink.unlinkedOrders}</b> audit order{bmLink.unlinkedOrders === 1 ? '' : 's'} {bmLink.unlinkedOrders === 1 ? 'is' : 'are'} not linked to a BM account, so {bmLink.unlinkedOrders === 1 ? 'it' : 'they'} only reach a BM dashboard by name match.
            </span>
            {bmProfiles.length && bmLink.linkable ? (
              <button onClick={linkBmOrders} disabled={linkingBm} className="rounded-md bg-[#1F3A5F] px-2.5 py-1 text-[12px] font-bold text-white disabled:opacity-50">
                {linkingBm ? 'Linking…' : 'Link ' + bmLink.linkable + ' by exact name'}
              </button>
            ) : null}
            {bmProfiles.length ? (
              <button onClick={() => setBmPanel((v) => !v)} className="rounded-md border border-sky-300 bg-white px-2.5 py-1 text-[12px] font-bold text-sky-800">
                {bmPanel ? 'Hide names' : 'Link by hand (' + bmLink.names.length + ' name' + (bmLink.names.length === 1 ? '' : 's') + ')'}
              </button>
            ) : <span>Add the Business Managers as users (role: Business Manager) to link them.</span>}
          </div>
          {bmPanel ? (
            <div className="mt-2.5 max-h-[320px] overflow-y-auto rounded-md border border-sky-200 bg-white">
              <table className="w-full">
                <thead>
                  <tr>{['BM name on the order', 'Orders', 'Link to Business Manager'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {bmLink.names.map((n) => (
                    <tr key={n.raw} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-[13px] font-semibold text-gray-800">{n.raw}</td>
                      <td className="px-3 py-2 text-[12.5px] text-gray-500">{n.count}</td>
                      <td className="px-3 py-2">
                        <select
                          defaultValue={n.auto || ''}
                          disabled={linkingBm}
                          onChange={(e) => { if (e.target.value) linkOneBmName(n.raw, e.target.value); }}
                          className="px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white min-w-[200px] focus:border-[#0F766E]"
                        >
                          <option value="">— pick a BM —</option>
                          {bmProfiles.map((p) => <option key={p.id} value={p.email}>{p.name} · {p.email}</option>)}
                        </select>
                        {n.auto ? <span className="ml-2 text-[11px] font-bold text-green-700">exact match</span> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {roleSyncTotal || roleSync.skipped.length || roleSync.noLongerEntitled.length ? (
        <div className="mb-3 rounded-md border-l-4 border-indigo-500 bg-indigo-50 px-3 py-2.5 text-[12.5px] text-indigo-900">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              <b>{roleSyncTotal}</b> CRM permission change{roleSyncTotal === 1 ? '' : 's'} not yet reflected here.
            </span>
            {roleSyncTotal ? (
              <button onClick={applyRoleSync} disabled={syncingRoles} className="rounded-md bg-[#1F3A5F] px-2.5 py-1 text-[12px] font-bold text-white disabled:opacity-50">
                {syncingRoles ? 'Syncing…' : 'Sync ' + roleSyncTotal + ' role' + (roleSyncTotal === 1 ? '' : 's') + ' from CRM permissions'}
              </button>
            ) : null}
            {roleSync.skipped.length || roleSync.noLongerEntitled.length ? (
              <button onClick={() => setRoleSyncPanel((v) => !v)} className="rounded-md border border-indigo-300 bg-white px-2.5 py-1 text-[12px] font-bold text-indigo-800">
                {roleSyncPanel ? 'Hide details' : 'See details (' + roleSync.skipped.length + ' skipped)'}
              </button>
            ) : null}
          </div>
          {roleSyncPanel ? (
            <div className="mt-2.5 max-h-[320px] overflow-y-auto rounded-md border border-indigo-200 bg-white">
              <table className="w-full">
                <thead>
                  <tr>{['Name', 'Status', 'Detail'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {roleSync.noLongerEntitled.map((r) => (
                    <tr key={'gone-' + r.profileId} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-[13px] font-semibold text-gray-800">{r.name}</td>
                      <td className="px-3 py-2 text-[12.5px] text-gray-500">No longer entitled</td>
                      <td className="px-3 py-2 text-[12.5px] text-gray-500">CRM permission &quot;{r.crmPermission}&quot; maps to no access, but still has role &quot;{ROLES[r.currentRole]?.label || r.currentRole}&quot; — remove by hand if intended</td>
                    </tr>
                  ))}
                  {roleSync.skipped.map((r, i) => (
                    <tr key={'skip-' + i} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-[13px] font-semibold text-gray-800">{r.name}</td>
                      <td className="px-3 py-2 text-[12.5px] text-gray-500">Skipped</td>
                      <td className="px-3 py-2 text-[12.5px] text-gray-500">
                        {r.reason === 'field_worker' ? 'CRM permission is "field_worker" — can\'t tell auditor from installer, left as-is'
                          : r.reason === 'protected_role' ? 'Current role is hand-assigned (Category Ops Executive, Store Team, or Content Team) — never auto-changed'
                          : r.reason === 'ambiguous_phone' ? 'Phone number matches zero or multiple people — needs a human to disambiguate'
                          : 'CRM permission not recognised — never guessed at'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] max-w-[320px] flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">🔍</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone or role…" className="w-full rounded-md border border-gray-200 py-2 pl-8 pr-3 text-[13.5px] outline-none focus:border-yellow-400" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['all', ...ROLE_OPTIONS.map(([k]) => k).filter((k) => counts[k])].map((k) => (
            <button
              key={k}
              onClick={() => setRoleFilter(k)}
              className={roleFilter === k ? 'rounded-full bg-[#1A1A1A] px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600'}
            >
              {k === 'all' ? 'All' : ROLES[k]?.label || k} ({k === 'all' ? rows.length : counts[k]})
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        {loading ? (
          <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#EAB308]" /></div>
        ) : err ? (
          <div className="px-4 py-6 text-[13px] text-red-600">{err}</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr>{['Name', 'Email', 'Phone', 'Role', 'City', 'Added', ''].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {filtered.length ? filtered.map((u) => {
                const key = phoneKey(u.contact);
                return (
                  <tr key={u.id} className="border-t border-gray-100">
                    <td className="px-3 py-2.5 text-[13px]">
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: ROLES[u.role]?.color || '#999' }}>{initials(u.name)}</span>
                        <b>{u.name}</b>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[12px] text-gray-500">{u.email}</td>
                    <td className="px-3 py-2.5 font-mono text-[12px]">
                      {key
                        ? <span className={crmPhones.has(key) ? 'text-gray-600' : 'text-amber-700'} title={crmPhones.has(key) ? 'Linked to a CRM login' : 'No CRM login for this number'}>{u.contact}{crmPhones.has(key) ? '' : ' ⚠'}</span>
                        : (() => {
                          const sg = suggestFor(u);
                          return sg
                            ? <span className="text-amber-700" title={'Matches a CRM login with the same name'}>not set · suggest {sg}</span>
                            : <span className="text-red-600">not set</span>;
                        })()}
                    </td>
                    <td className="px-3 py-2.5 text-[13px]">
                      <RoleBadge role={u.role} />
                      {isInstallerRole(u.role) ? <span className="ml-1.5 text-[11px] text-gray-400">{INSTALLER_TYPES.find(([k]) => k === (u.installer_type || 'flooring'))?.[1]}</span> : null}
                    </td>
                    <td className="px-3 py-2.5 text-[12.5px] text-gray-500">{u.city || 'Bengaluru'}</td>
                    <td className="px-3 py-2.5 text-[12px] text-gray-400">{fmtDate(u.created_at)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1.5">
                        <button onClick={() => setEditing(u)} className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-gray-700">✏️ Edit</button>
                        <button onClick={() => removeUser(u)} className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-red-600">🗑</button>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={7} className="border-t border-gray-100 py-10 text-center text-[13px] text-gray-400">No users match your search</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {adding ? <AddUserModal onClose={() => setAdding(false)} onDone={async (m) => { setAdding(false); await load(); flash(m); }} /> : null}
      {editing ? (
        <EditUserModal
          user={editing}
          crmLinked={crmPhones.has(phoneKey(editing.contact))}
          onClose={() => setEditing(null)}
          onResetPasscode={() => resetPasscode(editing)}
          onDone={async (m) => { setEditing(null); await load(); flash(m); }}
        />
      ) : null}

      {toast ? <div className="fixed bottom-6 left-1/2 z-[960] -translate-x-1/2 rounded-full bg-[#16294a] px-5 py-2.5 text-[13.5px] font-semibold text-white shadow-lg">{toast}</div> : null}
    </div>
  );
}

/* ── Add ──────────────────────────────────────────────────────────────── */
function AddUserModal({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => void }) {
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
    if (ph && !/^\d{10}$/.test(ph)) { setErr('Phone must be 10 digits.'); return; }
    if (!ph && makeCrm) { setErr('A phone number is required to create a CRM login.'); return; }
    setBusy(true);
    try {
      await sbPost('profiles', { name: nm, email: em, contact: ph || null, role, installer_type: isInstallerRole(role) ? itype : 'flooring', city, passcode: null });
      // Best-effort and reported separately — a rejected CRM login (duplicate
      // phone, permissions) must not lose the field-app profile we just made.
      let note = '';
      if (makeCrm) {
        const perm = CRM_PERMISSION_FOR[role];
        try {
          await addUser({ name: nm, phone: ph, role: 'post_sales', individualPermissions: perm ? ['crm.site_audit', perm] : ['crm.site_audit'] });
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
      <Field label="Phone (10 digits — links their field app and CRM logins)"><input inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" className={inputCls} /></Field>
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

/* ── Edit ─────────────────────────────────────────────────────────────── */
function EditUserModal({ user: u, crmLinked, onClose, onDone, onResetPasscode }: {
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
      // A fully-blank override is stored as null so it falls back to the global rate.
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
    if (!/^\d{10}$/.test(ph)) { setErr('Set a 10-digit phone number first, then save.'); return; }
    setMakingCrm(true);
    try {
      const perm = CRM_PERMISSION_FOR[role];
      await addUser({ name: u.name, phone: ph, role: 'post_sales', individualPermissions: perm ? ['crm.site_audit', perm] : ['crm.site_audit'] });
      onDone(`✓ CRM login created for ${u.name}`);
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

/* ── shell bits ───────────────────────────────────────────────────────── */
const inputCls = 'w-full rounded-md border border-gray-200 px-2.5 py-2 text-[13px] outline-none focus:border-blue-400';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[950] flex items-center justify-center bg-black/30 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
          <h3 className="text-base font-bold text-gray-900">{title}</h3>
          <button className="text-xl text-gray-400" onClick={onClose}>×</button>
        </div>
        <div className="flex flex-col gap-3.5 px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-gray-500">{label}</label>
      {children}
    </div>
  );
}
function Foot({ children }: { children: React.ReactNode }) {
  return <div className="-mx-5 -mb-4 mt-1 flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-3.5">{children}</div>;
}
