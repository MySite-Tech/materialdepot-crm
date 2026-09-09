'use client';

import {
  ExitColumnsMissing, crmPermissionsForSiteAuditRole, phoneKey, restoreProfile, retireProfile, sbPost,
} from '../siteAuditShared';
import { addUser, fetchUsers, updateUser } from '@/lib/mockApi';

type CreateStaffInput = {
  name: string;
  email: string;
  phone: string;

  role: string;
  installerType?: string | null;
  city: string;

  withCrmLogin?: boolean;
};

type CreateStaffResult = { profileId: string | null; crmOk: boolean; crmNote: string };

const FIELD_STAFF_CRM_ROLE = 'post_sales';

export function validateStaffInput(i: Partial<CreateStaffInput>): string {
  const nm = (i.name || '').trim();
  const em = (i.email || '').trim();
  const ph = phoneKey(i.phone);
  if (!nm) return 'Name is required.';
  if (!em || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) return 'Enter a valid email address.';

  if (!/^\d{10}$/.test(ph)) return 'Phone must be 10 digits — it is the only thing linking their field app and CRM logins.';
  if (!i.role) return 'Pick a role.';
  if (!i.city) return 'Pick a city — they will only be scheduled for this city.';
  return '';
}

export async function createFieldStaff(i: CreateStaffInput): Promise<CreateStaffResult> {
  const nm = i.name.trim();
  const em = i.email.trim().toLowerCase();
  const ph = phoneKey(i.phone);

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

type RetireResult = { crmOk: boolean; crmNote: string };

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

    const hits = users.filter((u) => phoneKey(u.phone) === key);
    if (!hits.length) return { crmOk: true, crmNote: ' · they had no CRM login to revoke' };
    const live = hits.filter((u) => u.active !== false);
    if (!live.length) return { crmOk: true, crmNote: ' · their CRM login was already deactivated' };
    for (const u of live) await updateUser(u.id, { active: false });
    return { crmOk: true, crmNote: ' · CRM login deactivated' };
  } catch (e: any) {

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
