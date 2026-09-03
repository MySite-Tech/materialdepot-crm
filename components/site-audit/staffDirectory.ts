'use client';

/* ── One field staff member, two systems ──────────────────────────────────
   A person who does field work exists twice and has to, because the two
   halves are keyed differently:

     profiles          (Site Audit Supabase, EMAIL-keyed)  — what the field
                       PWAs log into, and where role/city/caps/availability
                       live.
     UserOrganisation  (Django, PHONE-keyed)               — what the CRM logs
                       into, and the only table `/login-otp/?contact=` will
                       send an OTP for.

   `profiles.contact` is the only bridge between them. Everything that keys
   off a person — their own dashboard, availability, payouts, BM attribution —
   resolves through it by exact phone match.

   This module exists because that pairing kept being written by halves:

   - All three add-staff forms in the legacy `material-depot-site` PWA
     (`SM_Install_Dashboard.html:3109`, `SM_Audit_Dashboard.html:2553`,
     `Admin.html:707`) insert a `profiles` row with no `contact` and no CRM
     user at all. That is the source of the 14 live profiles with no phone
     number, and of every field worker who cannot sign into the CRM.
   - The CRM's own three forms each carried their own hand-copied permission
     map and their own copy of the two writes, and they had already diverged.

   So: one `createFieldStaff` that writes both sides, one `retireFieldStaff`
   that revokes both, and the CRM half always reported separately — a rejected
   CRM login must never roll back the field-app profile, because the profile is
   the half the person's jobs hang off. */

import {
  ExitColumnsMissing, crmPermissionsForSiteAuditRole, phoneKey, restoreProfile, retireProfile, sbPost,
} from './siteAuditShared';
import { addUser, fetchUsers, updateUser } from '@/lib/mockApi';

export type CreateStaffInput = {
  name: string;
  email: string;
  phone: string;
  /* profiles.role — site_auditor | installer | auditor_installer | … */
  role: string;
  installerType?: string | null;
  city: string;
  /* Off only when the person already has a CRM login under Admin > Users. */
  withCrmLogin?: boolean;
};

/* `crmNote` is a human-readable suffix for the caller's toast, empty when
   there is nothing to report. `crmOk` is false ONLY when a login was asked for
   and could not be made — a caller that skipped it gets `crmOk: true`. */
export type CreateStaffResult = { profileId: string | null; crmOk: boolean; crmNote: string };

/* The CRM role every field worker is created under. `post_sales` is a
   cost-centre label, not an access level (see CLAUDE.md — `permission_name` is
   HR metadata and nothing may be gated on it); the individual permissions
   below are what actually grant access. */
const FIELD_STAFF_CRM_ROLE = 'post_sales';

export function validateStaffInput(i: Partial<CreateStaffInput>): string {
  const nm = (i.name || '').trim();
  const em = (i.email || '').trim();
  const ph = phoneKey(i.phone);
  if (!nm) return 'Name is required.';
  if (!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return 'Enter a valid email address.';
  /* Phone is required, not optional, and this is deliberate. A profile with no
     `contact` can never be matched to a CRM login, which means no own
     dashboard, no availability, no payout and no BM attribution — 14 live
     profiles are in exactly that state because the legacy forms never asked.
     Refusing here is the only thing that stops the 15th. */
  if (!/^\d{10}$/.test(ph)) return 'Phone must be 10 digits — it is the only thing linking their field app and CRM logins.';
  if (!i.role) return 'Pick a role.';
  if (!i.city) return 'Pick a city — they will only be scheduled for this city.';
  return '';
}

export async function createFieldStaff(i: CreateStaffInput): Promise<CreateStaffResult> {
  const nm = i.name.trim();
  const em = i.email.trim().toLowerCase();
  const ph = phoneKey(i.phone);

  /* The field-app profile first, and on its own. `installer_type` stays
     'flooring' for a non-installer rather than NULL, matching what both
     existing forms wrote — the column is read unconditionally by the installer
     views. `city` is REQUIRED: it was omitted entirely by the older installer
     form, and `cityOf()` reads NULL as Bengaluru, which filed Hyderabad hires
     under Bengaluru capacity. */
  const created = await sbPost('profiles', {
    name: nm,
    email: em,
    contact: ph,
    role: i.role,
    installer_type: i.installerType || 'flooring',
    city: i.city,
    passcode: null,
  });
  const profileId = Array.isArray(created) ? (created[0]?.id ?? null) : (created?.id ?? null);

  if (i.withCrmLogin === false) {
    return { profileId, crmOk: true, crmNote: '' };
  }

  /* Best-effort and reported separately — a duplicate phone or a permission
     error on the Django side must not lose the profile we just wrote. */
  try {
    await addUser({
      name: nm,
      phone: ph,
      role: FIELD_STAFF_CRM_ROLE,
      individualPermissions: crmPermissionsForSiteAuditRole(i.role),
    });
    return { profileId, crmOk: true, crmNote: '' };
  } catch (e: any) {
    return {
      profileId,
      crmOk: false,
      crmNote: ' · ⚠ CRM login NOT created (' + (e?.message || 'backend error') + ') — they can use the field app but cannot sign into the CRM. Retry from Site Audit > Users.',
    };
  }
}

/* ── Backfilling a missing CRM login ──────────────────────────────────────
   For the people already in `profiles` with a phone and no CRM user, which is
   the state the legacy forms leave everyone in. Same two permissions as a
   fresh create, so a backfilled login is indistinguishable from one made
   here. */
export async function createCrmLoginFor(p: { name: string; contact: string | null; role: string }): Promise<void> {
  const ph = phoneKey(p.contact);
  if (!/^\d{10}$/.test(ph)) throw new Error('Needs a 10-digit phone number on the profile first.');
  await addUser({
    name: p.name,
    phone: ph,
    role: FIELD_STAFF_CRM_ROLE,
    individualPermissions: crmPermissionsForSiteAuditRole(p.role),
  });
}

/* ── Revoking ─────────────────────────────────────────────────────────────
   Two writes again, and the ORDER matters. The field-app profile is retired
   first: it is the half that hands out jobs, and if the second write fails we
   want the person off the roster rather than on it. The CRM side is
   DEACTIVATED (`status: false`), never deleted — `_mapUserOrg` reads that into
   `AppUser.active`, Admin > Users still lists them so the account can be
   managed, and their historic orders keep resolving to a real name instead of
   becoming unattributed rows.

   Anything deriving ACCESS or a live roster from `fetchUsers()` therefore has
   to check `active !== false`. `SiteAuditBranchManagerView` already did;
   `SiteAuditUsersView`'s CRM-link check and the ops views' BM picker did not,
   and both are fixed alongside this. */
export type RetireResult = { crmOk: boolean; crmNote: string };

export async function retireFieldStaff(
  p: { id: string; name: string; contact: string | null },
  opts: { by?: string | null; reason?: string | null; revokeCrm?: boolean } = {},
): Promise<RetireResult> {
  await retireProfile(p.id, { by: opts.by, reason: opts.reason });

  if (opts.revokeCrm === false) return { crmOk: true, crmNote: '' };

  const key = phoneKey(p.contact);
  if (!key) {
    return { crmOk: true, crmNote: ' · no phone on file, so there was no CRM login to revoke' };
  }
  try {
    const users = await fetchUsers();
    /* EVERY account on that number, not the first one found. A revoke that
       leaves a second account live is a revoke that didn't happen, and this
       repo already knows one person can hold two records for one number (see
       CLAUDE.md on duplicate `profiles` rows). Admin > Users refuses a
       duplicate phone on edit, so this is normally exactly one row. */
    const hits = users.filter((u) => phoneKey(u.phone) === key);
    if (!hits.length) return { crmOk: true, crmNote: ' · they had no CRM login to revoke' };
    const live = hits.filter((u) => u.active !== false);
    if (!live.length) return { crmOk: true, crmNote: ' · their CRM login was already deactivated' };
    for (const u of live) await updateUser(u.id, { active: false });
    return { crmOk: true, crmNote: ' · CRM login deactivated' };
  } catch (e: any) {
    /* The profile IS retired at this point, so they are already off every
       roster — this is a partial success, and saying which half failed is the
       difference between one retry and an operator assuming nothing happened. */
    return {
      crmOk: false,
      crmNote: ' · ⚠ their CRM login could NOT be deactivated (' + (e?.message || 'backend error') + ') — they are off the field roster but can still sign into the CRM. Deactivate it under Admin > Users.',
    };
  }
}

export async function restoreFieldStaff(
  p: { id: string; contact: string | null },
): Promise<RetireResult> {
  await restoreProfile(p.id);

  const key = phoneKey(p.contact);
  if (!key) return { crmOk: true, crmNote: '' };
  try {
    const users = await fetchUsers();
    const dormant = users.filter((u) => phoneKey(u.phone) === key && u.active === false);
    if (!dormant.length) return { crmOk: true, crmNote: '' };
    for (const u of dormant) await updateUser(u.id, { active: true });
    return { crmOk: true, crmNote: ' · CRM login re-activated' };
  } catch (e: any) {
    return {
      crmOk: false,
      crmNote: ' · ⚠ back on the field roster, but their CRM login is still deactivated (' + (e?.message || 'backend error') + ') — re-activate it under Admin > Users.',
    };
  }
}

export { ExitColumnsMissing };
