'use client';

import { AppUser, Lead } from '../../../types/crm';
import { APPOINTMENT_TRACKER_ROLES, B2B_SALES_ROLES, DEFAULT_ROLE_TABS, LOST_AGE_BYPASS_ROLES, MARK_LOST_BYPASS_SLUG, MIN_LOST_AGE_DAYS, PERMISSION_TAB_ORDER, ROLE_LABEL_OVERRIDES, ROLE_TABS, SITE_AUDIT_ONLY_ROLES, SITE_AUDIT_ROLES, STORE_DISPLAY_ADMIN_ROLES, STORE_DISPLAY_ADMIN_SLUG } from '../constants/crm';
import { MainTab } from '../types/crm';

export const roleLabel = (role?: string | null): string => {
  if (!role) return '\u2014';
  return ROLE_LABEL_OVERRIDES[role] ?? role.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

export const defaultPermissionsForRole = (role: string): string[] => {
  const tabs = new Set(defaultTabsForRole(role));

  if (!SITE_AUDIT_ONLY_ROLES.has(role)) tabs.add('storeDisplay');
  const slugs = PERMISSION_TAB_ORDER.filter(([, tab]) => tabs.has(tab)).map(([slug]) => slug);
  return STORE_DISPLAY_ADMIN_ROLES.has(role) ? [...slugs, STORE_DISPLAY_ADMIN_SLUG] : slugs;
};

const defaultTabsForRole = (role: string): Array<MainTab> => {
  let tabs: Array<MainTab> = ROLE_TABS[role] ?? DEFAULT_ROLE_TABS;
  if (B2B_SALES_ROLES.has(role) && !tabs.includes('b2bSales')) {
    tabs = [...tabs, 'b2bSales'];
  }
  if (APPOINTMENT_TRACKER_ROLES.has(role) && !tabs.includes('appointmentTracker')) {
    tabs = [...tabs, 'appointmentTracker'];
  }
  if (SITE_AUDIT_ROLES.has(role) && !tabs.includes('siteAudit')) {
    tabs = [...tabs, 'siteAudit'];
  }
  if (['superadmin', 'admin', 'tech'].includes(role) && !tabs.includes('storeDisplay')) {
    tabs = [...tabs, 'storeDisplay'];
  }
  return tabs;
};

export const resolveAllowedTabs = (user?: AppUser | null): Array<MainTab> => {
  if (SITE_AUDIT_ONLY_ROLES.has(user?.role ?? '')) return ['siteAudit'];
  const perms = user?.individualPermissions;
  if (Array.isArray(perms) && perms.length > 0) {
    const set = new Set(perms);
    return PERMISSION_TAB_ORDER.filter(([slug]) => set.has(slug)).map(([, tab]) => tab);
  }

  return defaultTabsForRole(user?.role ?? '');
};

export const canAdminStoreDisplay = (user?: AppUser | null): boolean => {
  const perms = user?.individualPermissions;
  if (Array.isArray(perms) && perms.length > 0) return perms.includes(STORE_DISPLAY_ADMIN_SLUG);
  return STORE_DISPLAY_ADMIN_ROLES.has(user?.role ?? '');
};

export const todayStr = (): string => new Date().toISOString().slice(0, 10);

const daysSinceCreated = (createdAt?: string): number => {
  if (!createdAt) return Infinity;
  const created = new Date(createdAt);
  if (isNaN(created.getTime())) return Infinity;
  return Math.floor((Date.now() - created.getTime()) / 864e5);
};

export const canMarkLostByAge = (createdAt?: string, isAdmin = false): boolean =>
  isAdmin || daysSinceCreated(createdAt) >= MIN_LOST_AGE_DAYS;

export const canBypassLostAge = (user?: AppUser | null): boolean => {
  const perms = user?.individualPermissions;
  if (Array.isArray(perms) && perms.length > 0) return perms.includes(MARK_LOST_BYPASS_SLUG);
  return LOST_AGE_BYPASS_ROLES.has(user?.role ?? '');
};

export const mergeLead = (existing: Lead, incoming: Lead): Lead => {
  const merged: Lead = { ...existing };
  const fields: (keyof Lead)[] = ['clientName', 'clientPhone', 'createdAt', 'assignedTo', 'branch', 'status', 'lostReason', 'cartItems', 'followUpDate', 'closureDate', 'clientType', 'propertyType', 'projectPhase'];
  for (const f of fields) {
    const val = incoming[f];
    if (val !== undefined && val !== null && val !== '') (merged as any)[f] = val;
  }
  if (incoming.cartValue && incoming.cartValue > 0) merged.cartValue = incoming.cartValue;
  if (incoming.architectInvolved !== undefined) merged.architectInvolved = incoming.architectInvolved;
  const existingRemarks = existing.remarks || [];
  const incomingRemarks = incoming.remarks || [];
  const allRemarks = [...existingRemarks];
  for (const r of incomingRemarks) {
    if (!allRemarks.some((er) => er.ts === r.ts && er.text === r.text)) allRemarks.push(r);
  }
  merged.remarks = allRemarks;
  const existingVisits = existing.visits || [];
  const incomingVisits = incoming.visits || [];
  const allVisits = [...existingVisits];
  for (const v of incomingVisits) {
    if (!allVisits.some((ev) => ev.date === v.date && ev.channel === v.channel)) allVisits.push(v);
  }
  merged.visits = allVisits;
  return merged;
};

export const fmtINR = (n: number | null | undefined): string => {
  if (n == null || isNaN(n)) return '₹0';
  return '₹' + Number(n).toLocaleString('en-IN');
};

export const fmtDate = (d: string | null | undefined): string => {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const fmtTimestamp = (ts: string): string => {
  const dt = new Date(ts);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' +
    dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const toExportDate = (d: string | null | undefined): string => {
  if (!d) return '';
  const m = String(d).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(d);
};

export const csvEscape = (v: unknown): string => {
  const s = v == null ? '' : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export const leadToExportRow = (lead: Lead): string[] => {
  const cartItems = Array.isArray(lead.cartItems)
    ? lead.cartItems.map((c) => c.name).filter(Boolean).join('; ')
    : (lead.cartItems || '');
  const remarks = (lead.remarks || [])
    .map((r) => `${r.text}|${toExportDate(r.ts)}|${r.author}`)
    .join(';');
  const visits = (lead.visits || [])
    .map((v) => `${toExportDate(v.date)}|${v.channel}`)
    .join(';');
  return [
    lead.leadId || lead.id || '',
    lead.clientName || '',
    lead.clientPhone || '',
    toExportDate(lead.createdAt),
    lead.assignedTo || '',
    lead.branch || '',
    lead.status || '',
    lead.lostReason || '',
    cartItems,
    lead.cartValue != null ? String(lead.cartValue) : '',
    toExportDate(lead.followUpDate),
    toExportDate(lead.closureDate),
    remarks,
    visits,
    lead.clientType || '',
    lead.propertyType || '',
    lead.architectInvolved ? 'yes' : 'no',
    lead.projectPhase || '',
  ];
};

export const triggerDownload = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
};
