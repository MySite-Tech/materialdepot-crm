'use client';

import { BmLinkPanel } from './panels/bm-link';
import { MissingBmsPanel } from './panels/missing-bms';
import { StaffTable } from './ui/table';
import { UnlinkedPanel } from './panels/unlinked';

import { useBmLinkActions } from './hooks/use-bm-link-actions';
import { makeCrmLoginActions } from './actions/crm-logins';
import { makeStaffActions } from './actions/staff';
import { CRM_ROLE_TO_SITE_AUDIT_ROLE, ROLES, exitColumnsAvailable, phoneKey, sbGet, sbPatch, syntheticSiteAuditEmail } from '../../shared';
import { RestoreStaffModal, RetireStaffModal, RetireTarget } from '../staff-modals';
import { ROLE_OPTIONS } from './constants';
import { AddUserModal, EditUserModal } from './ui/modals';
import { ProfileRow } from './types';
import { fetchUsers } from '@/lib/api';
import { useCallback, useEffect, useMemo, useState } from 'react';

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

  const crmPhones = useMemo(
    () => new Set(crmUsers.filter((u) => u.active !== false).map((u) => phoneKey(u.phone)).filter(Boolean)),
    [crmUsers],
  );

  const suggestFor = useCallback((p: ProfileRow): string | null => {
    const target = p.name.trim().toLowerCase().replace(/\s+/g, ' ');
    const hits = crmUsers.filter((u) => (u.name || '').trim().toLowerCase().replace(/\s+/g, ' ') === target);
    if (hits.length !== 1) return null;
    const ph = phoneKey(hits[0].phone);
    if (!ph || rows.some((q) => q.id !== p.id && phoneKey(q.contact) === ph)) return null;
    return ph;
  }, [crmUsers, rows]);

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

  const attrition = useMemo(() => {
    const cut = new Date(Date.now() - 90 * 86400_000).toISOString();
    const recent = former.filter((r) => (r.deleted_at || '') >= cut);
    const byReason: Record<string, number> = {};
    former.forEach((r) => {
      const key = (r.exit_reason || 'Not recorded').split(' — ')[0];
      byReason[key] = (byReason[key] || 0) + 1;
    });

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

  const bmProfiles = useMemo(() => rows.filter((r) => r.role === 'bm' && r.email), [rows]);
  const [bmOrders, setBmOrders] = useState<Array<{ bm: string | null }> | null>(null);
  const [linkingBm, setLinkingBm] = useState(false);
  const [bmPanel, setBmPanel] = useState(false);
  useEffect(() => {
    let alive = true;

    sbGet('audit_orders?select=bm&bm_email=is.null&status=not.in.(deleted,slot_reserved,slot_converted)')
      .then((r) => { if (alive) setBmOrders(Array.isArray(r) ? r : []); })
      .catch(() => { if (alive) setBmOrders([]); });
    return () => { alive = false; };
  }, [rows]);

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

      const crmHits = crmUsers.filter((u) => norm(u.name || '') === target);
      if (crmHits.length !== 1) continue;
      const email = bmEmailByPhone.get(phoneKey(crmHits[0].phone));
      if (email) plan.push({ raw, email, name: raw, count });
    }
    const autoBy = new Map(plan.map((p) => [p.raw, p.email]));

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

  const { createResolvedOwners, linkBmOrders, linkOneBmName, makingOwners, resolveFromBackend, resolvePlan, resolving } = useBmLinkActions({ bmLink, bmProfiles, flash, load, setBmOrders, setLinkingBm });

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

  const { createMissingBms, resetPasscode } = makeStaffActions({ bmMakeList, flash, load, setBmOrders, setEditing, setMakingBms });

  const startRemove = useCallback((u: ProfileRow) => {
    setRetiring({ id: u.id, name: u.name, email: u.email, role: u.role, contact: u.contact, city: u.city });
  }, []);

  const { backfillCrmLogins, createOneCrmLogin } = makeCrmLoginActions({ flash, load, noCrmList, setBackfilling });

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
        <UnlinkedPanel
        backfillCrmLogins={backfillCrmLogins}
        backfilling={backfilling}
        createOneCrmLogin={createOneCrmLogin}
        crmBackfillPanel={crmBackfillPanel}
        linkAllSuggested={linkAllSuggested}
        noCrm={noCrm}
        noCrmList={noCrmList}
        setCrmBackfillPanel={setCrmBackfillPanel}
        suggestable={suggestable}
        unlinked={unlinked}
      />
      ) : null}

      {missingBms.length ? (
        <MissingBmsPanel
        bmMakeList={bmMakeList}
        bmMakePanel={bmMakePanel}
        bmMakeSkip={bmMakeSkip}
        createMissingBms={createMissingBms}
        makingBms={makingBms}
        missingBms={missingBms}
        setBmMakePanel={setBmMakePanel}
        setBmMakeSkip={setBmMakeSkip}
      />
      ) : null}

      {bmLink.unlinkedOrders ? (
        <BmLinkPanel
        bmLink={bmLink}
        bmPanel={bmPanel}
        bmProfiles={bmProfiles}
        createResolvedOwners={createResolvedOwners}
        linkBmOrders={linkBmOrders}
        linkOneBmName={linkOneBmName}
        linkingBm={linkingBm}
        makingOwners={makingOwners}
        resolveFromBackend={resolveFromBackend}
        resolvePlan={resolvePlan}
        resolving={resolving}
        setBmPanel={setBmPanel}
      />
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

      <StaffTable
        canRetire={canRetire}
        createOneCrmLogin={createOneCrmLogin}
        crmPhones={crmPhones}
        err={err}
        filtered={filtered}
        loading={loading}
        setEditing={setEditing}
        setRestoring={setRestoring}
        showingFormer={showingFormer}
        startRemove={startRemove}
        suggestFor={suggestFor}
      />

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
