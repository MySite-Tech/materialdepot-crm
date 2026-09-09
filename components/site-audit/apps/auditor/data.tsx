'use client';

import { AUDITOR_COLS } from '../../constants/auditor';
import { JobCard, Order } from '../../types/auditor';
import { normalizeAuditStatus } from '../../utils/auditor';
import { confirmServicePerformed, retryQueuedServiceConfirms } from '@/components/site-audit/data/omsService';
import { sbGet, sbPatch, sbPatchLong } from '@/components/site-audit/siteAuditShared';

export async function archiveAuditTicked(orderId: string | null | undefined, ticked: any, reason: string): Promise<void> {
  if (!orderId || !ticked?.sign) return;
  try {
    const rows = await sbGet('audit_orders?id=eq.' + orderId + '&select=audit_ticked_history');
    const hist: any[] = Array.isArray(rows) && Array.isArray(rows[0]?.audit_ticked_history)
      ? rows[0].audit_ticked_history
      : [];
    if (hist.some((h) => h?.sign?.img && h.sign.img === ticked.sign.img)) return;
    hist.push({ ...ticked, archivedAt: new Date().toISOString(), archivedReason: reason });
    await sbPatch('audit_orders', orderId, { audit_ticked_history: hist });
  } catch { /* history is best-effort — never block completion on it */ }
}

let retryingCompletion = false;

async function retryPendingCompletions() {
  if (retryingCompletion) return;
  retryingCompletion = true;
  try {
    await retryQueuedServiceConfirms();
    const pKeys = Object.keys(localStorage).filter((k) => k.startsWith('md_audit_ps_'));
    for (const k of pKeys) {
      try {
        const d = JSON.parse(localStorage.getItem(k) || 'null');
        if (d) {
          await sbPatch('audit_orders', d.id, { status: 'completed', log: d.log });
          localStorage.removeItem(k);

          try {
            await confirmServicePerformed(d.po, 'Site audit completed (offline, synced later)');
          } catch {}
        }
      } catch {}
    }
    const jcKeys = Object.keys(localStorage).filter((k) => k.startsWith('md_audit_pjc_'));
    for (const k of jcKeys) {
      try {
        const d = JSON.parse(localStorage.getItem(k) || 'null');
        if (d) {
          await sbPatchLong('audit_orders', d.id, { audit_ticked: d.ticked });
          localStorage.removeItem(k);
        }
      } catch {}
    }
  } finally {
    retryingCompletion = false;
  }
}

export async function loadJobs(email: string, prevOrders: Order[]): Promise<Order[]> {
  retryPendingCompletions();
  try {
    const rows = await sbGet(
      'audit_orders?auditor_email=eq.' +
        encodeURIComponent(email) +
        '&select=' +
        AUDITOR_COLS +

        '&status=not.in.(deleted,slot_reserved,slot_converted)&order=created_at.desc',
    );
    if (!Array.isArray(rows)) return prevOrders;
    const existing: Record<string, JobCard> = {};
    prevOrders.forEach((o) => {
      if (o.jobcard) existing[o.pi] = o.jobcard;
    });
    return rows.map((r: any) => ({
      id: r.id,
      pi: r.pi || '',
      po: r.po || null,
      name: r.customer_name || '',
      phone: r.phone || '',
      addr: r.addr || '',
      bm: r.bm || '',
      date: r.date || null,
      slot: r.slot || null,
      status: normalizeAuditStatus(r.status),
      skus: r.skus || [],
      log: r.log || [],
      jobcard: existing[r.pi] || null,
      service: r.service || null,
    }));
  } catch (e) {
    console.error('loadJobs', e);
    return prevOrders;
  }
}
