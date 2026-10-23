import { STATUS_LABEL, TYPE_LABEL } from '../constants';
import type { Dataset, DateRange, Dicts, FilterKey, Filters, MultiKey, Remark } from '../types';
import { rangeLabel } from './dates';

export interface MultiDef {
  k: MultiKey;
  label: string;
  dict: keyof Dicts;
  field: keyof Remark;
  lab?: (v: string) => string;
}

export const MULTI_DEFS: MultiDef[] = [
  { k: 'branch', label: 'Branch', dict: 'branch', field: 'branch' },
  { k: 'rk', label: 'First / Follow-up', dict: 'rk', field: 'rk', lab: v => (v === 'first' ? 'First remark on the lead' : 'Follow-up remark') },
  { k: 'bm', label: 'BM (remark by)', dict: 'person', field: 'author' },
  { k: 'owner', label: 'Salesperson', dict: 'person', field: 'owner' },
  { k: 'status', label: 'Status', dict: 'status', field: 'status', lab: v => STATUS_LABEL[v] || v },
  { k: 'cats', label: 'Category', dict: 'cats', field: 'cats' },
  { k: 'prio', label: 'Hot', dict: 'prio', field: 'prio', lab: v => (v ? v[0].toUpperCase() + v.slice(1) : '(not set)') },
  { k: 'type', label: 'Tasks', dict: 'type', field: 'type', lab: v => TYPE_LABEL[v] || v },
];

export const DATE_DEFS: Array<{ k: 'created' | 'followup' | 'closure'; label: string }> = [
  { k: 'created', label: 'Created' },
  { k: 'followup', label: 'Follow-up' },
  { k: 'closure', label: 'Closure' },
];

export const inRange = (d: string, rng: DateRange) =>
  (!rng[0] && !rng[1]) || (!!d && (!rng[0] || d >= rng[0]) && (!rng[1] || d <= rng[1]));

const catCache = new WeakMap<string[], Map<number, string[]>>();
export function catList(dicts: Dicts, i: number): string[] {
  let m = catCache.get(dicts.cats);
  if (!m) { m = new Map(); catCache.set(dicts.cats, m); }
  let v = m.get(i);
  if (!v) { v = (dicts.cats[i] || '').split('|').filter(Boolean); m.set(i, v); }
  return v;
}

const walkCache = new WeakMap<Dataset, Map<string, Set<string>>>();
export function walkSet(ds: Dataset, from: string, to: string): Set<string> {
  let m = walkCache.get(ds);
  if (!m) { m = new Map(); walkCache.set(ds, m); }
  const k = `${from}|${to}`;
  let s = m.get(k);
  if (!s) {
    s = new Set();
    for (const w of ds.walkins) if ((!from || w.day >= from) && (!to || w.day <= to)) s.add(w.lead);
    m.set(k, s);
  }
  return s;
}

export function makePredicate(ds: Dataset, f: Filters, skip?: FilterKey, walkRange?: DateRange) {
  const sets = Object.fromEntries(MULTI_DEFS.map(d => [d.k, new Set<number | string>(f[d.k])])) as Record<MultiKey, Set<number | string>>;
  const lostIdx = ds.dicts.status.indexOf('order_lost');
  const minVal = f.minVal === '' ? null : +f.minVal;
  return (r: Remark) => {
    if (!f.auto && r.auto) return false;
    if (f.walk) {
      const g = walkRange || (skip === 'date' ? [r.day, r.day] : f.date);
      if (!walkSet(ds, g[0], g[1]).has(r.lead)) return false;
    }
    if (!f.lost && skip !== 'status' && r.status === lostIdx && !sets.status.has(r.status)) return false;
    if (skip !== 'date' && !inRange(r.day, f.date)) return false;
    for (const d of MULTI_DEFS) {
      if (skip === d.k || !sets[d.k].size) continue;
      if (d.k === 'cats') {
        if (!catList(ds.dicts, r.cats).some(c => sets.cats.has(c))) return false;
      } else if (!sets[d.k].has(r[d.field] as number)) return false;
    }
    if (skip !== 'created' && !inRange(r.created, f.created)) return false;
    if (skip !== 'followup' && !inRange(r.followup, f.followup)) return false;
    if (skip !== 'closure' && !inRange(r.closure, f.closure)) return false;
    if (minVal !== null && !((r.value || 0) > minVal)) return false;
    return true;
  };
}

export function optionCounts(ds: Dataset, f: Filters, def: MultiDef): Map<number | string, number> {
  const pass = makePredicate(ds, f, def.k);
  const m = new Map<number | string, number>();
  for (const r of ds.remarks) {
    if (!pass(r)) continue;
    if (def.k === 'cats') for (const c of catList(ds.dicts, r.cats)) m.set(c, (m.get(c) || 0) + 1);
    else { const v = r[def.field] as number; m.set(v, (m.get(v) || 0) + 1); }
  }
  return m;
}

export const optionLabel = (ds: Dataset, def: MultiDef, v: number | string) =>
  def.k === 'cats' ? String(v) : (def.lab ? def.lab(ds.dicts[def.dict][v as number] || '') : ds.dicts[def.dict][v as number] || '(blank)');

export function filterTitle(ds: Dataset, f: Filters): string {
  const parts: string[] = [];
  if (f.date[0] || f.date[1]) parts.push(rangeLabel(f.date));
  for (const d of DATE_DEFS) if (f[d.k][0] || f[d.k][1]) parts.push(`${d.label} ${rangeLabel(f[d.k])}`);
  for (const d of MULTI_DEFS) {
    const v = f[d.k] as Array<number | string>;
    if (!v.length) continue;
    const names = v.map(x => optionLabel(ds, d, x));
    parts.push(names.length > 2 ? `${d.label} ×${names.length}` : names.join(', '));
  }
  if (f.minVal !== '') parts.push(`₹>${f.minVal}`);
  return parts.join(' · ') || 'All remarks';
}
