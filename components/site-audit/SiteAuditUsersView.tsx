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
import { CITIES, CRM_ROLE_TO_SITE_AUDIT_ROLE, ROLES, crmPermissionsForSiteAuditRole, exitColumnsAvailable, fmtDate, initials, phoneKey, randomPasscode, sbGet, sbPatch, sbPatchWhere, sbPost, syntheticSiteAuditEmail } from './siteAuditShared';
import { addUser, fetchUsers } from '@/lib/mockApi';
import { createCrmLoginFor } from './staffDirectory';
import { RestoreStaffModal, RetireStaffModal, type RetireTarget } from './StaffModals';
import { applyBmResolve, fetchUnlinkedAuditOrders, planBmResolve, type BmResolvePlan } from './resolveBmFromBackend';

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
  /* migration 004. Absent (undefined) on every row until it has been run, and
     `select=*` never 42703s, so these need no probe to READ — only writing and
     filtering do. `deleted_at` set = former staff. */
  deleted_at?: string | null;
  deleted_by?: string | null;
  exit_reason?: string | null;
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
/* The role → CRM sub-permission map used to be hand-written here, and again in
   audit-ops/Overlays (with two of the four field roles missing) and again in
   install-ops/Overlays. It is now derived from SITE_AUDIT_PERMISSION_TO_ROLE,
   which is the same table read the other way — see
   `crmPermissionsForSiteAuditRole` in siteAuditShared. */

const isInstallerRole = (r: string) => r === 'installer' || r === 'auditor_installer';

function RoleBadge({ role }: { role: string }) {
  const meta = ROLES[role];
  return (
    <span className="inline-block rounded-md px-2 py-0.5 text-[10.5px] font-bold text-white" style={{ background: meta?.color || '#999' }}>
      {meta?.label || role}
    </span>
  );
}


/* A searchable BM picker. 87 BM accounts in a bare <select> means scrolling a
   list to find "Jhanvi" — with a filter box the by-hand pass over the unlinked
   names is type-three-letters-and-click. Keeps the same contract as the select
   it replaces: it reports the chosen profile's EMAIL, never a name. */
function BmSearchSelect({ options, disabled, suggested, onPick }: {
  options: Array<{ id: string; name: string; email: string; contact: string | null }>;
  disabled: boolean;
  suggested: string | null;
  onPick: (email: string) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const needle = q.trim().toLowerCase();
  const shown = needle ? options.filter((o) => o.name.toLowerCase().includes(needle)) : options;
  return (
    <div className="relative min-w-[220px]">
      <input
        value={q}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        placeholder={suggested ? 'Suggested: ' + suggested : 'Search a BM…'}
        className="w-full px-2.5 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none bg-white focus:border-[#0F766E] disabled:opacity-50"
      />
      {open && !disabled ? (
        <div className="absolute z-20 mt-1 max-h-[220px] w-full overflow-y-auto rounded-md border border-gray-200 bg-white shadow-lg">
          {shown.length ? shown.slice(0, 60).map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { setOpen(false); setQ(''); onPick(o.email); }}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12.5px] text-gray-800 hover:bg-gray-50"
            >
              <span className="font-semibold">{o.name}</span>
              {/* The phone disambiguates the near-namesakes a search invites you
                  to misclick: "harsh" offers Harsh Chaubey and Sai Sri Harsha
                  for an order that says Harsh Singh, and two real Priyas exist.
                  Picking the wrong one moves another BM's orders. */}
              <span className="ml-auto shrink-0 text-[11px] text-gray-400">{o.contact || 'no phone'}</span>
            </button>
          )) : <div className="px-2.5 py-2 text-[12px] text-gray-400">No BM matches “{q}”.</div>}
        </div>
      ) : null}
    </div>
  );
}

/* `actor` is the signed-in admin, for `profiles.deleted_by`. The CRM session
   carries a name and phone but never an email, so the identifier recorded is
   the synthetic address that encodes their number — the same convention the
   rest of this repo uses for a CRM-only person. */
export default function SiteAuditUsersView({ actor }: { actor?: { name?: string; phone?: string; role?: string } | null } = {}) {
  const actorEmail = actor?.phone ? syntheticSiteAuditEmail(actor.phone) : null;
  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [crmUsers, setCrmUsers] = useState<Array<{ id: string | number; name: string; phone: string; role: string; allowedBranches?: string[]; active?: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ProfileRow | null>(null);
  const [toast, setToast] = useState('');
  const [retiring, setRetiring] = useState<RetireTarget | null>(null);
  const [restoring, setRestoring] = useState<(RetireTarget & { exitReason?: string | null }) | null>(null);
  /* False until migration 004 has been run. Gates the Remove control and the
     Former staff chip — a Remove that can only ever fail is worse than none. */
  const [canRetire, setCanRetire] = useState(false);
  const [crmBackfillPanel, setCrmBackfillPanel] = useState(false);
  const [backfilling, setBackfilling] = useState(false);

  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(''), 3000); }, []);

  const load = useCallback(async () => {
    const [res, users] = await Promise.all([
      sbGet('profiles?select=*&order=created_at.desc'),
      fetchUsers().catch(() => []),
    ]);
    if (!Array.isArray(res)) { setErr('Could not load users.'); setLoading(false); return; }
    setErr('');
    setRows(res);
    setCrmUsers((users as Array<{ id: string | number; name: string; phone: string; role: string; allowedBranches?: string[]; active?: boolean }>) || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { exitColumnsAvailable().then(setCanRetire); }, []);

  /* A DEACTIVATED CRM login is not a usable login, so it must not read as
     "linked". `_mapUserOrg` sets `active: u.status !== false` and the type
     spells out that anything deriving access from this list has to check it —
     `SiteAuditBranchManagerView` did, this didn't. Without the filter, someone
     retired here still showed ✓ CRM linked and the amber "no CRM login"
     notice under-counted by exactly the people who had left. */
  const crmPhones = useMemo(
    () => new Set(crmUsers.filter((u) => u.active !== false).map((u) => phoneKey(u.phone)).filter(Boolean)),
    [crmUsers],
  );

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

  /* One fetch, split here. `rows` is every profile ever created; `current` is
     the roster and is what every count, notice and default view is computed
     from — a former staff member must not inflate "14 people have no phone
     number" or the Site Auditor (14) chip, and the whole point of retiring
     someone is that they stop appearing in the numbers. */
  const former = useMemo(() => rows.filter((r) => !!r.deleted_at), [rows]);
  const current = useMemo(() => rows.filter((r) => !r.deleted_at), [rows]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    current.forEach((r) => { c[r.role] = (c[r.role] || 0) + 1; });
    return c;
  }, [current]);

  const matchesQ = useCallback((u: ProfileRow) => {
    if (!q) return true;
    return (u.name + u.email + u.role + (u.contact || '') + (u.exit_reason || '')).toLowerCase().includes(q.toLowerCase());
  }, [q]);

  const showingFormer = roleFilter === 'former';
  const filtered = (showingFormer ? former : current).filter((u) => {
    if (!showingFormer && roleFilter !== 'all' && u.role !== roleFilter) return false;
    return matchesQ(u);
  });

  /* Attrition, over the rolling 90 days and all-time, broken down by the
     reason recorded at removal. This is the number the whole soft delete
     exists to make answerable. */
  const attrition = useMemo(() => {
    const cut = new Date(Date.now() - 90 * 86400_000).toISOString();
    const recent = former.filter((r) => (r.deleted_at || '') >= cut);
    const byReason: Record<string, number> = {};
    former.forEach((r) => {
      const key = (r.exit_reason || 'Not recorded').split(' — ')[0];
      byReason[key] = (byReason[key] || 0) + 1;
    });
    /* Denominator is people who were on the roster during the window, i.e.
       today's roster plus those who left inside it — not today's headcount
       alone, which would overstate the rate for a shrinking team. */
    const exposed = current.length + recent.length;
    return {
      total: former.length,
      recent: recent.length,
      rate: exposed ? Math.round((recent.length / exposed) * 1000) / 10 : 0,
      byReason: Object.entries(byReason).sort((a, b) => b[1] - a[1]),
    };
  }, [former, current]);

  const missingPhone = current.filter((u) => !phoneKey(u.contact));
  const unlinked = missingPhone.length;
  /* The people this fixes: a profile with a real phone and no usable CRM login
     — so `/login-otp/?contact=` has nothing to send an OTP to and they cannot
     sign into the CRM at all, however healthy their field-app profile looks.
     Every staff member added through the legacy PWA lands here, because all
     three of its add-staff forms write a `profiles` row and nothing else. */
  const noCrmList = useMemo(
    () => current.filter((u) => phoneKey(u.contact) && !crmPhones.has(phoneKey(u.contact))),
    [current, crmPhones],
  );
  const noCrm = noCrmList.length;
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
     keys off. Every writer sets both now, so this is a backlog to clean up
     rather than a growing one.

     Matching a free-text name against `profiles.name` resolves almost nothing:
     every live BM profile came from the CRM sync carrying a FIRST NAME
     ("Anubhab", "Shaikh", "Kurugodu") while the orders carry the full one
     ("Anubhab Sarkar", "Shaikh Mohd. Zaid"), so that route linked 0 of 196.
     The CRM roster is the missing hop — it holds the full name AND the phone,
     and the phone is `profiles.contact`. So: order name → exactly one roster
     employee with that exact name → their phone → exactly one BM profile.
     Both hops are exact; nothing here is ever a similarity guess, and a name
     that is really a store ("Whitefield", "JP Nagar") or two people
     ("Anubhab/Zaid") matches nothing and stays in the by-hand list. */
  const bmProfiles = useMemo(() => rows.filter((r) => r.role === 'bm' && r.email), [rows]);
  const [bmOrders, setBmOrders] = useState<Array<{ bm: string | null }> | null>(null);
  const [linkingBm, setLinkingBm] = useState(false);
  const [bmPanel, setBmPanel] = useState(false);
  useEffect(() => {
    let alive = true;
    /* Pre-booked slots are excluded, as they are from every other audit_orders read in the app: a
       slot held or converted at a store counter exists before any enquiry does, so it has no owner to
       resolve and counting it as unlinked creates a to-do that can never be completed. */
    sbGet('audit_orders?select=bm&bm_email=is.null&status=not.in.(deleted,slot_reserved,slot_converted)')
      .then((r) => { if (alive) setBmOrders(Array.isArray(r) ? r : []); })
      .catch(() => { if (alive) setBmOrders([]); });
    return () => { alive = false; };
  }, [rows]);

  /* Phone → the single BM profile carrying it. A number on two BM profiles is
     dropped, not chosen between. */
  const bmEmailByPhone = useMemo(() => {
    const seen = new Map<string, string | null>();
    for (const p of bmProfiles) {
      const key = phoneKey(p.contact);
      if (!key) continue;
      seen.set(key, seen.has(key) ? null : p.email);
    }
    const out = new Map<string, string>();
    for (const [k, v] of seen) if (v) out.set(k, v);
    return out;
  }, [bmProfiles]);

  const bmLink = useMemo(() => {
    const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, ' ');
    const unlinkedOrders = bmOrders ? bmOrders.length : 0;
    const byName = new Map<string, number>();
    for (const o of bmOrders || []) {
      const raw = (o.bm || '').trim();
      if (!raw || raw === '—') continue;
      byName.set(raw, (byName.get(raw) || 0) + 1);
    }
    const plan: Array<{ raw: string; email: string; name: string; count: number }> = [];
    for (const [raw, count] of byName) {
      const target = norm(raw);
      const hits = bmProfiles.filter((p) => norm(p.name) === target);
      if (hits.length === 1) { plan.push({ raw, email: hits[0].email, name: hits[0].name, count }); continue; }
      if (hits.length > 1) continue;
      // Via the CRM roster: exact full name → phone → BM profile. `bm` is left
      // as it is, because the roster name it matched IS what the row says.
      const crmHits = crmUsers.filter((u) => norm(u.name || '') === target);
      if (crmHits.length !== 1) continue;
      const email = bmEmailByPhone.get(phoneKey(crmHits[0].phone));
      if (email) plan.push({ raw, email, name: raw, count });
    }
    const autoBy = new Map(plan.map((p) => [p.raw, p.email]));

    /* Who this name probably is, and on what number — so the row can be linked without
       opening another tab to look the person up. Exact match first (that is the auto-link
       case anyway), then first-name/word overlap, which is what the hard rows actually are:
       "Dhruv" typed at a counter against the account "Dhruv Gangrade". Drawn only from the
       BM profiles and CRM roster already in memory, so this costs no request. A name with no
       candidate at all is the useful negative signal — "Whitefield" is a store, not a person,
       and will never link. */
    const candidatesFor = (raw: string) => {
      const target = norm(raw);
      const words = new Set(target.split(' ').filter(Boolean));
      const seen = new Set<string>();
      const out: Array<{ name: string; contact: string; role: string; exact: boolean }> = [];
      const add = (name: string, contact: string | null, role: string, exact: boolean) => {
        const key = phoneKey(contact || '');
        if (!name || !key || seen.has(key) || out.length >= 3) return;
        seen.add(key);
        out.push({ name, contact: String(contact), role, exact });
      };
      /* Every profile, not just the BMs, plus the CRM roster: the question this column answers
         is "who is this", and a name that turns out to belong to an admin is exactly the sort of
         thing worth seeing before linking. The role travels with it so a match that cannot be
         linked as a BM is obvious rather than misleading. */
      const pool: Array<{ name: string; contact: string | null; role: string }> = [
        ...rows.map((p) => ({ name: p.name, contact: p.contact, role: p.role })),
        ...crmUsers.map((u) => ({ name: u.name, contact: u.phone, role: u.role || '' })),
      ];
      for (const c of pool) if (norm(c.name || '') === target) add(c.name, c.contact, c.role, true);
      for (const c of pool) {
        const cw = norm(c.name || '').split(' ').filter(Boolean);
        if (cw.some((w) => words.has(w))) add(c.name, c.contact, c.role, false);
      }
      return out;
    };

    const names = [...byName.entries()]
      .map(([raw, count]) => ({ raw, count, auto: autoBy.get(raw) || null, candidates: candidatesFor(raw) }))
      .sort((a, b) => b.count - a.count || a.raw.localeCompare(b.raw));
    return { unlinkedOrders, plan, names, linkable: plan.reduce((s, p) => s + p.count, 0) };
  }, [bmOrders, bmProfiles, crmUsers, bmEmailByPhone, rows]);

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
        'bm=eq.' + encodeURIComponent(raw) + '&bm_email=is.null&status=not.in.(deleted,slot_reserved,slot_converted)',
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
      'Link ' + bmLink.linkable + ' audit order(s) to a BM account by exact match?\n\n' + preview
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
          'bm=eq.' + encodeURIComponent(p.raw) + '&bm_email=is.null&status=not.in.(deleted,slot_reserved,slot_converted)',
          { bm: p.name, bm_email: p.email }
        );
      } catch { /* keep going; the total below reports what landed */ }
    }
    setLinkingBm(false);
    setBmOrders(null);
    await load();
    flash('✓ Linked ' + ok + ' order(s) to a BM account');
  }

  /* ── Resolve the owner from the backend ─────────────────────────────────
     The authoritative path, and the one that needs no name at all: the enquiry
     behind the order already has an owner, and the endpoint the auto-import
     reads returns it (`bm: {name, contact}`). Phone → account, patch, done —
     a typo at a store counter stops mattering. The by-name matcher below stays
     for rows carrying no enquiry id. */
  const [resolvePlan, setResolvePlan] = useState<BmResolvePlan | null>(null);
  const [resolving, setResolving] = useState(false);

  /* Accounts for the owners the BACKEND named, not for people a permission
     label calls BMs. Whoever owns the enquiry owns the order — Harsh Singh
     carries ~1500 clients under the label `manager`, and gating account
     creation on that label is precisely why his orders sat unattributed. There
     is nothing to decide here: the row exists because the backend already
     attributed an order to them. */
  const [makingOwners, setMakingOwners] = useState(false);

  async function createResolvedOwners() {
    const need = resolvePlan?.needAccount || [];
    if (!need.length) return;
    if (!window.confirm(
      'Create ' + need.length + ' Site Audit BM account(s) for the owners the backend named?\n\n'
      + need.slice(0, 12).map((o) => o.name + ' · ' + o.contact + ' (' + o.rows + ' order' + (o.rows === 1 ? '' : 's') + ')').join('\n')
      + (need.length > 12 ? '\n…and ' + (need.length - 12) + ' more' : '')
      + '\n\nTheir orders link straight after.'
    )) return;
    setMakingOwners(true);
    let ok = 0;
    for (const o of need) {
      try {
        await sbPost('profiles', {
          name: o.name || o.contact,
          email: syntheticSiteAuditEmail(o.contact),
          role: 'bm',
          contact: phoneKey(o.contact),
          city: CITIES[0],
          installer_type: 'flooring',
          passcode: randomPasscode(),
        });
        ok++;
      } catch (e: any) {
        console.error('[siteAudit] could not create owner account', o.name, e?.message);
      }
    }
    setMakingOwners(false);
    await load();
    flash('✓ Created ' + ok + ' account(s) — resolving their orders…');
    await resolveFromBackend();
  }

  async function resolveFromBackend() {
    setResolving(true);
    try {
      const unlinked = await fetchUnlinkedAuditOrders();
      const plan = await planBmResolve(unlinked);
      setResolvePlan(plan);
      if (!plan.ready.length) {
        flash(plan.needAccount.length
          ? '⚠ ' + plan.needAccount.length + ' owner(s) have no Site Audit account — create them below'
          : '⚠ The backend could not name an owner for any unlinked order');
        setResolving(false);
        return;
      }
      if (!window.confirm(
        'Link ' + plan.ready.length + ' order(s) to the BM the backend says owns the enquiry?\n\n'
        + [...new Map(plan.ready.map((r) => [r.email, r.name])).entries()].slice(0, 12).map(([, n]) => n).join('\n')
        + '\n\nThe name on the order is ignored — attribution comes from the estimate\'s own owner.'
      )) { setResolving(false); return; }
      const done = await applyBmResolve(plan);
      setBmOrders(null);
      await load();
      const rest = plan.needAccount.reduce((n, o) => n + o.rows, 0);
      flash('✓ Linked ' + done + ' order(s)'
        + (rest ? ' · ' + rest + ' more need their owner to have an account' : '')
        + (plan.unresolved ? ' · ' + plan.unresolved + ' had no enquiry the backend knows' : ''));
    } catch (e: any) {
      flash('⚠ ' + (e?.message || 'Could not resolve from the backend'));
    }
    setResolving(false);
  }

  /* ── BMs with no Site Audit account ─────────────────────────────────────
     The root cause behind a slice of the unlinked orders: `bm_email` can only
     point at a `profiles` row, so a BM the CRM knows about but Site Audit has
     never heard of is unlinkable by construction — no picker lists them and no
     backfill can resolve them.

     This is deliberately narrower than the old role-sync's `noProfileYet`,
     which was dropped for provisioning field-app logins for ~70 desk staff who
     never do field work. A BM profile earns its row for one concrete reason:
     it is the join target order attribution needs. Branch managers and service
     managers still get nothing — they render from their CRM session and slug. */
  const profilePhones = useMemo(() => new Set(rows.map((r) => phoneKey(r.contact)).filter(Boolean)), [rows]);
  const missingBms = useMemo(() => crmUsers.filter((u) => (
    u.active !== false
    && CRM_ROLE_TO_SITE_AUDIT_ROLE[u.role] === 'bm'
    && phoneKey(u.phone)
    && !profilePhones.has(phoneKey(u.phone))
  )), [crmUsers, profilePhones]);
  const [bmMakePanel, setBmMakePanel] = useState(false);
  const [bmMakeSkip, setBmMakeSkip] = useState<Set<string>>(new Set());
  const [makingBms, setMakingBms] = useState(false);
  const bmMakeList = missingBms.filter((u) => !bmMakeSkip.has(String(u.id)));

  async function createMissingBms() {
    if (!bmMakeList.length) return;
    if (!window.confirm(
      'Create ' + bmMakeList.length + ' Site Audit BM account(s)?\n\n'
      + bmMakeList.slice(0, 12).map((u) => u.name + ' · ' + u.phone).join('\n')
      + (bmMakeList.length > 12 ? '\n…and ' + (bmMakeList.length - 12) + ' more' : '')
      + '\n\nThey get a Business Manager dashboard, and orders attributed to them can link from then on.'
    )) return;
    setMakingBms(true);
    let ok = 0;
    const failed: string[] = [];
    for (const u of bmMakeList) {
      try {
        await sbPost('profiles', {
          name: u.name,
          // Same synthetic identity the CRM sync uses — access is via the CRM
          // session (resolved by phone), never this address or the passcode.
          email: syntheticSiteAuditEmail(u.phone),
          role: 'bm',
          contact: phoneKey(u.phone),
          city: (u.allowedBranches || []).some((b) => /hyder|gachi|kompally/i.test(b)) ? 'Hyderabad' : CITIES[0],
          installer_type: 'flooring',
          passcode: randomPasscode(),
        });
        ok++;
      } catch (e: any) {
        failed.push(u.name + ' (' + (e?.message || 'write failed') + ')');
      }
    }
    setMakingBms(false);
    setBmOrders(null);
    await load();
    if (failed.length) {
      console.error('[siteAudit] BM account creation failures', failed);
      flash('✓ Created ' + ok + ' of ' + bmMakeList.length + ' — failed: ' + failed.slice(0, 3).join(', '));
    } else {
      flash('✓ Created ' + ok + ' BM account(s) — press “Link by exact match” to attribute their orders');
    }
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

  /* Removal used to be `sbDel` behind a `window.confirm` whose own text
     admitted the gap: it deleted the field-app profile and left the CRM login
     alive, so a person who had left could still sign in — and the row was
     gone, so nobody could say how many had left. Both halves are now handled
     by RetireStaffModal, which records a reason (what the attrition breakdown
     groups by) and deactivates the CRM login by default. */
  const startRemove = useCallback((u: ProfileRow) => {
    setRetiring({ id: u.id, name: u.name, email: u.email, role: u.role, contact: u.contact, city: u.city });
  }, []);

  /* Backfill the CRM logins for everyone who has a phone but no usable one.
     Sequential on purpose: `addUser` is a Django write per person and the
     backend rejects a duplicate contact, so a failure here is per-person
     information worth keeping rather than one aborted batch. */
  async function backfillCrmLogins() {
    if (!noCrmList.length) return;
    setBackfilling(true);
    let ok = 0;
    const failed: string[] = [];
    for (const p of noCrmList) {
      try {
        await createCrmLoginFor(p);
        ok++;
      } catch (e: any) {
        failed.push(p.name + ' (' + (e?.message || 'backend error') + ')');
      }
    }
    await load();
    setBackfilling(false);
    if (failed.length) {
      console.error('[siteAudit] CRM login backfill failures', failed);
      flash('✓ Created ' + ok + ' of ' + noCrmList.length + ' — failed: ' + failed.slice(0, 2).join(', ') + (failed.length > 2 ? ' and ' + (failed.length - 2) + ' more (see console)' : ''));
    } else {
      flash('✓ Created ' + ok + ' CRM login' + (ok === 1 ? '' : 's') + ' — they can sign in with their phone number now');
    }
  }

  async function createOneCrmLogin(u: ProfileRow) {
    try {
      await createCrmLoginFor(u);
      await load();
      flash('✓ ' + u.name + ' can sign into the CRM with ' + u.contact + ' now');
    } catch (e: any) {
      flash('⚠ ' + (e?.message || 'Could not create their CRM login'));
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
          {noCrm ? <><b>{noCrm}</b> {noCrm === 1 ? 'has' : 'have'} a phone but <b>no CRM login</b>, so <code>/login-otp/</code> has no account to send an OTP to and they cannot sign in here at all. </> : null}
          Set a number on a person with Edit below.
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {suggestable.length ? (
              <button onClick={linkAllSuggested} className="rounded-md bg-[#1F3A5F] px-2.5 py-1 text-[12px] font-bold text-white">
                Link {suggestable.length} exact name match{suggestable.length === 1 ? '' : 'es'}
              </button>
            ) : null}
            {/* The banner used to state the count and stop, leaving the only
                fix buried inside one person's Edit form. This creates the
                missing logins in bulk, with the same two permissions a fresh
                add would grant. */}
            {noCrm ? (
              <>
                <button onClick={backfillCrmLogins} disabled={backfilling} className="rounded-md bg-[#1F3A5F] px-2.5 py-1 text-[12px] font-bold text-white disabled:opacity-50">
                  {backfilling ? 'Creating…' : 'Create ' + noCrm + ' missing CRM login' + (noCrm === 1 ? '' : 's')}
                </button>
                <button onClick={() => setCrmBackfillPanel((v) => !v)} className="rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[12px] font-bold text-amber-800">
                  {crmBackfillPanel ? 'Hide who' : 'See who (' + noCrm + ')'}
                </button>
              </>
            ) : null}
          </div>
          {crmBackfillPanel && noCrm ? (
            <div className="mt-2.5 max-h-[280px] overflow-y-auto rounded-md border border-amber-200 bg-white">
              <table className="w-full">
                <thead><tr>{['Name', 'Phone', 'Role', 'City', 'Added', ''].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                ))}</tr></thead>
                <tbody>
                  {noCrmList.map((u) => (
                    <tr key={u.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-[13px] font-semibold text-gray-800">{u.name}</td>
                      <td className="px-3 py-2 font-mono text-[12px] text-gray-600">{u.contact}</td>
                      <td className="px-3 py-2 text-[12.5px]"><RoleBadge role={u.role} /></td>
                      <td className="px-3 py-2 text-[12.5px] text-gray-500">{u.city || 'Bengaluru'}</td>
                      <td className="px-3 py-2 text-[12px] text-gray-400">{fmtDate(u.created_at)}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => createOneCrmLogin(u)} className="rounded-md border border-gray-200 bg-white px-2.5 py-1 text-[12px] font-bold text-[#1F3A5F]">Create login</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {missingBms.length ? (
        <div className="mb-3 rounded-md border-l-4 border-violet-500 bg-violet-50 px-3 py-2.5 text-[12.5px] text-violet-900">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              <b>{missingBms.length}</b> Business Manager{missingBms.length === 1 ? '' : 's'} in the CRM {missingBms.length === 1 ? 'has' : 'have'} no Site Audit account, so orders attributed to {missingBms.length === 1 ? 'them' : 'them'} can never link to a dashboard.
            </span>
            <button onClick={createMissingBms} disabled={makingBms || !bmMakeList.length} className="rounded-md bg-[#1F3A5F] px-2.5 py-1 text-[12px] font-bold text-white disabled:opacity-50">
              {makingBms ? 'Creating…' : 'Create ' + bmMakeList.length + ' BM account' + (bmMakeList.length === 1 ? '' : 's')}
            </button>
            <button onClick={() => setBmMakePanel((v) => !v)} className="rounded-md border border-violet-300 bg-white px-2.5 py-1 text-[12px] font-bold text-violet-800">
              {bmMakePanel ? 'Hide list' : 'Review the list'}
            </button>
          </div>
          {/* Reviewable rather than blind: the CRM roster carries placeholder
              accounts ("User", "Random", "none") that must not become BM
              dashboards. Untick and they are left alone. */}
          {bmMakePanel ? (
            <div className="mt-2.5 max-h-[280px] overflow-y-auto rounded-md border border-violet-200 bg-white">
              {missingBms.map((u) => {
                const off = bmMakeSkip.has(String(u.id));
                return (
                  <label key={String(u.id)} className="flex items-center gap-2 border-t border-gray-100 px-3 py-1.5 text-[12.5px] first:border-t-0">
                    <input
                      type="checkbox"
                      checked={!off}
                      onChange={() => setBmMakeSkip((prev) => {
                        const next = new Set(prev);
                        if (off) next.delete(String(u.id)); else next.add(String(u.id));
                        return next;
                      })}
                    />
                    <span className="font-semibold text-gray-800">{u.name}</span>
                    <span className="text-gray-400">{u.phone}</span>
                    <span className="ml-auto text-[11px] uppercase tracking-wider text-gray-400">{u.role}</span>
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {bmLink.unlinkedOrders ? (
        <div className="mb-3 rounded-md border-l-4 border-sky-500 bg-sky-50 px-3 py-2.5 text-[12.5px] text-sky-900">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              <b>{bmLink.unlinkedOrders}</b> audit order{bmLink.unlinkedOrders === 1 ? '' : 's'} {bmLink.unlinkedOrders === 1 ? 'is' : 'are'} not linked to a BM account, so {bmLink.unlinkedOrders === 1 ? 'it' : 'they'} only reach a BM dashboard by name match.
            </span>
            <button onClick={resolveFromBackend} disabled={resolving} className="rounded-md bg-[#0F766E] px-2.5 py-1 text-[12px] font-bold text-white disabled:opacity-50">
              {resolving ? 'Resolving…' : 'Resolve owners from the backend'}
            </button>
            {bmProfiles.length && bmLink.linkable ? (
              <button onClick={linkBmOrders} disabled={linkingBm} className="rounded-md bg-[#1F3A5F] px-2.5 py-1 text-[12px] font-bold text-white disabled:opacity-50">
                {linkingBm ? 'Linking…' : 'Link ' + bmLink.linkable + ' by exact match'}
              </button>
            ) : null}
            {bmProfiles.length ? (
              <button onClick={() => setBmPanel((v) => !v)} className="rounded-md border border-sky-300 bg-white px-2.5 py-1 text-[12px] font-bold text-sky-800">
                {bmPanel ? 'Hide names' : 'Link by hand (' + bmLink.names.length + ' name' + (bmLink.names.length === 1 ? '' : 's') + ')'}
              </button>
            ) : <span>Add the Business Managers as users (role: Business Manager) to link them.</span>}
          </div>
          {resolvePlan && (resolvePlan.needAccount.length || resolvePlan.unresolved) ? (
            <div className="mt-2.5 rounded-md border border-sky-200 bg-white px-3 py-2 text-[12px] text-gray-600">
              {resolvePlan.needAccount.length ? (
                <div>
                  <b>{resolvePlan.needAccount.reduce((n, o) => n + o.rows, 0)}</b> order(s) belong to{' '}
                  <b>{resolvePlan.needAccount.length}</b> owner(s) with no Site Audit account:{' '}
                  {resolvePlan.needAccount.slice(0, 8).map((o) => o.name + (o.contact ? ' · ' + o.contact : '') + ' (' + o.rows + ')').join(', ')}
                  {resolvePlan.needAccount.length > 8 ? ' …' : ''}.
                  <button
                    onClick={createResolvedOwners}
                    disabled={makingOwners || resolving}
                    className="ml-2 rounded-md bg-[#1F3A5F] px-2.5 py-1 text-[12px] font-bold text-white disabled:opacity-50"
                  >
                    {makingOwners ? 'Creating…' : 'Create ' + resolvePlan.needAccount.length + ' account' + (resolvePlan.needAccount.length === 1 ? '' : 's') + ' and link'}
                  </button>
                </div>
              ) : null}
              {resolvePlan.unresolved ? <div className="mt-1">{resolvePlan.unresolved} order(s) carry no enquiry id the backend knows — link those by hand below.</div> : null}
              {resolvePlan.truncated ? <div className="mt-1 text-amber-700">The backend list was read up to its page cap, so older jobs may not be covered.</div> : null}
            </div>
          ) : null}
          {bmPanel ? (
            <div className="mt-2.5 max-h-[320px] overflow-y-auto rounded-md border border-sky-200 bg-white">
              <table className="w-full">
                <thead>
                  <tr>{['BM name on the order', 'Orders', 'Likely person · contact', 'Link to Business Manager'].map((h) => (
                    <th key={h} className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {bmLink.names.map((n) => (
                    <tr key={n.raw} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-[13px] font-semibold text-gray-800">{n.raw}</td>
                      <td className="px-3 py-2 text-[12.5px] text-gray-500">{n.count}</td>
                      <td className="px-3 py-2 text-[12.5px] whitespace-nowrap">
                        {n.candidates.length ? (
                          n.candidates.map((c) => (
                            <div key={c.contact} className={c.exact ? 'text-gray-800' : 'text-gray-500'}>
                              <a href={'tel:' + c.contact} className="font-semibold underline decoration-gray-300">{c.contact}</a>
                              {c.name && c.name.trim().toLowerCase() !== n.raw.trim().toLowerCase()
                                ? <span className="ml-1.5 text-gray-400">{c.name}</span> : null}
                              {c.role && c.role !== 'bm'
                                ? <span className="ml-1 text-[11px] text-amber-700">{ROLES[c.role]?.label || c.role}</span> : null}
                            </div>
                          ))
                        ) : (
                          <span className="text-gray-400">no matching person</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <BmSearchSelect
                            options={bmProfiles.map((p) => ({ id: p.id, name: p.name, email: p.email, contact: p.contact }))}
                            disabled={linkingBm}
                            suggested={n.auto ? (bmProfiles.find((p) => p.email === n.auto)?.name || null) : null}
                            onPick={(email) => linkOneBmName(n.raw, email)}
                          />
                          {n.auto ? <span className="shrink-0 text-[11px] font-bold text-green-700">exact match</span> : null}
                        </div>
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
              {k === 'all' ? 'All' : ROLES[k]?.label || k} ({k === 'all' ? current.length : counts[k]})
            </button>
          ))}
          {/* Only once there is something to show. A "Former staff (0)" chip
              before the migration has run reads as "nobody has ever left",
              which is a claim this screen can't make yet. */}
          {canRetire && former.length ? (
            <button
              onClick={() => setRoleFilter('former')}
              className={showingFormer ? 'rounded-full bg-red-700 px-3 py-1.5 text-xs font-semibold text-white' : 'rounded-full border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700'}
            >
              Former staff ({former.length})
            </button>
          ) : null}
        </div>
      </div>

      {showingFormer ? (
        <div className="mb-3 rounded-md border-l-4 border-gray-400 bg-gray-50 px-3 py-2.5 text-[12.5px] text-gray-700">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
            <span><b className="text-[15px]">{attrition.total}</b> people have left in total</span>
            <span><b className="text-[15px]">{attrition.recent}</b> in the last 90 days</span>
            {/* Denominator is the roster plus those who left inside the
                window, not today's headcount — otherwise a shrinking team
                reports a rate above its own losses. */}
            <span><b className="text-[15px]">{attrition.rate}%</b> 90-day attrition, against {current.length + attrition.recent} people on the roster in that window</span>
          </div>
          {attrition.byReason.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {attrition.byReason.map(([reason, n]) => (
                <span key={reason} className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[11.5px] font-semibold text-gray-700">{reason} · {n}</span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        {loading ? (
          <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#EAB308]" /></div>
        ) : err ? (
          <div className="px-4 py-6 text-[13px] text-red-600">{err}</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr>{(showingFormer
                ? ['Name', 'Email', 'Phone', 'Role', 'City', 'Left on', 'Reason', 'Removed by', '']
                : ['Name', 'Email', 'Phone', 'Role', 'City', 'Added', '']
              ).map((h, i) => (
                <th key={h + i} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
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
                        ? (crmPhones.has(key) || showingFormer
                          ? <span className="text-gray-600" title={showingFormer ? 'Former staff' : 'Linked to a CRM login'}>{u.contact}</span>
                          : (
                            <span className="text-amber-700" title="No usable CRM login for this number — they cannot be sent an OTP, so they cannot sign in here">
                              {u.contact} ⚠
                              <button onClick={() => createOneCrmLogin(u)} className="ml-1.5 rounded border border-amber-300 bg-white px-1.5 py-0.5 text-[10.5px] font-bold text-amber-800">Fix</button>
                            </span>
                          ))
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
                    {showingFormer ? (
                      <>
                        <td className="px-3 py-2.5 text-[12px] text-gray-500">{fmtDate(u.deleted_at)}</td>
                        <td className="px-3 py-2.5 text-[12.5px] text-gray-700">{u.exit_reason || '—'}</td>
                        <td className="px-3 py-2.5 text-[11.5px] text-gray-400">{u.deleted_by || '—'}</td>
                        <td className="px-3 py-2.5">
                          <button
                            onClick={() => setRestoring({ id: u.id, name: u.name, email: u.email, role: u.role, contact: u.contact, city: u.city, exitReason: u.exit_reason })}
                            className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[#1f7a3f]"
                          >
                            Bring back
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2.5 text-[12px] text-gray-400">{fmtDate(u.created_at)}</td>
                        <td className="px-3 py-2.5">
                          <div className="flex gap-1.5">
                            <button onClick={() => setEditing(u)} className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-gray-700">✏️ Edit</button>
                            {/* Disabled rather than hidden before migration 004:
                                a control that vanishes reads as "you may not do
                                this", and the truth is "the DB can't record it
                                yet" — which the tooltip says. */}
                            <button
                              onClick={() => startRemove(u)}
                              disabled={!canRetire}
                              title={canRetire ? 'Mark as no longer staff' : 'Needs site-audit-migration-004-staff-exit.sql to be run first'}
                              className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              }) : (
                <tr><td colSpan={showingFormer ? 9 : 7} className="border-t border-gray-100 py-10 text-center text-[13px] text-gray-400">
                  {showingFormer ? 'Nobody has been removed yet.' : 'No users match your search'}
                </td></tr>
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

      {retiring ? (
        <RetireStaffModal
          person={retiring} actorEmail={actorEmail}
          onClose={() => setRetiring(null)}
          onDone={async (m) => { await load(); flash(m); }}
        />
      ) : null}
      {restoring ? (
        <RestoreStaffModal
          person={restoring}
          onClose={() => setRestoring(null)}
          onDone={async (m) => { await load(); flash(m); }}
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
    /* The phone is the identity, not a detail: it is what a CRM session is
       resolved by, what order attribution keys off, and what payouts and
       availability are looked up with. A profile without one is a row nothing
       can find — 15 of them exist and every one had to be chased down by hand
       afterwards. Required at creation rather than repaired later. */
    if (!/^\d{10}$/.test(ph)) { setErr('A 10-digit phone number is required — it is what links this person to their CRM login, their orders and their payouts.'); return; }
    setBusy(true);
    try {
      await sbPost('profiles', { name: nm, email: em, contact: ph || null, role, installer_type: isInstallerRole(role) ? itype : 'flooring', city, passcode: null });
      // Best-effort and reported separately — a rejected CRM login (duplicate
      // phone, permissions) must not lose the field-app profile we just made.
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
    if (!/^\d{10}$/.test(ph)) { setErr('Enter a 10-digit phone number first.'); return; }
    setMakingCrm(true);
    try {
      /* The profile has to learn the number BEFORE a login is created against
         it. This button reads the live input, so typing a new number and
         clicking here without pressing Save made a CRM login for a phone
         `profiles.contact` had never heard of: the two halves keyed to
         different numbers, and the ⚠ was still on the row after the reload —
         which reads as "the button didn't work". */
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
