'use client';

import { loadSetting, saveSetting } from '../siteAuditShared';

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
