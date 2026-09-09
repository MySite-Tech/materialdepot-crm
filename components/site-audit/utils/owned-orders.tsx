'use client';

import { OwnedInstall } from '../types/owned-orders';

export function mapOwnedInstall(r: any): OwnedInstall {
  return {
    id: r.id,
    pi: r.pi || '',
    po: r.po ? String(r.po).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
    bm: r.bm || '—',
    name: r.customer_name || '',
    phone: r.phone || '',
    addr: r.addr || '',
    status: r.status || 'pending',
    deliveryDate: r.delivery_date || null,
    customWp: !!r.custom_wp,
    city: r.city || '',
    createdAt: r.created_at || null,
    auditBy: (r.auditBy === 'material_depot' || r.auditBy === 'customer') ? r.auditBy : null,
    subjobs: Array.isArray(r.subjobs) ? r.subjobs : [],
  };
}

export function auditSourceKey(o: OwnedInstall): 'material_depot' | 'customer' | 'unset' {
  return o.auditBy === 'material_depot' ? 'material_depot' : o.auditBy === 'customer' ? 'customer' : 'unset';
}
