'use client';

export const OWNED_INSTALL_COLS = 'id,pi,po,bm,customer_name,phone,addr,status,delivery_date,custom_wp,subjobs,city,created_at,auditBy:service->>audit_by';

export const OWNED_WP_COLS = 'id,pi,md_id,vendor,city,customer_name,phone,bm,bm_email,order_placed_at,stages,rounds,state,imported,install_order_id,audit_order_id,created_at';

export const INSTALL_DRAWER_COLS = 'id,log,service,skus';

export const WP_DRAWER_COLS = 'id,log,notes';

export const AUDIT_SOURCE_BADGE: Record<'material_depot' | 'customer' | 'unset', { l: string; badge: string; hint: string }> = {
  material_depot: {
    l: 'MD audit', badge: 'bg-green-100 text-green-700',
    hint: 'A Material Depot site auditor measured this site, so there is a job card behind this installation.',
  },
  customer: {
    l: 'External audit', badge: 'bg-blue-100 text-blue-700',
    hint: 'The client (or somebody outside Material Depot) supplied the measurements — there is no site audit job card.',
  },
  unset: {
    l: 'Audit not set', badge: 'bg-red-100 text-red-700',
    hint: "Nobody has recorded who did the site audit. The Service Manager sets this on the order, and it decides what the installer's app shows on site.",
  },
};

export const WP_STATE_BADGE: Record<string, { l: string; badge: string }> = {
  active: { l: 'In production', badge: 'bg-sky-100 text-sky-700' },
  done: { l: 'Done', badge: 'bg-green-100 text-green-700' },
  on_hold: { l: 'On hold', badge: 'bg-amber-100 text-amber-800' },
  cancelled: { l: 'Cancelled', badge: 'bg-red-100 text-red-700' },
};
