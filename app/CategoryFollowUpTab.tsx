'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Lead, AppUser, Remark } from '../types/crm';
import {
  fetchCategoryFollowups,
  upsertCategoryFollowup,
  appendCategoryFollowupRemark,
  logActivity,
  type CategoryFollowupOverlay,
} from '../lib/supabase';
import {
  LeadDrawer,
  DateEditPopup,
  MultiSelect,
  DateRangePicker,
  EditableStatus,
  Avatar,
  fmtINR,
  fmtDate,
  STATUSES,
} from './App';

// ── Types ─────────────────────────────────────────────────────────────────
// A cart row from the sheet, shaped as a Lead (so it reuses the exact Leads-tab
// action items) plus the extra cart facts we surface as columns.
interface CartLead extends Lead {
  visitCount: number;
  cartAgeDays: number;
  lastVisitDate: string;
  lastModified: string; // full latest_modified_at timestamp (for sort + display)
  prevOrderCount: string;
  prevOrderValue: string;
  categoryList: string[];
}

// "12 Jul 2026 · 06:46 PM" from an ISO timestamp.
const fmtDateTime = (iso: string): string => {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return iso.slice(0, 10);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' + dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const CLOSED_STATUSES = ['Order Placed', 'Order Confirmed', 'Partly Shipped', 'Shipped', 'Partly Delivered', 'Delivered', 'Refunded', 'Order Lost', 'Order Cancelled'];
// Carts above this value require a follow-up.
const FOLLOWUP_THRESHOLD = 25000;
const BYPASS_ROLES = new Set(['admin', 'superadmin', 'tech', 'manager']);
const todayStr = (): string => new Date().toISOString().slice(0, 10);

// ── CSV parsing ─────────────────────────────────────────────────────────────
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { fields.push(current.trim()); current = ''; }
      else current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

const numOr = (s: string | undefined, d = 0): number => {
  const n = parseFloat(String(s ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : d;
};

function parseCategories(raw: string): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.map((x) => String(x)).filter(Boolean);
  } catch { /* fall through */ }
  return raw.split(/[;,]/).map((s) => s.trim().replace(/^\[?"?|"?\]?$/g, '')).filter(Boolean);
}

// Parse the sheet CSV into cart rows. Column order is resolved by header name so
// an upstream reorder doesn't silently corrupt the mapping.
function parseSheet(csv: string): CartLead[] {
  let text = csv;
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];
  const header = parseCsvLine(lines[0]);
  const idx = (name: string) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const col = {
    manager: idx('manager_name'),
    branch: idx('manager_branch'),
    client: idx('Client Name'),
    cart: idx('cart_number'),
    contact: idx('Client Contact'),
    visits: idx('visit_count'),
    value: idx('cart_item_value (Rs)'),
    age: idx('cart_age_days'),
    prevCount: idx('Previous Order Count'),
    categories: idx('categories'),
    modified: idx('latest_modified_at'),
    lastVisit: idx('Last Visit Date'),
    prevValue: idx('Previous Order Value'),
  };
  const at = (f: string[], i: number) => (i >= 0 ? (f[i] ?? '') : '');

  const rows: CartLead[] = [];
  for (let r = 1; r < lines.length; r++) {
    const f = parseCsvLine(lines[r]);
    const cart = at(f, col.cart);
    if (!cart) continue;
    const categoryList = parseCategories(at(f, col.categories));
    rows.push({
      id: cart,
      clientName: at(f, col.client),
      clientPhone: at(f, col.contact),
      assignedTo: at(f, col.manager),
      branch: at(f, col.branch),
      status: 'In Cart',
      cartValue: numOr(at(f, col.value)),
      cartItems: categoryList.join(', '),
      categoryList,
      createdAt: at(f, col.modified).slice(0, 10),
      lastModified: at(f, col.modified),
      followUpDate: '',
      closureDate: '',
      lostReason: '',
      remarks: [],
      visits: [],
      visitCount: numOr(at(f, col.visits)),
      cartAgeDays: numOr(at(f, col.age)),
      lastVisitDate: at(f, col.lastVisit).slice(0, 10),
      prevOrderCount: at(f, col.prevCount),
      prevOrderValue: at(f, col.prevValue),
    });
  }
  return rows;
}

// ── Component ─────────────────────────────────────────────────────────────
interface Props {
  currentUser: AppUser | null;
  branches: string[];
  allowedBranches: string[];
  availableBMs: string[];
}

const REFRESH_MS = 120_000; // auto-refresh every 2 min (matches upstream sheet)

export default function CategoryFollowUpTab({ currentUser, allowedBranches, availableBMs }: Props) {
  const [rows, setRows] = useState<CartLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const [search, setSearch] = useState('');
  const [branchFilter, setBranchFilter] = useState<string[]>([]);
  const [managerFilter, setManagerFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [cartValueGt, setCartValueGt] = useState('');
  const [followFrom, setFollowFrom] = useState('');
  const [followTo, setFollowTo] = useState('');
  const [taskFilter, setTaskFilter] = useState('');

  const [drawerLead, setDrawerLead] = useState<CartLead | null>(null);
  const [dateEditPopup, setDateEditPopup] = useState<{ id: string; field: 'followUpDate' | 'closureDate' } | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);

  const rowsRef = useRef<CartLead[]>([]);
  rowsRef.current = rows;

  const isAdmin = BYPASS_ROLES.has(currentUser?.role ?? '');
  const allowedLower = useMemo(() => new Set(allowedBranches.map((b) => b.toLowerCase())), [allowedBranches]);

  const applyOverlay = useCallback((cart: CartLead, ov?: CategoryFollowupOverlay): CartLead => {
    if (!ov) return cart;
    return {
      ...cart,
      status: ov.status || cart.status,
      lostReason: ov.lost_reason || '',
      followUpDate: ov.follow_up_date || '',
      closureDate: ov.closure_date || '',
      remarks: ov.remarks || [],
    };
  }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [csvRes, overlays] = await Promise.all([
        fetch('/api/category-followup', { cache: 'no-store' }).then(async (r) => {
          if (!r.ok) throw new Error(`Sheet fetch failed (${r.status})`);
          return r.text();
        }),
        fetchCategoryFollowups().catch(() => ({} as Record<string, CategoryFollowupOverlay>)),
      ]);
      const carts = parseSheet(csvRes).map((c) => applyOverlay(c, overlays[c.id]));
      setRows(carts);
      setLastUpdated(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sheet');
    } finally {
      setLoading(false);
    }
  }, [applyOverlay]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => { setPage(0); }, [search, branchFilter, managerFilter, categoryFilter, statusFilter, cartValueGt, followFrom, followTo, taskFilter]);

  // ── Branch-scoped base set ──
  const scoped = useMemo(
    () => (allowedLower.size === 0 ? rows : rows.filter((r) => allowedLower.has((r.branch || '').toLowerCase()))),
    [rows, allowedLower],
  );

  const branchOptions = useMemo(() => Array.from(new Set(scoped.map((r) => r.branch).filter(Boolean))).sort(), [scoped]);
  const managerOptions = useMemo(() => {
    const set = new Set(scoped.map((r) => r.assignedTo).filter(Boolean));
    availableBMs.forEach((b) => set.add(b));
    return Array.from(set).sort();
  }, [scoped, availableBMs]);
  const categoryOptions = useMemo(() => Array.from(new Set(scoped.flatMap((r) => r.categoryList))).sort(), [scoped]);

  const isOverdue = (l: CartLead): boolean => !!(l.followUpDate && l.followUpDate < todayStr() && !CLOSED_STATUSES.includes(l.status));
  // A follow-up is "made" once any follow-up action has been logged (remark / date / status change all append a remark).
  const followMade = (l: CartLead): boolean => (l.remarks || []).length > 0;
  // Required-but-pending: high-value, still open, and not yet followed up.
  const followToBeDone = (l: CartLead): boolean => (l.cartValue || 0) > FOLLOWUP_THRESHOLD && !CLOSED_STATUSES.includes(l.status) && !followMade(l);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const minVal = cartValueGt ? Number(cartValueGt) : null;
    return scoped
      .filter((r) => {
        if (q && !(`${r.clientName} ${r.clientPhone} ${r.id} ${r.assignedTo}`.toLowerCase().includes(q))) return false;
        if (branchFilter.length && !branchFilter.includes(r.branch)) return false;
        if (managerFilter.length && !managerFilter.includes(r.assignedTo)) return false;
        if (statusFilter.length && !statusFilter.includes(r.status)) return false;
        if (categoryFilter.length && !r.categoryList.some((c) => categoryFilter.includes(c))) return false;
        if (minVal != null && (r.cartValue || 0) < minVal) return false;
        if (followFrom && (!r.followUpDate || r.followUpDate < followFrom)) return false;
        if (followTo && (!r.followUpDate || r.followUpDate > followTo)) return false;
        if (taskFilter === 'to_be_done' && !followToBeDone(r)) return false;
        if (taskFilter === 'made' && !followMade(r)) return false;
        if (taskFilter === 'overdue' && !isOverdue(r)) return false;
        return true;
      })
      // Newest carts first — descending by last-modified timestamp.
      .sort((a, b) => (b.lastModified || '').localeCompare(a.lastModified || ''));
  }, [scoped, search, branchFilter, managerFilter, statusFilter, categoryFilter, cartValueGt, followFrom, followTo, taskFilter]);

  // Top KPIs — computed over the branch-scoped set (not the ad-hoc filters) so
  // they stay a stable daily top-line.
  const kpis = useMemo(() => {
    const today = todayStr();
    let valueToday = 0, countToday = 0, madeToday = 0, requiredMade = 0, toBeDone = 0;
    for (const r of scoped) {
      if (Math.floor(r.cartAgeDays) === 0) { countToday++; valueToday += r.cartValue || 0; }
      if ((r.remarks || []).some((rm) => (rm.ts || '').slice(0, 10) === today)) madeToday++;
      // Required follow-ups = high-value, still-open carts.
      if ((r.cartValue || 0) > FOLLOWUP_THRESHOLD && !CLOSED_STATUSES.includes(r.status)) {
        if ((r.remarks || []).length > 0) requiredMade++;
        else toBeDone++;
      }
    }
    const totalReq = requiredMade + toBeDone;
    return { valueToday, countToday, madeToday, toBeDone, pct: totalReq ? Math.round((requiredMade / totalReq) * 100) : 0 };
  }, [scoped]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const paginated = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  // ── Persistence helpers ──
  const toOverlayBase = (l: CartLead): Omit<CategoryFollowupOverlay, 'remarks'> => ({
    cart_number: l.id,
    client_phone: l.clientPhone || '',
    assigned_to: l.assignedTo || '',
    branch: l.branch || '',
    status: l.status || 'In Cart',
    lost_reason: l.lostReason || '',
    follow_up_date: l.followUpDate || '',
    closure_date: l.closureDate || '',
  });

  const persist = useCallback((l: CartLead) => {
    upsertCategoryFollowup({ ...toOverlayBase(l), remarks: l.remarks || [] }).catch((e) => {
      console.error('Category follow-up save failed:', e);
      setError('Save failed — check connection and retry.');
    });
  }, []);

  const patchRow = useCallback((id: string, fn: (l: CartLead) => CartLead) => {
    setRows((prev) => prev.map((r) => (r.id === id ? fn(r) : r)));
  }, []);

  // Save from the LeadDrawer (details + status/lostReason + dates + remarks).
  const saveLead = (form: Lead) => {
    const existing = rowsRef.current.find((r) => r.id === form.id);
    if (!existing) return;
    const merged: CartLead = {
      ...existing,
      status: form.status,
      lostReason: form.status === 'Order Lost' ? (form.lostReason || '') : '',
      followUpDate: form.followUpDate || '',
      closureDate: form.closureDate || '',
      remarks: form.remarks || existing.remarks || [],
    };
    patchRow(form.id, () => merged);
    persist(merged);
    if (currentUser) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'updated_category_followup', entityType: 'category_followup', entityId: form.id, details: form.clientName || '' }).catch(console.error);
    }
    setDrawerLead(null);
  };

  const addRemark = (id: string, remark: Remark) => {
    const existing = rowsRef.current.find((r) => r.id === id);
    if (!existing) return;
    patchRow(id, (r) => ({ ...r, remarks: [...(r.remarks || []), remark] }));
    appendCategoryFollowupRemark(id, toOverlayBase(existing), remark)
      .then((latest) => patchRow(id, (r) => ({ ...r, remarks: latest })))
      .catch((e) => console.error('Remark save failed:', e));
    if (currentUser) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'added_remark', entityType: 'category_followup', entityId: id, details: remark.text.slice(0, 100) }).catch(console.error);
    }
  };

  const updateStatus = (id: string, newStatus: string, lostReason?: string) => {
    const author = currentUser?.name ?? '';
    patchRow(id, (r) => {
      const remark: Remark = { ts: new Date().toISOString(), author, text: `Status changed from ${r.status} to ${newStatus}${lostReason ? ` (${lostReason})` : ''}` };
      const updated: CartLead = { ...r, status: newStatus, lostReason: newStatus === 'Order Lost' ? (lostReason || '') : '', remarks: [...(r.remarks || []), remark] };
      persist(updated);
      return updated;
    });
    if (currentUser) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'status_changed', entityType: 'category_followup', entityId: id, details: newStatus }).catch(console.error);
    }
  };

  const handleDateEditSave = (newDate: string, remarkText: string) => {
    if (!dateEditPopup) return;
    const { id, field } = dateEditPopup;
    setDateEditPopup(null);
    const author = currentUser?.name ?? '';
    patchRow(id, (r) => {
      const updated: CartLead = { ...r, [field]: newDate } as CartLead;
      const remarks: Remark[] = [...(r.remarks || [])];
      if (field === 'followUpDate' && newDate && r.closureDate && newDate > r.closureDate) {
        updated.closureDate = newDate;
        remarks.push({ ts: new Date().toISOString(), author, text: `Closure date auto-updated to ${fmtDate(newDate)} (follow-up exceeded closure)` });
      }
      const label = field === 'followUpDate' ? 'Follow-up' : 'Closure';
      remarks.push({ ts: new Date().toISOString(), author, text: `${label} date ${r[field] ? `changed from ${fmtDate(r[field])} to ` : 'set to '}${fmtDate(newDate)}: ${remarkText}` });
      updated.remarks = remarks;
      persist(updated);
      return updated;
    });
  };

  const activeFilters = branchFilter.length + managerFilter.length + categoryFilter.length + statusFilter.length + (cartValueGt ? 1 : 0) + (followFrom || followTo ? 1 : 0) + (taskFilter ? 1 : 0);

  return (
    <div className="px-3 py-3 sm:px-6 sm:py-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Category Follow Up</h2>
          <p className="text-[11px] text-gray-400">
            Live abandoned-cart sheet · refreshes every 2 min
            {lastUpdated && <> · Updated {lastUpdated.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</>}
          </p>
        </div>
        <button
          onClick={() => { setLoading(true); load(); }}
          disabled={loading}
          className="inline-flex items-center gap-1.5 bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-md text-[13px] font-medium cursor-pointer hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {error && <div className="mb-3 text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

      {/* Top KPIs (today) */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="bg-white rounded-lg px-4 py-3 border border-gray-200">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Cart Value Created Today</div>
          <div className="font-mono text-[16px] sm:text-[20px] font-bold text-black mt-1">{fmtINR(kpis.valueToday)}</div>
        </div>
        <div className="bg-white rounded-lg px-4 py-3 border border-gray-200">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Carts Created Today</div>
          <div className="font-mono text-[16px] sm:text-[20px] font-bold text-[#EAB308] mt-1">{kpis.countToday}</div>
        </div>
        <div className="bg-white rounded-lg px-4 py-3 border border-gray-200">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Follow-ups Made Today</div>
          <div className="font-mono text-[16px] sm:text-[20px] font-bold text-green-600 mt-1">{kpis.madeToday}</div>
        </div>
        <div className="bg-white rounded-lg px-4 py-3 border border-gray-200">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Follow-ups To Be Done (&gt;₹25k)</div>
          <div className="font-mono text-[16px] sm:text-[20px] font-bold text-red-500 mt-1">{kpis.toBeDone}</div>
        </div>
        <div className="bg-white rounded-lg px-4 py-3 border border-gray-200">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">% Follow-up Made</div>
          <div className="font-mono text-[16px] sm:text-[20px] font-bold text-gray-800 mt-1">{kpis.pct}%</div>
          <div className="flex h-1.5 rounded-sm overflow-hidden mt-1.5 bg-gray-200">
            <div className="bg-green-500 transition-[width] duration-300" style={{ width: kpis.pct + '%' }} />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-2 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          <input
            className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full sm:w-[380px]"
            placeholder="Search client, phone, cart #, manager..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {activeFilters > 0 && (
            <button
              className="text-[12px] text-gray-500 underline cursor-pointer"
              onClick={() => { setBranchFilter([]); setManagerFilter([]); setCategoryFilter([]); setStatusFilter([]); setCartValueGt(''); setFollowFrom(''); setFollowTo(''); setTaskFilter(''); }}
            >
              Clear ({activeFilters})
            </button>
          )}
        </div>
        <div className="flex gap-1.5 items-center flex-wrap [&>*]:shrink-0">
          <MultiSelect options={STATUSES} selected={statusFilter} onChange={setStatusFilter} label="Status" />
          <MultiSelect options={categoryOptions} selected={categoryFilter} onChange={setCategoryFilter} label="Category" searchable />
          <DateRangePicker label="Follow-up" dateFrom={followFrom} dateTo={followTo} onChange={(from, to) => { setFollowFrom(from); setFollowTo(to); }} />
          <div className="flex items-center gap-1 border border-gray-200 rounded-md px-2 bg-white">
            <span className="text-[11px] font-semibold text-gray-400">₹&gt;</span>
            <input
              className="py-1.5 text-[12px] outline-none font-sans w-[60px] font-mono bg-transparent"
              type="text" inputMode="numeric" placeholder="0"
              value={cartValueGt ? Number(cartValueGt).toLocaleString('en-IN') : ''}
              onChange={(e) => setCartValueGt(e.target.value.replace(/[^0-9]/g, ''))}
            />
            {cartValueGt !== '' && <button className="text-gray-400 hover:text-gray-600 cursor-pointer bg-transparent border-none text-[12px] leading-none" onClick={() => setCartValueGt('')}>✕</button>}
          </div>
          <select className="px-2 py-1.5 text-[12px] border border-gray-200 rounded-md outline-none font-sans bg-white cursor-pointer" value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)}>
            <option value="">Tasks</option>
            <option value="to_be_done">Follow-up To Be Done (&gt;₹25k)</option>
            <option value="made">Follow-up Made</option>
            <option value="overdue">Overdue</option>
          </select>
        </div>
        {/* Legend */}
        <div className="flex items-center gap-4 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-red-100 border border-red-300"></span>Follow-up to be done (&gt;₹25k, not yet done)</span>
          <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm bg-green-100 border border-green-300"></span>Follow-up made</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <div className="max-h-[calc(100vh-380px)] overflow-y-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-20">
                <tr className="bg-[#FAFAFA] text-left align-top">
                  {(['Cart #', 'Client', 'Contact'] as const).map((h) => (
                    <th key={h} className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                  <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">
                    <div>Branch</div>
                    <MultiSelect className="mt-1 normal-case font-normal" options={branchOptions} selected={branchFilter} onChange={setBranchFilter} label="All" />
                  </th>
                  <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap">
                    <div>Manager</div>
                    <MultiSelect className="mt-1 normal-case font-normal" options={managerOptions} selected={managerFilter} onChange={setManagerFilter} label="All" searchable />
                  </th>
                  {(['Category', 'Cart Value', 'Age', 'Visits', 'Last Visit', 'Last Modified', 'Prev Orders', 'Follow-up', 'Status', 'Actions'] as const).map((h) => (
                    <th key={h} className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 whitespace-nowrap ${h === 'Cart Value' ? 'text-right' : h === 'Actions' ? 'text-center' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className={loading && rows.length === 0 ? 'opacity-40' : ''}>
                {loading && rows.length === 0 && (
                  <tr><td colSpan={15} className="p-10 text-center text-gray-400">Loading carts…</td></tr>
                )}
                {!loading && paginated.length === 0 && (
                  <tr><td colSpan={15} className="p-10 text-center text-gray-400">No carts found</td></tr>
                )}
                {paginated.map((l) => (
                  <tr
                    key={l.id}
                    className={`border-t border-gray-200 ${followMade(l) ? 'bg-green-50 hover:bg-green-100' : followToBeDone(l) ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-[#FFFAF7]'}`}
                  >
                    <td className="px-3 py-2.5 text-xs align-middle"><span className="font-mono text-[11px] font-semibold bg-gray-100 px-2 py-0.5 rounded whitespace-nowrap">{l.id}</span></td>
                    <td className="px-3 py-2.5 text-xs align-middle">{l.clientName || '—'}</td>
                    <td className="px-3 py-2.5 text-xs align-middle font-mono">{l.clientPhone || '—'}</td>
                    <td className="px-3 py-2.5 text-xs align-middle">{l.branch || '—'}</td>
                    <td className="px-3 py-2.5 text-xs align-middle">
                      <div className="flex items-center gap-1.5"><Avatar name={l.assignedTo} /><span>{l.assignedTo || '—'}</span></div>
                    </td>
                    <td className="px-3 py-2.5 text-xs align-middle max-w-[180px]"><span className="block truncate">{l.cartItems as string || '—'}</span></td>
                    <td className="px-3 py-2.5 text-xs align-middle text-right font-mono font-bold">{fmtINR(l.cartValue)}</td>
                    <td className="px-3 py-2.5 text-xs align-middle text-gray-500">{l.cartAgeDays}d</td>
                    <td className="px-3 py-2.5 text-xs align-middle text-gray-500">{l.visitCount}</td>
                    <td className="px-3 py-2.5 text-xs align-middle text-gray-500">{l.lastVisitDate ? fmtDate(l.lastVisitDate) : '—'}</td>
                    <td className="px-3 py-2.5 text-xs align-middle text-gray-500 whitespace-nowrap">{fmtDateTime(l.lastModified)}</td>
                    <td className="px-3 py-2.5 text-xs align-middle text-gray-500">
                      {l.prevOrderCount || '0'}{l.prevOrderValue ? ` · ${fmtINR(numOr(l.prevOrderValue))}` : ''}
                    </td>
                    <td className="px-3 py-2.5 text-xs align-middle cursor-pointer" onClick={() => setDateEditPopup({ id: l.id, field: 'followUpDate' })}>
                      {l.followUpDate
                        ? <span className={`text-xs border-b border-dashed border-gray-300 ${isOverdue(l) ? 'font-bold text-red-500' : 'text-gray-700'}`}>{isOverdue(l) && '⚠ '}{fmtDate(l.followUpDate)}</span>
                        : <span className="text-gray-400 text-[11px] border-b border-dashed border-gray-300">+ Set date</span>}
                    </td>
                    <td className="px-3 py-2.5 text-xs align-middle">
                      <EditableStatus status={l.status} lostReason={l.lostReason} createdAt={l.createdAt} isAdmin={isAdmin} onCommit={(s, reason) => updateStatus(l.id, s, reason)} />
                    </td>
                    <td className="px-3 py-2.5 text-xs align-middle text-center whitespace-nowrap">
                      <button className="bg-transparent border-none cursor-pointer py-1 px-1.5 text-[13px] text-gray-700 relative" title="Edit" onClick={() => setDrawerLead(l)}>
                        Edit
                        {(l.remarks || []).length > 0 && <span className="absolute -top-1 -right-1 bg-[#EAB308] text-white text-[9px] font-bold rounded-full w-4 h-4 inline-flex items-center justify-center">{l.remarks!.length}</span>}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col sm:flex-row items-center sm:justify-between mt-3 px-1 gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 hidden sm:inline">Rows per page:</span>
            <select className="px-2 py-1 text-xs border border-gray-200 rounded outline-none" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}>
              {[25, 50, 75, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <span className="text-xs text-gray-400">{safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, filtered.length)} of {filtered.length}</span>
          </div>
          <div className="flex items-center gap-1">
            <button className="px-2.5 py-1 text-xs border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40" disabled={safePage === 0} onClick={() => setPage(0)}>First</button>
            <button className="px-2.5 py-1 text-xs border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40" disabled={safePage === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
            <span className="text-xs text-gray-600 px-2">Page {safePage + 1} of {totalPages}</span>
            <button className="px-2.5 py-1 text-xs border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40" disabled={safePage >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
            <button className="px-2.5 py-1 text-xs border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40" disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>Last</button>
          </div>
        </div>
      )}

      {/* Drawer (same action items as Leads) */}
      {drawerLead && (
        <LeadDrawer
          lead={rows.find((r) => r.id === drawerLead.id) || drawerLead}
          currentUser={currentUser}
          branches={branchOptions}
          users={managerOptions.map((name) => ({ id: name, name }))}
          onSave={saveLead}
          onClose={() => setDrawerLead(null)}
          onAddRemark={(remark: Remark) => addRemark(drawerLead.id, remark)}
          onImmediateSave={(updated: Lead) => saveLead(updated)}
        />
      )}

      {/* Inline date edit popup */}
      {dateEditPopup && (() => {
        const l = rows.find((r) => r.id === dateEditPopup.id);
        if (!l) return null;
        return (
          <DateEditPopup
            field={dateEditPopup.field}
            currentDate={l[dateEditPopup.field]}
            followUpDate={l.followUpDate}
            closureDate={l.closureDate}
            assignedTo={l.assignedTo}
            onSave={handleDateEditSave}
            onCancel={() => setDateEditPopup(null)}
          />
        );
      })()}
    </div>
  );
}
