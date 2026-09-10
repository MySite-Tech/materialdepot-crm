import { CoeInstall, CoeOrder } from '../types';
export function mapCoeAudit(r: any): CoeOrder {
  return {
    id: r.id, pi: r.pi || '', po: r.po ? String(r.po).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
    skus: r.skus || [], bm: r.bm || '—', bmEmail: r.bm_email || null,
    name: r.customer_name || '', phone: r.phone || '', addr: r.addr || '',
    status: r.status || 'pending', service: r.service || null, slot: r.slot || null, date: r.date || null,
    auditorName: r.auditor_name || null, auditorEmail: r.auditor_email || null, createdAt: r.created_at || null,
    city: r.city || null, coeTrack: (r.coe_track && typeof r.coe_track === 'object') ? r.coe_track : {},
    tickedCats: [],
  };
}

export function mapCoeInstall(r: any): CoeInstall {
  return {
    id: r.id, pi: r.pi || '', po: r.po ? String(r.po).split(',').map((s: string) => s.trim()).filter(Boolean) : [],
    phone: r.phone || '', name: r.customer_name || '', addr: r.addr || '', bm: r.bm || '—',
    createdAt: r.created_at || null,
    status: r.status || '', customWp: !!r.custom_wp, deliveryDate: r.delivery_date || null,
    subjobs: Array.isArray(r.subjobs) ? r.subjobs : [],
    log: Array.isArray(r.log) ? r.log : [],
  };
}
