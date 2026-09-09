'use client';

import { BmResolvePlan, applyBmResolve, fetchUnlinkedAuditOrders, planBmResolve } from '../../../data/resolve-bm-from-backend';
import { CITIES } from '../../../shared/city-scope';
import { phoneKey } from '../../../shared/identity';
import { randomPasscode, syntheticSiteAuditEmail } from '../../../shared/identity/role-sync';
import { sbPatchWhere, sbPost } from '../../../shared/sb-client';
import { ProfileRow } from '../types';
import { Dispatch, SetStateAction, useState } from 'react';

export function useBmLinkActions({ bmLink, bmProfiles, flash, load, setBmOrders, setLinkingBm }: {
  bmLink: { unlinkedOrders: number; plan: { raw: string; email: string; name: string; count: number; }[]; names: { raw: string; count: number; auto: string | null; candidates: { name: string; contact: string; role: string; exact: boolean; }[]; }[]; linkable: number; };
  bmProfiles: ProfileRow[];
  flash: (m: string) => void;
  load: () => Promise<void>;
  setBmOrders: Dispatch<SetStateAction<{ bm: string | null; }[] | null>>;
  setLinkingBm: Dispatch<SetStateAction<boolean>>;
}) {
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

const [resolvePlan, setResolvePlan] = useState<BmResolvePlan | null>(null);
const [resolving, setResolving] = useState(false);

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


  return { createResolvedOwners, linkBmOrders, linkOneBmName, makingOwners, resolveFromBackend, resolvePlan, resolving };
}
