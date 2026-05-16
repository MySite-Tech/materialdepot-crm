'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchReportCard,
  ReportCardData,
  ReportCardBM,
  ReportCardStore,
  BMDistributionEntry,
  ReportCardBMOption,
  fetchAvailableBMs,
} from '../lib/mockApi';

interface Props {
  branches: string[];
  allowedBranches: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtINR = (n: number) =>
  n >= 10000000
    ? `₹${(n / 10000000).toFixed(2)}Cr`
    : n >= 100000
    ? `₹${(n / 100000).toFixed(2)}L`
    : n >= 1000
    ? `₹${(n / 1000).toFixed(0)}k`
    : `₹${n}`;

function Stat({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
      <div className={`font-mono text-[15px] font-bold ${accent ?? 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
    </div>
  );
}

function Card({ title, children, accent }: { title: string; children: React.ReactNode; accent?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm space-y-3">
      <div className={`text-[11px] font-bold uppercase tracking-widest ${accent ?? 'text-gray-500'}`}>{title}</div>
      {children}
    </div>
  );
}

const VALUE_BUCKETS = ['0-25k', '25-50k', '50-100k', '100k-250k', '250k-500k', '500k+'];

function CartHealthBar({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round(count / total * 100) : 0;
  return (
    <div className="space-y-0.5">
      <div className="flex justify-between text-[11px]">
        <span className="text-gray-600">{label}</span>
        <span className="font-mono font-semibold">{count} <span className="text-gray-400 font-normal">({pct}%)</span></span>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function BmDistGroup({ label, entries, dotColor }: { label: string; entries: BMDistributionEntry[]; dotColor: string }) {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort((a, b) => b.projected_monthly - a.projected_monthly);
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="w-2 h-2 rounded-full" style={{ background: dotColor }} />
        <span className="text-[11px] font-semibold text-gray-700">{label}</span>
        <span className="text-[11px] text-gray-400">({sorted.length})</span>
      </div>
      <div className="space-y-1 pl-3.5">
        {sorted.map((e, i) => (
          <div key={`${e.bm_name}-${i}`} className="flex justify-between text-[11px]">
            <span className="text-gray-600">{e.bm_name}</span>
            <span className="font-mono text-gray-500">{fmtINR(e.mtd_revenue)} <span className="text-gray-400">→ {fmtINR(e.projected_monthly)}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Filter components ─────────────────────────────────────────────────────────

function FilterChip({
  label, options, selected, onChange, color,
}: {
  label: string; options: string[]; selected: string[];
  onChange: (v: string[]) => void; color?: { active: string };
}) {
  const [open, setOpen] = useState(false);
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  const active = selected.length > 0;
  const c = color || { active: '#3B82F6' };
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        style={active ? { background: c.active, borderColor: c.active, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${
          active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
        }`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.active }} />}
        {active ? `${label}: ${selected.join(', ')}` : label}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] min-w-[170px] max-h-[220px] overflow-y-auto py-1">
            {options.map((opt, i) => (
              <label key={i} className="flex items-center gap-2.5 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-[12px] text-gray-700">
                <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} style={{ accentColor: c.active }} />
                {opt}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BMFilterChip({
  label, onSelect, onClear, options, color,
}: {
  label: string; // display name of selected BM (empty if none)
  onSelect: (name: string, contact: string) => void;
  onClear: () => void;
  options: ReportCardBMOption[]; color?: { active: string };
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const c = color || { active: '#8B5CF6' };
  const active = label.trim().length > 0;

  const visible = search.trim()
    ? options.filter(o =>
        o.name.toLowerCase().includes(search.toLowerCase()) ||
        o.contact.includes(search)
      )
    : options;

  const select = (o: ReportCardBMOption) => { onSelect(o.name, o.contact); setOpen(false); setSearch(''); };
  const clear = () => { onClear(); setSearch(''); setOpen(false); };

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(o => !o); setSearch(''); }}
        style={active ? { background: c.active, borderColor: c.active, color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${
          active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
        }`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.active }} />}
        {active ? `BM: ${label}` : 'BM'}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-[51] min-w-[200px] flex flex-col" style={{ maxHeight: 260 }}>
            <div className="px-2 pt-2 pb-1 border-b border-gray-100 shrink-0">
              <input
                autoFocus
                type="text"
                placeholder="Search BM…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                onClick={e => e.stopPropagation()}
                className="w-full border border-gray-200 rounded px-2 py-1 text-[12px] text-gray-700 placeholder-gray-400 outline-none bg-white"
              />
            </div>
            <div className="overflow-y-auto py-1 flex-1">
              {active && (
                <button
                  onClick={clear}
                  className="w-full text-left px-3 py-1.5 text-[12px] text-red-500 hover:bg-red-50 cursor-pointer"
                >
                  Clear selection
                </button>
              )}
              {visible.length === 0 && (
                <div className="px-3 py-2 text-[12px] text-gray-400">No match</div>
              )}
              {visible.map(o => (
                <button
                  key={o.contact || o.name}
                  onClick={() => select(o)}
                  className={`w-full text-left px-3 py-1.5 text-[12px] cursor-pointer hover:bg-gray-50 ${
                    label === o.name ? 'font-semibold text-purple-700 bg-purple-50' : 'text-gray-700'
                  }`}
                >
                  {o.name}
                  {o.contact && <span className="ml-1.5 text-gray-400 font-normal">{o.contact}</span>}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function MonthChip({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const active = !!value;
  const [open, setOpen] = useState(false);
  const now = new Date();
  const [pickerYear, setPickerYear] = useState(() =>
    value ? parseInt(value.split('-')[0]) : now.getFullYear()
  );

  const selectedYear = value ? parseInt(value.split('-')[0]) : null;
  const selectedMonth = value ? parseInt(value.split('-')[1]) - 1 : null; // 0-indexed

  const displayLabel = value
    ? `${MONTH_NAMES[parseInt(value.split('-')[1]) - 1]} ${value.split('-')[0]}`
    : 'Month';

  const select = (month: number) => {
    const m = String(month + 1).padStart(2, '0');
    onChange(`${pickerYear}-${m}`);
    setOpen(false);
  };

  const isFuture = (month: number) =>
    pickerYear > now.getFullYear() ||
    (pickerYear === now.getFullYear() && month > now.getMonth());

  return (
    <div className="relative">
      <button
        onClick={() => { setOpen(o => !o); if (!open) setPickerYear(selectedYear ?? now.getFullYear()); }}
        style={active ? { background: '#F59E0B', borderColor: '#F59E0B', color: '#fff' } : {}}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer border transition-all ${
          active ? 'shadow-sm' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
        }`}
      >
        {!active && <span className="w-2 h-2 rounded-full shrink-0 bg-yellow-400" />}
        {displayLabel}
        <span className="text-[10px] opacity-60">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[50]" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 bg-white border border-gray-200 rounded-xl shadow-xl z-[51] w-[220px] p-3">
            {/* Year navigation */}
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => setPickerYear(y => y - 1)}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 cursor-pointer text-[13px]"
              >
                ‹
              </button>
              <span className="text-[13px] font-bold text-gray-800">{pickerYear}</span>
              <button
                onClick={() => setPickerYear(y => y + 1)}
                disabled={pickerYear >= now.getFullYear()}
                className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600 cursor-pointer text-[13px] disabled:opacity-30 disabled:cursor-default"
              >
                ›
              </button>
            </div>
            {/* Month grid */}
            <div className="grid grid-cols-3 gap-1.5">
              {MONTH_NAMES.map((name, i) => {
                const isSelected = pickerYear === selectedYear && i === selectedMonth;
                const disabled = isFuture(i);
                return (
                  <button
                    key={name}
                    disabled={disabled}
                    onClick={() => select(i)}
                    className={`py-1.5 rounded-lg text-[12px] font-medium cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-yellow-400 text-white font-bold'
                        : disabled
                        ? 'text-gray-300 cursor-default'
                        : 'hover:bg-yellow-50 text-gray-700'
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            {/* Clear */}
            {active && (
              <button
                onClick={() => { onChange(''); setOpen(false); }}
                className="mt-3 w-full text-[11px] text-red-500 hover:text-red-600 border border-red-200 rounded-md py-1 hover:bg-red-50 transition-colors cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── BM Panel ──────────────────────────────────────────────────────────────────

function BMPanel({ bm }: { bm: ReportCardBM }) {
  const totalActive = bm.cart_health.active_carts;
  return (
    <div className="space-y-3">
      <div className="text-[13px] font-bold text-gray-800">{bm.bm_name}</div>

      <Card title="Today's Activity" accent="text-blue-600">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Walk-ins" value={bm.today.walk_ins} />
          <Stat label="Carts Created" value={bm.today.carts_created} />
          <Stat label="Orders Closed" value={bm.today.orders_closed} accent="text-green-600" />
        </div>
      </Card>

      <Card title="Month-to-Date" accent="text-green-600">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Total Orders" value={bm.mtd.total_orders} />
          <Stat label="Revenue" value={fmtINR(bm.mtd.total_revenue)} accent="text-[#EAB308]" />
          <Stat label="Avg Order Value" value={fmtINR(bm.mtd.avg_order_value)} />
          <Stat label="Projected" value={fmtINR(bm.mtd.projected_monthly_revenue)} accent="text-blue-600" sub={`Day ${bm.mtd.days_elapsed}`} />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-1">
          <Stat label="New Walkins" value={bm.mtd.new_walkins} />
          <Stat label="Repeat Walkins" value={bm.mtd.repeat_walkins} accent="text-purple-600" />
        </div>
      </Card>

      <Card title="Cart Health" accent="text-orange-500">
        <div className="text-[11px] text-gray-500 mb-2">{totalActive} active carts</div>
        <div className="space-y-2">
          <CartHealthBar label="Fresh (0–7d)" count={bm.cart_health.fresh_0_7d} total={totalActive} color="#22C55E" />
          <CartHealthBar label="Warm (8–14d)" count={bm.cart_health.warm_8_14d} total={totalActive} color="#F59E0B" />
          <CartHealthBar label="Cold (15–30d)" count={bm.cart_health.cold_15_30d} total={totalActive} color="#F97316" />
          <CartHealthBar label="Dead (30d+)" count={bm.cart_health.dead_30d_plus} total={totalActive} color="#EF4444" />
        </div>
        <div className="mt-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Pipeline by Value</div>
          <div className="grid grid-cols-3 gap-1.5">
            {VALUE_BUCKETS.map(b => (
              <div key={b} className="bg-gray-50 rounded px-2 py-1 text-center">
                <div className="text-[10px] text-gray-400">{b}</div>
                <div className="font-mono text-[12px] font-bold">{bm.cart_health.pipeline_by_value[b] ?? 0}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card title="Last 7 Days" accent="text-gray-500">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Orders" value={bm.weekly_last_7d.orders} />
          <Stat label="Revenue" value={fmtINR(bm.weekly_last_7d.revenue)} accent="text-[#EAB308]" />
          <Stat label="Daily Avg" value={fmtINR(bm.weekly_last_7d.daily_avg)} />
        </div>
      </Card>
    </div>
  );
}

// ── Store Panel ───────────────────────────────────────────────────────────────

function StorePanel({ store }: { store: ReportCardStore }) {
  const gap = store.mtd.gap;
  return (
    <div className="space-y-3">
      <div className="text-[13px] font-bold text-gray-800">Store Overview</div>

      <Card title="Yesterday's Results" accent="text-blue-600">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Walk-ins" value={store.yesterday.walk_ins} />
          <Stat label="Carts" value={store.yesterday.carts} />
          <Stat label="Estimates" value={store.yesterday.estimates} />
        </div>
        <div className="grid grid-cols-2 gap-3 mt-1">
          <Stat label="Orders" value={store.yesterday.orders} accent="text-green-600" />
          <Stat label="Revenue" value={fmtINR(store.yesterday.revenue)} accent="text-[#EAB308]" />
        </div>
      </Card>

      <Card title="MTD Performance" accent="text-green-600">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Stat label="Days" value={`${store.mtd.days_elapsed}/${store.mtd.days_in_month}`} />
          <Stat label="Orders" value={store.mtd.total_orders} />
          <Stat label="Revenue" value={fmtINR(store.mtd.total_revenue)} accent="text-[#EAB308]" />
          <Stat label="Daily Avg" value={fmtINR(store.mtd.daily_avg)} />
          <Stat label="Projected" value={fmtINR(store.mtd.projected_end)} accent="text-blue-600" />
          <Stat label="Gap" value={fmtINR(Math.abs(gap))} accent={gap < 0 ? 'text-red-500' : 'text-green-600'} sub={gap < 0 ? 'behind' : 'ahead'} />
        </div>
      </Card>

      <Card title="BM Distribution" accent="text-purple-600">
        <div className="space-y-3">
          <BmDistGroup label="⭐ Stars (>₹25L pace)" entries={store.bm_distribution.stars_gt_25L} dotColor="#22C55E" />
          <BmDistGroup label="✅ On Track (₹15–25L)" entries={store.bm_distribution.on_track_15_25L} dotColor="#3B82F6" />
          <BmDistGroup label="⚠️ At Risk (₹10–15L)" entries={store.bm_distribution.at_risk_10_15L} dotColor="#F59E0B" />
          <BmDistGroup label="🚨 Critical (<₹10L)" entries={store.bm_distribution.critical_lt_10L} dotColor="#EF4444" />
          {Object.values(store.bm_distribution).every(a => a.length === 0) && (
            <div className="text-[12px] text-gray-400">No BM data for selected filters</div>
          )}
        </div>
      </Card>

      <Card title="Pipeline Health" accent="text-orange-500">
        {(() => {
          const ph = store.pipeline_health;
          const total = ph.pipeline.value + (ph.order_closed?.value || 0) + (ph.order_lost?.value || 0) + (ph.refunded?.value || 0);
          const pct = (v: number) => (total > 0 ? (v / total) * 100 : 0);
          return (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Pipeline</div>
                  <div className="font-mono text-lg font-bold text-[#EAB308] break-all">{fmtINR(ph.pipeline.value)}</div>
                  <div className="text-[11px] text-gray-400">{ph.pipeline.count} carts</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Order Closed</div>
                  <div className="font-mono text-lg font-bold text-green-700 break-all">{fmtINR(ph.order_closed.value)}</div>
                  <div className="text-[11px] text-gray-400">{ph.order_closed.count} carts</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Order Lost</div>
                  <div className="font-mono text-lg font-bold text-gray-500 break-all">{fmtINR(ph.order_lost.value)}</div>
                  <div className="text-[11px] text-gray-400">{ph.order_lost.count} carts</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Refunded</div>
                  <div className="font-mono text-lg font-bold text-red-500 break-all">{fmtINR(ph.refunded.value)}</div>
                  <div className="text-[11px] text-gray-400">{ph.refunded.count} carts</div>
                </div>
              </div>
              <div className="flex h-1.5 rounded-sm overflow-hidden mt-4 bg-gray-200">
                <div className="bg-[#EAB308] transition-[width] duration-300" style={{ width: pct(ph.pipeline.value) + '%' }} />
                <div className="bg-green-500 transition-[width] duration-300" style={{ width: pct(ph.order_closed.value) + '%' }} />
                <div className="bg-gray-400 transition-[width] duration-300" style={{ width: pct(ph.order_lost.value) + '%' }} />
                <div className="bg-red-400 transition-[width] duration-300" style={{ width: pct(ph.refunded.value) + '%' }} />
              </div>
            </>
          );
        })()}
      </Card>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ReportCardDashboard({ branches, allowedBranches }: Props) {
  const [branchFilter, setBranchFilter] = useState<string[]>([]);
  // bmLabel = display name; bmContact = contact sent to API (unique, matched by contact__icontains)
  const [bmLabel, setBmLabel] = useState('');
  const [bmContact, setBmContact] = useState('');
  const [monthFilter, setMonthFilter] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [data, setData] = useState<ReportCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [availableBmList, setAvailableBmList] = useState<ReportCardBMOption[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRestricted = allowedBranches.length > 0;

  const branchKey = (isRestricted
    ? (branchFilter.length > 0 ? branchFilter.filter(b => allowedBranches.includes(b)) : allowedBranches)
    : branchFilter
  ).join(',');
  useEffect(() => {
    const effective = branchKey ? branchKey.split(',') : undefined;
    fetchAvailableBMs(effective).then(setAvailableBmList).catch(() => setAvailableBmList([]));
  }, [branchKey]);
  const branchOptions = isRestricted
    ? allowedBranches.filter(b => b !== 'HQ')
    : branches.filter(b => b !== 'HQ');

  const load = useCallback((filters: { branch?: string[]; bm?: string; month?: string }) => {
    setLoading(true);
    fetchReportCard(filters)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const effectiveBranches = isRestricted
        ? (branchFilter.length > 0 ? branchFilter.filter(b => allowedBranches.includes(b)) : allowedBranches)
        : (branchFilter.length > 0 ? branchFilter : undefined);
      load({
        branch: effectiveBranches,
        bm: bmContact.trim() || undefined,
        month: monthFilter || undefined,
      });
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [branchFilter, bmContact, monthFilter, load, isRestricted, allowedBranches]);

  return (
    <div className="px-3 sm:px-6 py-4 space-y-4">

      {/* Filter bar */}
      <div className="bg-white border border-gray-200 rounded-xl px-3 sm:px-5 py-3 flex flex-wrap items-center gap-2 shadow-sm">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Filter</span>
        <FilterChip
          label="Branch" options={branchOptions} selected={branchFilter}
          onChange={v => { setBranchFilter(v); }}
          color={{ active: '#3B82F6' }}
        />
        <BMFilterChip
          label={bmLabel}
          onSelect={(name, contact) => { setBmLabel(name); setBmContact(contact); }}
          onClear={() => { setBmLabel(''); setBmContact(''); }}
          options={availableBmList}
          color={{ active: '#8B5CF6' }}
        />
        <MonthChip value={monthFilter} onChange={setMonthFilter} />
        <span className="ml-auto flex items-center gap-2 text-[11px] text-gray-400 font-mono">
          {loading && <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />}
          Report Card
        </span>
      </div>

      {/* Content */}
      {loading && !data && (
        <div className="py-16 text-center text-[13px] text-gray-400">Loading…</div>
      )}

      {!loading && !data && (
        <div className="py-16 text-center text-[13px] text-gray-400">Failed to load data. Check filters and try again.</div>
      )}

      {data && (
        <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 transition-opacity duration-150 ${loading ? 'opacity-40 pointer-events-none' : 'opacity-100'}`}>
          {/* BM card */}
          <div>
            {data.bm ? (
              <BMPanel bm={data.bm} />
            ) : (
              <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center text-[12px] text-gray-400">
                Select a BM above to see their performance card
              </div>
            )}
          </div>

          {/* Store card */}
          <div>
            <StorePanel store={data.store} />
          </div>
        </div>
      )}
    </div>
  );
}
