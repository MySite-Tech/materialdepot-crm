/* Foam-roll balances and installer payouts — pure logic ported from
   material-depot-site (foam: SM_Install_Dashboard.html; payouts: Admin.html).

   Both read the same two small tables: `app_settings` (key → jsonb config)
   and `foam_ledger` (append-only foam hand-outs). Neither is derived from the
   other, but they share the "done sub-job" rules, so they live together here:

   - A sub-job counts as DONE when it is `completed` OR `partial`.
   - Its completion date is the latest matching "…installation (partially)
     completed" log entry in IST, falling back to jobcard.partialAt, then to
     the latest scheduled date (orders predating the log format keep working).
   - A job's area/rolls are split EQUALLY across its co-assigned installers
     (600 sqft across 3 installers = 200 each), never credited in full to
     each — that is deliberately different from the Analytics attribution. */

import { SQFT_PER_ROLL, loadSetting, saveSetting, sbGet } from '../siteAuditShared';
import { sjEffectiveAssignments } from './shared';
import type { FoamConfig, FoamLedgerRow, InstallOrder, Installer, PayRates, Subjob } from './types';

// app_settings access moved to siteAuditShared (the audit side needs it too);
// re-exported so the foam/payout views keep importing it from here.
export { loadSetting, saveSetting };

/* ── shared "done sub-job" date rules ─────────────────────────────────── */
export function istDate(iso?: string | null): string | null {
  try {
    return new Date(new Date(iso as string).getTime() + 19800000).toISOString().substring(0, 10);
  } catch {
    return null;
  }
}
function catLogWord(t: string): string {
  return t === 'wallpaper' ? 'Wallpaper' : t === 'wallpanel' ? 'Wall Panels' : 'Flooring';
}
export function sjCompletionDate(o: InstallOrder, sj: Subjob): string | null {
  const key = catLogWord(sj.type) + ' installation ' + (sj.status === 'partial' ? 'partially completed' : 'completed');
  let cd: string | null = null;
  for (const l of o.log || []) {
    if (l.t && l.d && l.t.startsWith(key)) {
      const d = istDate(l.d);
      if (d && (!cd || d > cd)) cd = d;
    }
  }
  if (!cd && sj.status === 'partial' && (sj.jobcard as any)?.partialAt) cd = istDate((sj.jobcard as any).partialAt);
  if (!cd) {
    const sc: string[] = [];
    if (sj.date) sc.push(sj.date);
    for (const a of sjEffectiveAssignments(sj)) {
      if (a.mode === 'custom') (a.dates || []).forEach((d) => { if (d) sc.push(d); });
      else if (a.date) sc.push(a.date);
    }
    cd = sc.length ? sc.sort().slice(-1)[0] : null;
  }
  return cd;
}
function sqftOf(sj: Subjob): number {
  return (sj.items || []).reduce((s, it) => s + (parseFloat(String(it.sqft ?? '')) || 0), 0);
}
function rollsOf(sj: Subjob): number {
  return (sj.items || []).reduce((s, it) => {
    const q = parseFloat(String(it.sqft ?? '')) || 0;
    return s + (q ? Math.ceil(q / SQFT_PER_ROLL) : 0);
  }, 0);
}

/* ── Foam ─────────────────────────────────────────────────────────────────
   Each flooring installer carries a personal foam stock (≈1 sqft of foam per
   sqft of floor). Balance = Σ issued (foam_ledger) − Σ consumed (derived from
   their done flooring sub-jobs dated on/after the tracking start). */
export const FOAM_DEFAULTS: FoamConfig = { threshold: 0, tracking_start: '' };

/* One canonical key per person — installer_id, else email:<e>, else name:<n>
   — so each ledger/consumption entry lands under exactly one key and summing
   a person's three possible keys can never double-count. */
function foamKey(idLike?: string | null, email?: string | null, name?: string | null): string | null {
  return idLike || (email ? 'email:' + String(email).toLowerCase() : name ? 'name:' + String(name).toLowerCase() : null);
}
function foamLookup(map: Record<string, number>, i: Installer): number {
  const byId = i.id && map[i.id] != null ? map[i.id] : 0;
  const byEmail = i.email && map['email:' + i.email.toLowerCase()] != null ? map['email:' + i.email.toLowerCase()] : 0;
  const byName = map['name:' + (i.name || '').toLowerCase()] != null ? map['name:' + (i.name || '').toLowerCase()] : 0;
  return byId + byEmail + byName;
}

export function foamConsumption(orders: InstallOrder[], cfg: FoamConfig): Record<string, number> {
  const start = cfg.tracking_start || '';
  const by: Record<string, number> = {};
  for (const o of orders) {
    for (const sj of o.subjobs || []) {
      if (sj.type !== 'flooring') continue;
      if (sj.status !== 'completed' && sj.status !== 'partial') continue;
      const cd = sjCompletionDate(o, sj);
      if (!cd || (start && cd < start)) continue;
      const asg = sjEffectiveAssignments(sj).filter((a) => a.installer_id || a.installer_email || a.installer_name);
      if (!asg.length) continue;
      const share = sqftOf(sj) / asg.length;
      for (const a of asg) {
        const k = foamKey(a.installer_id, a.installer_email, a.installer_name);
        if (k) by[k] = (by[k] || 0) + share;
      }
    }
  }
  return by;
}
export function foamIssued(ledger: FoamLedgerRow[]): Record<string, number> {
  const by: Record<string, number> = {};
  for (const r of ledger) {
    const k = foamKey(r.installer_id, r.installer_email, r.installer_name);
    if (!k) continue;
    by[k] = (by[k] || 0) + (parseFloat(String(r.sqft)) || 0);
  }
  return by;
}

export type FoamBalance = { inst: Installer; issued: number; consumed: number; balance: number; low: boolean };

export function foamBalances(orders: InstallOrder[], installers: Installer[], ledger: FoamLedgerRow[], cfg: FoamConfig): FoamBalance[] {
  const cons = foamConsumption(orders, cfg);
  const iss = foamIssued(ledger);
  return installers.filter((i) => i.type === 'flooring').map((i) => {
    const issued = foamLookup(iss, i), consumed = foamLookup(cons, i);
    const balance = issued - consumed;
    return { inst: i, issued, consumed, balance, low: balance < (cfg.threshold || 0) };
  }).sort((a, b) => a.balance - b.balance);
}
export function foamLowCount(orders: InstallOrder[], installers: Installer[], ledger: FoamLedgerRow[], cfg: FoamConfig): number {
  return cfg.threshold > 0 ? foamBalances(orders, installers, ledger, cfg).filter((b) => b.low).length : 0;
}
/* Ledger rows belonging to one installer, matched through the same three keys. */
export function ledgerFor(ledger: FoamLedgerRow[], inst: Installer): FoamLedgerRow[] {
  return ledger.filter((r) => {
    const k = foamKey(r.installer_id, r.installer_email, r.installer_name);
    return k === inst.id || k === 'email:' + (inst.email || '').toLowerCase() || k === 'name:' + (inst.name || '').toLowerCase();
  });
}

/* ── Payouts ──────────────────────────────────────────────────────────── */
export const PAY_DEFAULTS: Required<PayRates> = { fl_sqft: 0, wp_std_roll: 0, wp_custom_sqft: 0, wpnl_sqft: 0 };
export type PayField = keyof PayRates;

export type PayoutOverrides = Record<string, PayRates>;

/* profiles.pay_rates keyed by both email and name:<name>, so a row missing an
   email still resolves. */
export function buildPayoutOverrides(profiles: Array<{ name?: string; email?: string; pay_rates?: PayRates | null }>): PayoutOverrides {
  const out: PayoutOverrides = {};
  for (const p of profiles || []) {
    if (!p.pay_rates) continue;
    if (p.email) out[p.email.toLowerCase()] = p.pay_rates;
    if (p.name) out['name:' + p.name.toLowerCase()] = p.pay_rates;
  }
  return out;
}
function payRate(overrides: PayoutOverrides, global: PayRates, email: string, name: string, field: PayField): number {
  const ov = overrides[(email || '').toLowerCase()] || overrides['name:' + (name || '').toLowerCase()];
  const v = ov ? ov[field] : null;
  if (v != null && String(v) !== '' && !isNaN(Number(v))) return Number(v);
  return Number(global[field] || 0);
}
function isCustomWpForPay(o: InstallOrder, sj: Subjob): boolean {
  if (sj.type !== 'wallpaper') return false;
  if (sj.customWp !== undefined && sj.customWp !== null) return !!sj.customWp;
  return !!o.customWp;
}

export type PayoutRow = { o: InstallOrder; sj: Subjob; date: string; isPartial: boolean };
export type PayoutLine = { pi: string; date: string; cat: string; partial: boolean; co: number; share: number; unit: string; rate: number; amt: number };
export type PayoutAgg = {
  name: string; email: string; jobs: number;
  fl_sqft: number; fl_amt: number;
  wpstd_rolls: number; wpstd_amt: number;
  wpcust_sqft: number; wpcust_amt: number;
  wpnl_sqft: number; wpnl_amt: number;
  total: number; lines: PayoutLine[];
};

/* One row per DONE sub-job whose completion date lands inside [from,to]. */
export function payoutRows(orders: InstallOrder[], from: string, to: string): PayoutRow[] {
  const rows: PayoutRow[] = [];
  for (const o of orders) {
    for (const sj of o.subjobs || []) {
      if (sj.status !== 'completed' && sj.status !== 'partial') continue;
      const cd = sjCompletionDate(o, sj);
      if (!cd || cd < from || cd > to) continue;
      rows.push({ o, sj, date: cd, isPartial: sj.status === 'partial' });
    }
  }
  return rows;
}

export function payoutAggregate(rows: PayoutRow[], global: PayRates, overrides: PayoutOverrides): PayoutAgg[] {
  const map: Record<string, PayoutAgg & { jobSet: Set<string> }> = {};
  for (const r of rows) {
    const { sj, o } = r;
    const asg = sjEffectiveAssignments(sj);
    if (!asg.length) continue;
    const n = asg.length;
    const shareSqft = sqftOf(sj) / n, shareRolls = rollsOf(sj) / n;
    const isFl = sj.type === 'flooring', isWpl = sj.type === 'wallpanel';
    const isCustom = !isWpl && isCustomWpForPay(o, sj);
    for (const a of asg) {
      const email = a.installer_email || '';
      const name = a.installer_name || a.installer_id || email || '—';
      const k = (email || 'name:' + name).toLowerCase();
      if (!map[k]) {
        map[k] = {
          name, email, jobs: 0, jobSet: new Set<string>(),
          fl_sqft: 0, fl_amt: 0, wpstd_rolls: 0, wpstd_amt: 0, wpcust_sqft: 0, wpcust_amt: 0, wpnl_sqft: 0, wpnl_amt: 0,
          total: 0, lines: [],
        };
      }
      const M = map[k];
      M.jobSet.add(o.pi);
      const line: PayoutLine = {
        pi: o.pi, date: r.date, partial: r.isPartial, co: n, share: 0, unit: '', rate: 0, amt: 0,
        cat: isFl ? 'Flooring' : isWpl ? 'Wall Panels' : isCustom ? 'Custom WP' : 'Std WP',
      };
      let amt = 0;
      if (isFl) {
        const rate = payRate(overrides, global, email, name, 'fl_sqft');
        amt = shareSqft * rate; M.fl_sqft += shareSqft; M.fl_amt += amt;
        line.share = shareSqft; line.unit = 'sqft'; line.rate = rate;
      } else if (isWpl) {
        const rate = payRate(overrides, global, email, name, 'wpnl_sqft');
        amt = shareSqft * rate; M.wpnl_sqft += shareSqft; M.wpnl_amt += amt;
        line.share = shareSqft; line.unit = 'sqft'; line.rate = rate;
      } else if (isCustom) {
        const rate = payRate(overrides, global, email, name, 'wp_custom_sqft');
        amt = shareSqft * rate; M.wpcust_sqft += shareSqft; M.wpcust_amt += amt;
        line.share = shareSqft; line.unit = 'sqft'; line.rate = rate;
      } else {
        const rate = payRate(overrides, global, email, name, 'wp_std_roll');
        amt = shareRolls * rate; M.wpstd_rolls += shareRolls; M.wpstd_amt += amt;
        line.share = shareRolls; line.unit = 'rolls'; line.rate = rate;
      }
      line.amt = amt; M.total += amt; M.lines.push(line);
    }
  }
  return Object.values(map)
    .map(({ jobSet, ...m }) => ({ ...m, jobs: jobSet.size }))
    .sort((a, b) => b.total - a.total);
}

export const fmtSqft = (n: number) => (Math.round((n || 0) * 10) / 10).toLocaleString('en-IN');
export const fmtRs = (n: number) => '₹' + Math.round(n || 0).toLocaleString('en-IN');
