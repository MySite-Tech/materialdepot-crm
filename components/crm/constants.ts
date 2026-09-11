'use client';

import { MainTab } from './types';
import { CHECKLIST_PERMISSION_SLUG } from '@/lib/store-checklist/constants';
import { CRM_ROLE_TO_SITE_AUDIT_ROLE, OVERSIGHT_CRM_ROLES } from '@/components/site-audit/shared';

export const DEFAULT_BRANCHES = ['JP Nagar', 'Whitefield', 'Yelankha', 'HQ'];

export const LEAD_PRIORITIES = ['hot', 'warm', 'cold'] as const;

export const STATUSES = [
  'In Cart',
  'Quote Approval Pending',
  'Availability Check',
  'Hold Stock',
  'Order Placed',
  'Order Confirmed',
  'Partly Shipped',
  'Shipped',
  'Partly Delivered',
  'Delivered',
  'Refunded',
  'Order Lost',
  'Order Cancelled',
];

export const STATUS_COLORS: Record<string, string> = {
  'In Cart':                '#6366F1',
  'Quote Approval Pending': '#F59E0B',
  'Availability Check':     '#3B82F6',
  'Hold Stock':             '#8B5CF6',
  'Order Placed':           '#F97316',
  'Order Confirmed':        '#FB923C',
  'Partly Shipped':         '#FBBF24',
  'Shipped':                '#34D399',
  'Partly Delivered':       '#6EE7B7',
  'Delivered':              '#22C55E',
  'Refunded':               '#EF4444',
  'Order Lost':             '#9CA3AF',
  'Order Cancelled':        '#6B7280',
};

export const ORDER_LOST_REASONS = [
  'Pricing Issue',
  'Credit Issue',
  'Order Closed Already',
  'Cash/Non GST Issue',
  'Delayed Estimate',
  'Sample/Material Not Approved',
  'Enquiry Invalid',
  'Enquiry Cancelled',
  'Availibility Issues',
  'Not Responding',
];

export const BACKEND_SORTABLE_COLS = new Set([
  'createdAt', 'clientName', 'clientPhone', 'assignedTo', 'branch', 'cartValue',
]);

export const VISIT_CHANNELS = ['Website', 'JP Nagar Centre', 'Whitefield Centre', 'Yelankha Centre', 'HQ Showroom', 'Phone Call'];

export const CLIENT_TYPES = ['Home Owner', 'Architect/Designer', 'Commercial Owner', 'Carpenter', 'Builder'];

export const PROPERTY_TYPES = ['Commercial', 'Independent House/Villa', 'Apartment'];

export const PROJECT_PHASES = ['Civil & Plumbing', 'Woodwork', 'Painting & Finishings'];

export const ROLE_TABS: Record<string, Array<MainTab>> = {
  superadmin:   ['leads', 'dashboard', 'footfall', 'weeklyFunnel', 'reportCard', 'storeVisit', 'storeChecklist', 'sales', 'b2bSales', 'admin', 'nps', 'siteAudit', 'storeDisplay'],
  admin:        ['leads', 'dashboard', 'footfall', 'weeklyFunnel', 'reportCard', 'storeVisit', 'storeChecklist', 'sales', 'b2bSales', 'admin', 'nps', 'siteAudit', 'storeDisplay'],
  tech:         ['leads', 'dashboard', 'footfall', 'weeklyFunnel', 'reportCard', 'storeVisit', 'storeChecklist', 'sales', 'b2bSales', 'admin','nps', 'siteAudit', 'storeDisplay'],
  manager:      ['leads', 'dashboard', 'footfall', 'storeVisit', 'storeChecklist', 'sales','reportCard', 'b2bSales', 'weeklyFunnel', 'nps', 'siteAudit'],
  store_manager:['leads', 'dashboard', 'footfall', 'storeVisit', 'storeChecklist', 'sales', 'siteAudit'],
  sales:        ['leads', 'sales', 'footfall', 'siteAudit'],
  retail:       ['dashboard', 'storeVisit', 'storeChecklist', 'footfall', 'nps'],
  b2b_sales:    ['b2bSales', 'siteAudit'],
  b2b_KAM:      ['b2bSales', 'siteAudit'],
  b2b_manager:  ['b2bSales', 'siteAudit'],
  field_worker: ['siteAudit'],
};

export const DEFAULT_ROLE_TABS: Array<MainTab> = ['leads', 'dashboard', 'footfall', 'storeVisit', 'sales'];

export const PERMISSION_TAB_ORDER: Array<[string, MainTab]> = [
  ['crm.leads', 'leads'],
  ['crm.dashboard', 'dashboard'],
  ['crm.footfall', 'footfall'],
  ['crm.weekly_funnel', 'weeklyFunnel'],
  ['crm.report_card', 'reportCard'],
  ['crm.store_visit', 'storeVisit'],
  [CHECKLIST_PERMISSION_SLUG, 'storeChecklist'],
  ['crm.sales', 'sales'],
  ['crm.b2b_sales', 'b2bSales'],
  ['crm.admin', 'admin'],
  ['crm.nps', 'nps'],
  ['crm.site_audit', 'siteAudit'],
  ['crm.appointment_tracker', 'appointmentTracker'],
  ['crm.store_display', 'storeDisplay'],
];

export const SITE_AUDIT_SUBROLES: Array<[string, string]> = [
  ['', 'None — no dashboard'],
  ['site_audit.admin', 'Admin (company-wide oversight)'],
  ['site_audit.site_auditor', 'Site Auditor'],
  ['site_audit.installer', 'Site Installer'],
  ['site_audit.service_manager', 'Service Manager'],
  ['site_audit.auditor_installer', 'Auditor + Installer'],
  ['site_audit.bm', 'Business Manager'],
  ['site_audit.branch_mgr', 'Branch Manager'],
  ['site_audit.coe', 'Category Ops Executive'],
];

export const TAB_LABELS: Record<MainTab, string> = {
  leads: 'Leads', dashboard: 'Dashboard', footfall: 'Footfall', weeklyFunnel: 'Weekly Funnel',
  reportCard: 'Report Card', storeVisit: 'Store Visit Form', sales: 'Escalation visibility',
  b2bSales: 'B2B Sales', admin: 'Admin', nps: 'NPS', siteAudit: 'Site Audit',
  storeChecklist: 'Store Checklist',
  appointmentTracker: 'Appointment Tracker',
  storeDisplay: 'Store Display',
};

export const ROLE_OPTIONS: Array<string> = [
  'sales', 'manager', 'store_manager', 'retail', 'admin', 'tech',
  'b2b_sales', 'b2b_KAM', 'b2b_manager',
  'field_worker', 'delivery', 'delivery_manager', 'post_sales', 'procurement',
  'pre_sales', 'customer_success', 'accounts', 'data',
];

export const ROLE_LABEL_OVERRIDES: Record<string, string> = {
  b2b_sales: 'B2B Sales',
  b2b_KAM: 'B2B KAM',
  b2b_manager: 'B2B Manager',
  coe: 'Category Ops Executive',
};

export const SITE_AUDIT_SUBROLE_SLUGS = new Set(SITE_AUDIT_SUBROLES.map(([slug]) => slug));

export const B2B_SALES_ROLES = new Set(['superadmin', 'admin', 'manager', 'tech', 'b2b_sales', 'b2b_KAM', 'b2b_manager']);

export const APPOINTMENT_TRACKER_ROLES = new Set([
  'superadmin', 'admin', 'tech',   // → Admin view
  'manager', 'store_manager',      // → Store Manager view
  'retail',                        // → Receptionist view
]);

export const SITE_AUDIT_ROLES = new Set([
  ...OVERSIGHT_CRM_ROLES,
  ...Object.keys(CRM_ROLE_TO_SITE_AUDIT_ROLE).filter((k) => CRM_ROLE_TO_SITE_AUDIT_ROLE[k]),
  'field_worker',
]);

export const SITE_AUDIT_ONLY_ROLES = new Set(['field_worker']);

export const STORE_DISPLAY_ADMIN_SLUG = 'crm.store_display_admin';

export const STORE_DISPLAY_ADMIN_ROLES = new Set(['superadmin', 'admin', 'tech', 'manager']);

export const MIN_LOST_AGE_DAYS = 30;

export const LOST_AGE_BYPASS_ROLES = new Set(['admin', 'manager']);

export const MARK_LOST_BYPASS_SLUG = 'crm.mark_lost_bypass_age';

export const MARK_LOST_ELIGIBLE = new Set(['In Cart', 'Quote Approval Pending', 'Availability Check', 'Request for Availability Check']);
