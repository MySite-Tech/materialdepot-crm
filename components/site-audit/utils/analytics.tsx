'use client';

import { NPS_BAND_LABELS } from '../siteAuditShared';

export function _anDstr(d: Date) {
  const z = (n: number) => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}

function _anToIST(iso: string) {
  return new Date(new Date(iso).getTime() + 19800000);
}

export function _anDateIST(iso: string) {
  return _anToIST(iso).toISOString().substring(0, 10);
}

export function _anMinsIST(iso: string) {
  const d = _anToIST(iso);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

export function _anHhMmIST(iso: string) {
  const m = _anMinsIST(iso);
  const z = (n: number) => (n < 10 ? '0' + n : '' + n);
  return z(Math.floor(m / 60)) + ':' + z(m % 60);
}

export function _anAuditSigned(o: any): boolean {
  return !!(o.signedName && String(o.signedName).trim());
}

export function _anInstallSigned(att: any): boolean {
  return !!(att.sign && (att.sign.name || att.sign.img));
}

export function npsSummary(rated: any[], nps: number | null): string {
  const n = rated.length;
  if (!n) return 'No ratings in this range';
  const prom = rated.filter((r) => r.q1_score >= 9).length;
  const det = rated.filter((r) => r.q1_score <= 7).length;
  return `${n} rating${n === 1 ? '' : 's'} · ${prom} ${NPS_BAND_LABELS.promoter} · ${n - prom - det} ${NPS_BAND_LABELS.neutral} · ${det} ${NPS_BAND_LABELS.detractor}${nps === null ? '' : ` · NPS ${nps >= 0 ? '+' : ''}${nps}`}`;
}
