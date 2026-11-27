import type { NpsBand, NpsBandFilter, NpsKind } from './types';

export const NPS_PROMOTER_MIN = 9;
export const NPS_DETRACTOR_MAX = 6;
export const NPS_PAGE_SIZE = 25;
export const NPS_FETCH_PAGE = 1000;

export const NPS_QUERY: Record<NpsKind, string> = {
  audit: 'audit_orders?select=id,pi,customer_name,phone,date,auditor_name,city,coe_track&status=eq.completed',
  install: 'install_orders_slim?select=id,pi,customer_name,phone,status,subjobs,log,city&status=neq.deleted',
};

export const NPS_COPY: Record<NpsKind, { title: string; date: string; staff: string; job: string }> = {
  audit: { title: 'Audit NPS', date: 'Audit date', staff: 'Site auditor', job: 'audit' },
  install: { title: 'Installation NPS', date: 'Installation date', staff: 'Installer', job: 'installation' },
};

export const NPS_QUESTIONS: Record<NpsKind, [string, string, string]> = {
  audit: ['Overall Site Audit experience', 'Site auditor and their behaviour', 'How clean did the auditor leave the site after the audit?'],
  install: ['Overall site installation experience', 'Site installer rating', 'How clean did the installer leave the site after the installation?'],
};

export const BAND_STYLE: Record<NpsBand, { label: string; pill: string; text: string }> = {
  promoter: { label: 'Promoter', pill: 'bg-green-100 text-green-700', text: 'text-green-700' },
  neutral: { label: 'Neutral', pill: 'bg-amber-100 text-amber-700', text: 'text-amber-600' },
  detractor: { label: 'Detractor', pill: 'bg-red-100 text-red-700', text: 'text-red-700' },
};

export const BAND_FILTERS: Array<{ k: NpsBandFilter; l: string }> = [
  { k: 'all', l: 'All' },
  { k: 'promoter', l: 'Promoters' },
  { k: 'neutral', l: 'Neutral' },
  { k: 'detractor', l: 'Detractors' },
  { k: 'unscored', l: 'Not scored yet' },
];
