'use client';

/* Foam Rolls + Installer Payouts — the two money/stock views from
   material-depot-site (SM_Install_Dashboard "Foam Rolls" and Admin.html
   "Payouts"). All arithmetic lives in foamPayout.ts; these are the screens. */

import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { fmtLog, sbGet, sbPost } from '../siteAuditShared';
import {
  FOAM_DEFAULTS, PAY_DEFAULTS, buildPayoutOverrides, fmtRs, fmtSqft, foamBalances, ledgerFor,
  loadSetting, payoutAggregate, payoutRows, saveSetting,
} from './foamPayout';
import type { PayField, PayoutAgg, PayoutOverrides } from './foamPayout';
import { dstr, today } from './shared';
import type { FoamConfig, FoamLedgerRow, InstallOrder, Installer, PayRates } from './types';

/* ════════════════════════ FOAM ════════════════════════ */

export function FoamView({
  orders, installers, attribution, toast,
}: {
  orders: InstallOrder[]; installers: Installer[]; attribution: string; toast: (m: string) => void;
}) {
  const [ledger, setLedger] = useState<FoamLedgerRow[]>([]);
  const [cfg, setCfg] = useState<FoamConfig>(FOAM_DEFAULTS);
  const [cfgId, setCfgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [giveTo, setGiveTo] = useState('');
  const [giveAmt, setGiveAmt] = useState('');
  const [giveNote, setGiveNote] = useState('');
  const [busy, setBusy] = useState(false);
  const thRef = useRef<HTMLInputElement | null>(null);
  const tsRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    const [led, setting] = await Promise.all([
      sbGet('foam_ledger?select=*&order=created_at.desc'),
      loadSetting('foam'),
    ]);
    setLedger(Array.isArray(led) ? led : []);
    setCfgId(setting.id);
    setCfg({ threshold: Number(setting.value.threshold || 0), tracking_start: setting.value.tracking_start || '' });
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const flInstallers = useMemo(() => installers.filter((i) => i.type === 'flooring'), [installers]);
  const bals = useMemo(() => foamBalances(orders, installers, ledger, cfg), [orders, installers, ledger, cfg]);
  const lows = bals.filter((b) => b.low);

  async function giveFoam() {
    const inst = flInstallers.find((i) => i.id === giveTo);
    if (!inst) { toast('Pick an installer'); return; }
    const amt = parseFloat(giveAmt);
    if (!amt || amt <= 0) { toast('Enter a foam amount (sqft)'); return; }
    setBusy(true);
    try {
      await sbPost('foam_ledger', {
        installer_id: inst.id, installer_email: inst.email || '', installer_name: inst.name || '',
        sqft: amt, note: giveNote.trim() || null, created_by: attribution,
      });
      setGiveAmt(''); setGiveNote('');
      await load();
      toast('✓ Recorded ' + amt + ' sqft foam to ' + inst.name);
    } catch (e: any) {
      toast('⚠ Could not save — ' + (e?.message || 'the foam_ledger table may be missing'));
    }
    setBusy(false);
  }

  async function saveCfg() {
    const th = parseFloat(thRef.current?.value || '');
    const v: FoamConfig = { threshold: isNaN(th) ? 0 : th, tracking_start: tsRef.current?.value || '' };
    try {
      const id = await saveSetting('foam', v, cfgId);
      setCfgId(id); setCfg(v);
      toast('✓ Foam settings saved');
    } catch (e: any) {
      toast('⚠ Could not save — ' + (e?.message || 'the app_settings table may be missing'));
    }
  }

  if (loading) return <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#EAB308]" /></div>;

  return (
    <div>
      <h2 className="text-lg font-bold text-gray-900">🧻 Foam Roll Balance</h2>
      <p className="mt-1 mb-3 text-[12.5px] leading-relaxed text-gray-500">
        Foam used ≈ area installed (1 sq.ft of foam per sq.ft of floor). Consumption is counted automatically from completed
        &amp; partial flooring jobs{cfg.tracking_start ? <> since <b>{cfg.tracking_start}</b></> : null}; a shared job&apos;s foam is
        split equally between its installers. Record each hand-out below to keep the balance right.
      </p>

      {lows.length ? (
        <div className="mb-3.5 rounded-lg border border-red-300 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
          <b>⚠ {lows.length} installer{lows.length > 1 ? 's' : ''} low on foam</b> — {lows.map((b) => b.inst.name + ' (' + fmtSqft(b.balance) + ' sqft)').join(', ')}. Provide more foam.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <div className="rounded-lg border border-gray-200 bg-white p-3.5">
          <div className="mb-2 text-[13px] font-extrabold">Give foam to an installer</div>
          <div className="flex flex-wrap gap-2">
            <div className="min-w-[140px] flex-1">
              <div className="mb-0.5 text-[10.5px] text-gray-400">Installer</div>
              <select value={giveTo} onChange={(e) => setGiveTo(e.target.value)} className="w-full rounded-md border border-gray-200 px-2 py-2 text-[13px]">
                <option value="">{flInstallers.length ? '— pick installer —' : 'No flooring installers'}</option>
                {flInstallers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div className="w-[120px]">
              <div className="mb-0.5 text-[10.5px] text-gray-400">Foam (sq.ft)</div>
              <input type="number" min={1} step={1} value={giveAmt} onChange={(e) => setGiveAmt(e.target.value)} className="w-full rounded-md border border-gray-200 px-2 py-2 text-[13px]" />
            </div>
          </div>
          <input placeholder="Note (optional — e.g. 2 rolls, batch #)" value={giveNote} onChange={(e) => setGiveNote(e.target.value)} className="mt-2 w-full rounded-md border border-gray-200 px-2 py-2 text-[13px]" />
          <button disabled={busy} onClick={giveFoam} className="mt-2.5 rounded-md bg-green-700 px-4 py-2 text-[13px] font-extrabold text-white disabled:opacity-60">
            {busy ? 'Saving…' : 'Record foam given'}
          </button>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-3.5">
          <div className="mb-2 text-[13px] font-extrabold">Settings</div>
          <div className="mb-0.5 text-[10.5px] text-gray-400">Low-stock threshold (sq.ft)</div>
          <input ref={thRef} type="number" min={0} step={1} defaultValue={cfg.threshold || ''} className="mb-2 w-full rounded-md border border-gray-200 px-2 py-2 text-[13px]" />
          <div className="mb-0.5 text-[10.5px] text-gray-400">Count consumption from</div>
          <input ref={tsRef} type="date" defaultValue={cfg.tracking_start || ''} className="mb-2 w-full rounded-md border border-gray-200 px-2 py-2 text-[13px]" />
          <button onClick={saveCfg} className="rounded-md bg-[#1F3A5F] px-4 py-2 text-[13px] font-extrabold text-white">Save settings</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full">
          <thead>
            <tr>
              {['Installer', 'Issued', 'Consumed', 'Balance', ''].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bals.length ? bals.map((b) => (
              <Fragment key={b.inst.id}>
                <tr key={b.inst.id} className={`border-t border-gray-100 ${b.low ? 'bg-red-50' : ''}`}>
                  <td className="px-3 py-2.5 text-[13px] font-semibold">{b.inst.name}</td>
                  <td className="px-3 py-2.5 text-[13px] text-gray-500">{fmtSqft(b.issued)}</td>
                  <td className="px-3 py-2.5 text-[13px] text-gray-500">{fmtSqft(b.consumed)}</td>
                  <td className={`px-3 py-2.5 text-[13px] font-bold ${b.low ? 'text-red-700' : 'text-gray-900'}`}>{fmtSqft(b.balance)} sqft{b.low ? ' ⚠' : ''}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => setExpanded(expanded === b.inst.id ? null : b.inst.id)} className="rounded-md border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600">
                      {expanded === b.inst.id ? 'Hide' : 'Hand-outs'}
                    </button>
                  </td>
                </tr>
                {expanded === b.inst.id ? (
                  <tr key={b.inst.id + ':led'} className="border-t border-gray-100">
                    <td colSpan={5} className="px-3 py-2.5">
                      <table className="w-full text-[12px]">
                        <tbody>
                          {ledgerFor(ledger, b.inst).length ? ledgerFor(ledger, b.inst).map((r) => (
                            <tr key={r.id} className="text-gray-500">
                              <td className="py-0.5 pr-3">{fmtLog(r.created_at)}</td>
                              <td className="py-0.5 pr-3 text-right font-semibold text-green-700">+{fmtSqft(parseFloat(String(r.sqft)) || 0)}</td>
                              <td className="py-0.5">{r.note || ''}{r.created_by ? <span className="text-[10px]"> · {r.created_by}</span> : null}</td>
                            </tr>
                          )) : <tr><td className="py-1 text-gray-400">No foam issued yet.</td></tr>}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )) : <tr><td colSpan={5} className="border-t border-gray-100 py-8 text-center text-[13px] text-gray-400">No flooring installers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ════════════════════════ PAYOUTS ════════════════════════ */

const PAY_FIELDS: Array<{ k: PayField; label: string; unit: string }> = [
  { k: 'fl_sqft', label: 'Flooring', unit: '₹ / sq.ft' },
  { k: 'wp_std_roll', label: 'Standard wallpaper', unit: '₹ / roll' },
  { k: 'wp_custom_sqft', label: 'Customized wallpaper', unit: '₹ / sq.ft' },
  { k: 'wpnl_sqft', label: 'Wall panels', unit: '₹ / sq.ft' },
];

function csvEscape(v: string | number) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function PayoutsView({ orders, toast }: { orders: InstallOrder[]; toast: (m: string) => void }) {
  const monthStart = useMemo(() => { const t = new Date(today); return dstr(new Date(t.getFullYear(), t.getMonth(), 1)); }, []);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(dstr(today));
  const [rates, setRates] = useState<PayRates>(PAY_DEFAULTS);
  const [ratesId, setRatesId] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<PayoutOverrides>({});
  const [loading, setLoading] = useState(true);
  const [openWho, setOpenWho] = useState<string | null>(null);
  const draftRates = useRef<PayRates>(PAY_DEFAULTS);

  useEffect(() => {
    (async () => {
      const [g, profs] = await Promise.all([
        loadSetting('payout_rates'),
        /* Pay-rate lookup — deliberately NOT filtered to current staff. A
           leaver's final payout is computed off the same override, and dropping
           them would silently pay it at the global default instead. */
        sbGet('profiles?select=name,email,pay_rates&role=in.(installer,auditor_installer)').catch(() => []),
      ]);
      setRatesId(g.id);
      const merged = { ...PAY_DEFAULTS, ...(g.value || {}) };
      setRates(merged); draftRates.current = merged;
      setOverrides(buildPayoutOverrides(Array.isArray(profs) ? profs : []));
      setLoading(false);
    })();
  }, []);

  const agg = useMemo(() => payoutAggregate(payoutRows(orders, from, to), rates, overrides), [orders, from, to, rates, overrides]);
  const grand = agg.reduce((s, a) => s + a.total, 0);

  async function saveRates() {
    try {
      const id = await saveSetting('payout_rates', draftRates.current, ratesId);
      setRatesId(id); setRates({ ...draftRates.current });
      toast('✓ Payout rates saved');
    } catch (e: any) {
      toast('⚠ Could not save — ' + (e?.message || 'the app_settings table may be missing'));
    }
  }

  function downloadCsv() {
    const head = ['Installer', 'Email', 'Jobs', 'Flooring sqft', 'Flooring ₹', 'Std WP rolls', 'Std WP ₹', 'Custom WP sqft', 'Custom WP ₹', 'Wall panel sqft', 'Wall panel ₹', 'Total ₹'];
    const lines = [head.join(',')];
    agg.forEach((a: PayoutAgg) => lines.push([
      a.name, a.email, a.jobs,
      Math.round(a.fl_sqft * 10) / 10, Math.round(a.fl_amt),
      Math.round(a.wpstd_rolls * 10) / 10, Math.round(a.wpstd_amt),
      Math.round(a.wpcust_sqft * 10) / 10, Math.round(a.wpcust_amt),
      Math.round(a.wpnl_sqft * 10) / 10, Math.round(a.wpnl_amt),
      Math.round(a.total),
    ].map(csvEscape).join(',')));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `installer_payouts_${from}_to_${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="flex justify-center py-10"><div className="h-5 w-5 animate-spin rounded-full border-2 border-gray-300 border-t-[#EAB308]" /></div>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-bold text-gray-900">💰 Installer Payouts</h2>
        <button onClick={downloadCsv} className="ml-auto rounded-md bg-[#1F3A5F] px-3 py-1.5 text-xs font-extrabold text-white">⬇ Download CSV</button>
      </div>
      <p className="mt-1 mb-3 text-[12.5px] leading-relaxed text-gray-500">
        Every completed <i>and partially completed</i> sub-job whose completion date falls in the range. A job&apos;s area (or rolls)
        is split <b>equally</b> between its co-assigned installers — 600 sq.ft across 3 installers pays 200 sq.ft each.
      </p>

      <div className="mb-3 flex flex-wrap items-end gap-2">
        <div>
          <label className="mb-0.5 block text-[11px] text-gray-400">From</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1.5 text-[13px]" />
        </div>
        <div>
          <label className="mb-0.5 block text-[11px] text-gray-400">To</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-gray-200 px-2 py-1.5 text-[13px]" />
        </div>
        <div className="ml-auto text-right">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Total payable</div>
          <div className="font-mono text-[22px] font-bold text-black">{fmtRs(grand)}</div>
        </div>
      </div>

      <div className="mb-4 rounded-lg border border-gray-200 bg-white p-3.5">
        <div className="mb-2 text-[13px] font-extrabold">Global rates <span className="font-normal text-gray-400">— a per-installer override on their profile wins over these</span></div>
        <div className="grid gap-2 sm:grid-cols-4">
          {PAY_FIELDS.map((f) => (
            <div key={f.k}>
              <div className="mb-0.5 text-[10.5px] text-gray-400">{f.label} <span className="text-gray-300">({f.unit})</span></div>
              <input
                type="number" min={0} step="0.5" defaultValue={rates[f.k] ?? ''}
                onChange={(e) => { draftRates.current = { ...draftRates.current, [f.k]: e.target.value === '' ? 0 : Number(e.target.value) }; }}
                className="w-full rounded-md border border-gray-200 px-2 py-1.5 text-[13px]"
              />
            </div>
          ))}
        </div>
        <button onClick={saveRates} className="mt-2.5 rounded-md bg-[#1F3A5F] px-4 py-2 text-[13px] font-extrabold text-white">Save rates</button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full">
          <thead>
            <tr>
              {['Installer', 'Jobs', 'Flooring', 'Std WP', 'Custom WP', 'Wall panels', 'Total', ''].map((h) => (
                <th key={h} className="px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {agg.length ? agg.map((a) => (
              <Fragment key={a.email || a.name}>
                <tr key={a.email || a.name} className="border-t border-gray-100">
                  <td className="px-3 py-2.5 text-[13px]"><b>{a.name}</b><div className="text-[11px] text-gray-400">{a.email}</div></td>
                  <td className="px-3 py-2.5 text-[13px] text-gray-500">{a.jobs}</td>
                  <td className="px-3 py-2.5 text-[13px]">{a.fl_sqft ? <>{fmtSqft(a.fl_sqft)} sqft<div className="text-[11px] text-gray-400">{fmtRs(a.fl_amt)}</div></> : '—'}</td>
                  <td className="px-3 py-2.5 text-[13px]">{a.wpstd_rolls ? <>{fmtSqft(a.wpstd_rolls)} rolls<div className="text-[11px] text-gray-400">{fmtRs(a.wpstd_amt)}</div></> : '—'}</td>
                  <td className="px-3 py-2.5 text-[13px]">{a.wpcust_sqft ? <>{fmtSqft(a.wpcust_sqft)} sqft<div className="text-[11px] text-gray-400">{fmtRs(a.wpcust_amt)}</div></> : '—'}</td>
                  <td className="px-3 py-2.5 text-[13px]">{a.wpnl_sqft ? <>{fmtSqft(a.wpnl_sqft)} sqft<div className="text-[11px] text-gray-400">{fmtRs(a.wpnl_amt)}</div></> : '—'}</td>
                  <td className="px-3 py-2.5 font-mono text-[14px] font-bold">{fmtRs(a.total)}</td>
                  <td className="px-3 py-2.5 text-right">
                    <button onClick={() => setOpenWho(openWho === (a.email || a.name) ? null : (a.email || a.name))} className="rounded-md border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600">
                      {openWho === (a.email || a.name) ? 'Hide' : 'Lines'}
                    </button>
                  </td>
                </tr>
                {openWho === (a.email || a.name) ? (
                  <tr key={(a.email || a.name) + ':lines'} className="border-t border-gray-100 bg-gray-50">
                    <td colSpan={8} className="px-3 py-2.5">
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="text-gray-400">
                            {['PI', 'Date', 'Category', 'Share', 'Rate', 'Amount'].map((h) => <th key={h} className="py-1 pr-3 text-left font-semibold">{h}</th>)}
                          </tr>
                        </thead>
                        <tbody>
                          {a.lines.slice().sort((x, y) => y.date.localeCompare(x.date)).map((l, i) => (
                            <tr key={i} className="text-gray-600">
                              <td className="py-0.5 pr-3 font-mono">{l.pi}</td>
                              <td className="py-0.5 pr-3">{l.date}</td>
                              <td className="py-0.5 pr-3">{l.cat}{l.partial ? <span className="text-teal-700"> · partial</span> : null}{l.co > 1 ? <span className="text-gray-400"> · {l.co}-way split</span> : null}</td>
                              <td className="py-0.5 pr-3">{fmtSqft(l.share)} {l.unit}</td>
                              <td className="py-0.5 pr-3">{fmtRs(l.rate)}</td>
                              <td className="py-0.5 pr-3 font-semibold">{fmtRs(l.amt)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            )) : <tr><td colSpan={8} className="border-t border-gray-100 py-8 text-center text-[13px] text-gray-400">No completed installations in this range.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
