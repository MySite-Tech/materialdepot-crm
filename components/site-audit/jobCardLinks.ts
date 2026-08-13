'use client';

/* Which installation job card belongs to which site audit, as declared by a BM.

   Nothing in the data can decide this. The audit is raised pre-sale (a store
   booking, or the enquiry of the day) and the installation post-sale against
   the order's PI, so in practice the two never share a `pi` — all the rows have
   in common is a phone number, which a client running two unrelated projects
   also shares. So a BM states it, and it is stored here.

   Stored in `app_settings`, the key→jsonb table this project already uses for
   the foam/payout config and the shared slot windows, rather than a new column
   on install_orders: that would need DDL on material-depot-site's Supabase
   project, where this app holds nothing but the anon key. app_settings is
   already writable with that key, so the feature ships without a migration.

   Two keys per link, both direct lookups, so neither direction needs a jsonb
   query:
     jobcard.link.audit.<auditPi>     → { installPis: [...] }   (audit → installs)
     jobcard.link.install.<installPi> → { auditPi }             (install → audit)
   They are written together and can only disagree if a write half-fails, which
   readers survive: each side is independently meaningful. */

import { loadSetting, saveSetting } from './siteAuditShared';

const AUDIT_KEY = 'jobcard.link.audit.';
const INSTALL_KEY = 'jobcard.link.install.';

export async function loadLinkedInstallPis(auditPi: string): Promise<string[]> {
  const { value } = await loadSetting(AUDIT_KEY + auditPi);
  const list = value && Array.isArray(value.installPis) ? value.installPis : [];
  return list.map((v: any) => String(v || '').trim()).filter(Boolean);
}

export async function loadLinkedAuditPi(installPi: string): Promise<string> {
  const { value } = await loadSetting(INSTALL_KEY + installPi);
  return value && value.auditPi ? String(value.auditPi).trim() : '';
}

export async function linkInstall(auditPi: string, installPi: string, who: string): Promise<void> {
  const current = await loadLinkedInstallPis(auditPi);
  /* An installation belongs to one audit, so re-linking it moves it rather
     than leaving it claimed by two — the old owner is cleaned up first. */
  const previousAudit = await loadLinkedAuditPi(installPi);
  if (previousAudit && previousAudit !== auditPi) {
    const stale = (await loadLinkedInstallPis(previousAudit)).filter((p) => p !== installPi);
    await saveSetting(AUDIT_KEY + previousAudit, { installPis: stale }, null);
  }
  if (!current.includes(installPi)) {
    await saveSetting(AUDIT_KEY + auditPi, { installPis: [...current, installPi] }, null);
  }
  await saveSetting(INSTALL_KEY + installPi, { auditPi, by: who, at: new Date().toISOString() }, null);
}

export async function unlinkInstall(auditPi: string, installPi: string): Promise<void> {
  const remaining = (await loadLinkedInstallPis(auditPi)).filter((p) => p !== installPi);
  await saveSetting(AUDIT_KEY + auditPi, { installPis: remaining }, null);
  await saveSetting(INSTALL_KEY + installPi, {}, null);
}
