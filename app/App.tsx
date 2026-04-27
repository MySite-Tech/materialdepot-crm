'use client';

import { useState, useEffect, useRef, useCallback, FormEvent, KeyboardEvent, ChangeEvent, MouseEvent } from 'react';
import { useRouter } from 'next/navigation';
import { DayPicker, DateRange } from 'react-day-picker';
import 'react-day-picker/style.css';
import { fetchLead, fetchLeadRemarks, upsertLead, upsertLeads, appendRemarkToLead, deleteLead as deleteLeadDb, loginWithCode, fetchUsers, addUser, updateUser, deleteUser, updateUserBranches, fetchBranches, addBranch, updateBranch, deleteBranch, logActivity, fetchActivityLogs } from '../lib/supabase';
import { fetchCRMLeads, fetchCRMLeadsStats, updateLeadProperties, markLeadLost, CRMLeadsStats } from '../lib/mockApi';
import Dashboard from './Dashboard';
import StoreVisitWrapper from './StoreVisitWrapper';
import type { Lead, AppUser, Branch, Remark, Visit, CartItem, ActivityLog } from '../types/crm';

// ── Constants ───────────────────────────────────────────────────────────────
const DEFAULT_BRANCHES = ['JP Nagar', 'Whitefield', 'Yelankha', 'HQ'];

const STATUSES = [
  'Quote Approval Pending',
  'Request for Availability Check',
  'Site Visit',
  'Order Placed',
  'Partly Placed',
  'Delivered',
  'Refunded',
  'Order Lost',
];

const STATUS_COLORS: Record<string, string> = {
  'Quote Approval Pending': '#F59E0B',
  'Request for Availability Check': '#3B82F6',
  'Site Visit': '#A855F7',
  'Order Placed': '#F97316',
  'Partly Placed': '#FB923C',
  'Delivered': '#22C55E',
  'Refunded': '#EF4444',
  'Order Lost': '#9CA3AF',
};

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const h = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(h);
  }, [value, delayMs]);
  return debounced;
}

const ORDER_LOST_REASONS = [
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

const PIPELINE_BUCKETS: Record<string, string[]> = {
  Active: ['Quote Approval Pending', 'Request for Availability Check', 'Site Visit', ''],
  Won: ['Delivered', 'Order Placed', 'Partly Placed'],
  Lost: ['Refunded', 'Order Lost'],
};

const VISIT_CHANNELS = ['Website', 'JP Nagar Centre', 'Whitefield Centre', 'Yelankha Centre', 'HQ Showroom', 'Phone Call'];

const CLIENT_TYPES = ['Home Owner', 'Architect/Designer', 'Commercial Owner', 'Carpenter', 'Builder'];
const PROPERTY_TYPES = ['Commercial', 'Independent House/Villa', 'Apartment'];
const PROJECT_PHASES = ['Civil & Plumbing', 'Woodwork', 'Painting & Finishings'];


// ── Helpers ─────────────────────────────────────────────────────────────────
const todayStr = (): string => new Date().toISOString().slice(0, 10);

const genId = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let r = '';
  for (let i = 0; i < 6; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return `MD-${r}`;
};

const mergeLead = (existing: Lead, incoming: Lead): Lead => {
  const merged: Lead = { ...existing };
  const fields: (keyof Lead)[] = ['clientName', 'clientPhone', 'createdAt', 'assignedTo', 'branch', 'status', 'lostReason', 'cartItems', 'followUpDate', 'closureDate', 'clientType', 'propertyType', 'projectPhase'];
  for (const f of fields) {
    const val = incoming[f];
    if (val !== undefined && val !== null && val !== '') (merged as any)[f] = val;
  }
  if (incoming.cartValue && incoming.cartValue > 0) merged.cartValue = incoming.cartValue;
  if (incoming.architectInvolved !== undefined) merged.architectInvolved = incoming.architectInvolved;
  const existingRemarks = existing.remarks || [];
  const incomingRemarks = incoming.remarks || [];
  const allRemarks = [...existingRemarks];
  for (const r of incomingRemarks) {
    if (!allRemarks.some((er) => er.ts === r.ts && er.text === r.text)) allRemarks.push(r);
  }
  merged.remarks = allRemarks;
  const existingVisits = existing.visits || [];
  const incomingVisits = incoming.visits || [];
  const allVisits = [...existingVisits];
  for (const v of incomingVisits) {
    if (!allVisits.some((ev) => ev.date === v.date && ev.channel === v.channel)) allVisits.push(v);
  }
  merged.visits = allVisits;
  return merged;
};

const fmtINR = (n: number | null | undefined): string => {
  if (n == null || isNaN(n)) return '₹0';
  return '₹' + Number(n).toLocaleString('en-IN');
};

const fmtDate = (d: string | null | undefined): string => {
  if (!d) return '—';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtTimestamp = (ts: string): string => {
  const dt = new Date(ts);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' · ' +
    dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

// ── Components ──────────────────────────────────────────────────────────────

interface AvatarProps {
  name?: string;
  size?: number;
}

function Avatar({ name, size = 24 }: AvatarProps) {
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  return (
    <div className="bg-[#EAB308] text-white rounded-full inline-flex items-center justify-center font-semibold shrink-0" style={{ width: size, height: size, fontSize: size * 0.45, lineHeight: size + 'px' }}>
      {initial}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] || '#9CA3AF';
  return (
    <span className="inline-block px-2 py-0.5 rounded-xl text-[11px] font-semibold border whitespace-nowrap" style={{ background: color + '18', color, borderColor: color + '40' }}>
      {status}
    </span>
  );
}

interface EditableStatusProps {
  status: string;
  lostReason?: string;
  onCommit: (status: string, reason?: string) => void;
}

const MARK_LOST_ELIGIBLE = new Set(['Quote Approval Pending', 'Request for Availability Check']);

function EditableStatus({ status, lostReason, onCommit }: EditableStatusProps) {
  const [pickingReason, setPickingReason] = useState(false);
  const canMarkLost = MARK_LOST_ELIGIBLE.has(status);

  if (pickingReason) {
    return (
      <select
        autoFocus
        value=""
        onChange={(e) => { onCommit('Order Lost', e.target.value); setPickingReason(false); }}
        onBlur={() => setPickingReason(false)}
        className="py-1 px-2 text-xs border border-red-500 rounded-md outline-none"
      >
        <option value="" disabled>Select reason...</option>
        {ORDER_LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
    );
  }

  return (
    <span onDoubleClick={() => { if (canMarkLost) setPickingReason(true); }}>
      <StatusBadge status={status} />
      {status === 'Order Lost' && lostReason && <div className="text-[10px] text-gray-400 mt-0.5">{lostReason}</div>}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

interface ThProps {
  label: string;
  sortKey: string | null;
  sortCol: string;
  sortDir: 'asc' | 'desc';
  onSort: (col: string) => void;
  className?: string;
}

function Th({ label, sortKey, sortCol, sortDir, onSort, className: extraClass }: ThProps) {
  const active = sortCol === sortKey;
  return (
    <th
      className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none ${sortKey ? 'cursor-pointer' : 'cursor-default'} ${extraClass || ''}`}
      onClick={() => sortKey && onSort(sortKey)}
    >
      {label}
      {sortKey && (
        <span className={`ml-1 ${active ? 'opacity-100' : 'opacity-30'}`}>
          {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇕'}
        </span>
      )}
    </th>
  );
}

interface MultiSelectProps {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  label: string;
}

function MultiSelect({ options, selected, onChange, label }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (val: string) => {
    if (selected.includes(val)) {
      onChange(selected.filter((v) => v !== val));
    } else {
      onChange([...selected, val]);
    }
  };

  const display = selected.length === 0 ? label : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative inline-block">
      <button
        className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-auto min-w-[150px] cursor-pointer flex items-center gap-1.5 bg-white text-left"
        onClick={() => setOpen(!open)}
      >
        <span className="flex-1 text-[13px]">{display}</span>
        <span className="text-[10px] text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-[999] bg-white border border-gray-200 rounded-md shadow-[0_4px_12px_rgba(0,0,0,0.1)] max-h-[260px] overflow-y-auto min-w-full mt-0.5">
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 px-3 py-1.5 cursor-pointer text-xs whitespace-nowrap hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="accent-[#EAB308]"
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

interface DateRangePickerProps {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
  label?: string;
}

function DateRangePicker({ dateFrom, dateTo, onChange, label: pickerLabel }: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: globalThis.MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const hasRange = dateFrom || dateTo;
  const displayLabel = pickerLabel || 'Date Range';
  const display = !hasRange
    ? displayLabel
    : dateFrom && dateTo
      ? `${fmtDate(dateFrom)} – ${fmtDate(dateTo)}`
      : dateFrom
        ? `From ${fmtDate(dateFrom)}`
        : `Until ${fmtDate(dateTo)}`;

  const toDateObj = (s: string): Date | undefined => {
    if (!s) return undefined;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const toStr = (d: Date | undefined): string => {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const selected: DateRange | undefined = (dateFrom || dateTo) ? { from: toDateObj(dateFrom), to: toDateObj(dateTo) } : undefined;

  const handleSelect = (range: DateRange | undefined) => {
    if (!range) { onChange('', ''); return; }
    onChange(toStr(range.from), toStr(range.to));
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-auto min-w-[150px] cursor-pointer flex items-center gap-1.5 bg-white text-left"
        onClick={() => setOpen(!open)}
      >
        <span className={`flex-1 text-xs ${hasRange ? 'text-gray-700' : 'text-gray-400'}`}>{display}</span>
        <span className="text-[10px] text-gray-400">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-[100] bg-white border border-gray-200 rounded-md shadow-[0_4px_12px_rgba(0,0,0,0.1)] mt-0.5 p-3">
          <DayPicker
            className="rdp-compact"
            mode="range"
            selected={selected}
            onSelect={handleSelect}
            numberOfMonths={2}
          />
          {hasRange && (
            <div className="mt-2">
              <button
                className="bg-white text-gray-700 border border-gray-200 w-full py-1.5 px-2.5 rounded-md text-[11px] font-medium cursor-pointer"
                onClick={() => { onChange('', ''); setOpen(false); }}
              >Clear Dates</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Follow-up Remark Prompt ─────────────────────────────────────────────────
interface FollowUpRemarkPromptProps {
  oldDate: string;
  newDate: string;
  onConfirm: (text: string) => void;
  onCancel: () => void;
}

function FollowUpRemarkPrompt({ oldDate, newDate, onConfirm, onCancel }: FollowUpRemarkPromptProps) {
  const [text, setText] = useState('');
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[1000]">
      <div className="bg-white rounded-lg overflow-hidden w-[90%] shadow-[0_20px_60px_rgba(0,0,0,0.15)] max-w-[400px]">
        <div className="bg-[#1A1A1A] text-white px-5 py-3 flex justify-between items-center">
          <span className="font-semibold text-sm">Follow-up Date Changed</span>
        </div>
        <div className="p-5">
          <p className="mb-3 text-[13px]">
            <span className="text-gray-400">{fmtDate(oldDate)}</span>
            {' → '}
            <span className="font-semibold">{fmtDate(newDate)}</span>
          </p>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">REASON FOR CHANGE *</label>
          <textarea
            className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full min-h-[80px] mt-1 resize-y"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter reason for changing follow-up date..."
            autoFocus
          />
          <div className="flex gap-2 mt-4 justify-end">
            <button className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-md text-[13px] font-medium cursor-pointer" onClick={onCancel}>Cancel</button>
            <button className={`bg-[#EAB308] text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer ${text.trim() ? 'opacity-100' : 'opacity-50'}`} disabled={!text.trim()} onClick={() => onConfirm(text.trim())}>Confirm</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Lead Drawer ─────────────────────────────────────────────────────────────
type DrawerUser = { id: string | number; name: string };

interface LeadDrawerProps {
  lead: Lead | null;
  currentUser: AppUser | null;
  branches: string[];
  users?: DrawerUser[];
  onSave: (lead: Lead) => void;
  onClose: () => void;
  onAddRemark?: (remark: Remark) => void;
  onImmediateSave?: (lead: Lead) => void;
}

function LeadDrawer({ lead, currentUser, branches, users = [], onSave, onClose, onAddRemark, onImmediateSave }: LeadDrawerProps) {
  const isEdit = !!lead;
  const currentUserName = currentUser ? currentUser.name : '';
  const [form, setForm] = useState<Lead>(() => lead ? {
    ...lead,
    branch: lead.branch || (branches[0] || ''),
    lostReason: lead.lostReason || '',
    cartItems: Array.isArray(lead.cartItems) ? lead.cartItems : (lead.cartItems || ''),
    visits: lead.visits ? lead.visits.map(v => ({ ...v, cartSnapshot: Array.isArray(v.cartSnapshot) ? v.cartSnapshot.map(c => ({ ...c })) : v.cartSnapshot })) : [],
    clientType: lead.clientType || '',
    propertyType: lead.propertyType || '',
    architectInvolved: lead.architectInvolved || false,
    projectPhase: lead.projectPhase || '',
  } : {
    id: '', createdAt: todayStr(), assignedTo: currentUserName, branch: (branches[0] || ''), status: STATUSES[0],
    cartValue: 0, cartItems: '', followUpDate: '', closureDate: '', lostReason: '', remarks: [],
    clientName: '', clientPhone: '', visits: [],
    clientType: '', propertyType: '', architectInvolved: false, projectPhase: '',
  });
  const origFollowUpDate = useRef(lead ? lead.followUpDate : '');
  const [remarkAuthor, setRemarkAuthor] = useState(currentUserName);
  const [closureDateWarning, setClosureDateWarning] = useState('');
  const [drawerDatePopup, setDrawerDatePopup] = useState<'followUpDate' | 'closureDate' | null>(null);
  const [remarkText, setRemarkText] = useState('');
  const [visitChannel, setVisitChannel] = useState(VISIT_CHANNELS[0]);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (lead) {
      setForm((f) => ({ ...f, remarks: lead.remarks || [], visits: lead.visits || [] }));
    }
  }, [lead?.remarks, lead?.visits]);

  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
  }, [form.remarks]);

  const set = <K extends keyof Lead>(k: K, v: Lead[K]) => setForm((f) => ({ ...f, [k]: v }));

  const handleDrawerDateSave = (newDate: string, remarkTxt: string) => {
    const field = drawerDatePopup;
    if (!field) return;
    setDrawerDatePopup(null);

    setForm((f) => {
      const updated: Lead = { ...f, [field]: newDate };
      const remarks: Remark[] = [...(f.remarks || [])];

      if (field === 'followUpDate' && newDate && f.closureDate && newDate > f.closureDate) {
        updated.closureDate = newDate;
        remarks.push({ ts: new Date().toISOString(), author: currentUserName, text: 'Closure date auto-updated to ' + fmtDate(newDate) + ' (follow-up date exceeded closure date)' });
      }

      if (remarkTxt) {
        const label = field === 'followUpDate' ? 'Follow-up' : 'Closure';
        const oldDate = f[field];
        const text = label + ' date ' + (oldDate ? 'changed from ' + fmtDate(oldDate) + ' to ' : 'set to ') + fmtDate(newDate) + ': ' + remarkTxt;
        remarks.push({ ts: new Date().toISOString(), author: currentUserName, text });
      }

      updated.remarks = remarks;
      if (field === 'followUpDate') origFollowUpDate.current = newDate;

      if (isEdit && onImmediateSave) {
        onImmediateSave(updated);
      }

      return updated;
    });
  };

  const handleSave = () => {
    if (!form.id.trim()) {
      alert('Lead ID is required.');
      return;
    }
    if (form.clientPhone && !/^\d{10}$/.test(form.clientPhone)) {
      alert('Phone number must be exactly 10 digits.');
      return;
    }
    if (form.status === 'Order Lost' && !form.lostReason) {
      alert('Please select a reason for marking this lead as Order Lost.');
      return;
    }
    if (form.followUpDate && form.closureDate && form.closureDate < form.followUpDate) {
      setClosureDateWarning('Closure date cannot be earlier than follow-up date (' + fmtDate(form.followUpDate) + ')');
      setTimeout(() => setClosureDateWarning(''), 4000);
      return;
    }
    onSave(form);
  };

  const submitRemark = () => {
    if (!remarkText.trim()) return;
    const remark: Remark = { ts: new Date().toISOString(), author: remarkAuthor, text: remarkText.trim() };
    setForm((f) => ({ ...f, remarks: [...(f.remarks || []), remark] }));
    if (isEdit && onAddRemark) onAddRemark(remark);
    setRemarkText('');
  };

  const handleRemarkKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.ctrlKey && e.key === 'Enter') submitRemark();
  };

  const logVisit = () => {
    const visit: Visit = {
      date: todayStr(),
      channel: visitChannel,
      loggedBy: currentUserName,
      cartSnapshot: typeof form.cartItems === 'string' ? form.cartItems : (Array.isArray(form.cartItems) ? form.cartItems.map(i => typeof i === 'string' ? i : i.name).join(', ') : ''),
    };
    setForm((f) => ({ ...f, visits: [...(f.visits || []), visit] }));
  };

  const remarks = form.remarks || [];
  const visits = form.visits || [];

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[900]" onClick={onClose} />
      <div className="fixed top-0 right-0 w-full sm:w-[480px] h-screen bg-white z-[901] flex flex-col shadow-[-4px_0_20px_rgba(0,0,0,0.1)] animate-[slideInRight_0.25s_ease-out]">
        <div className="bg-[#1A1A1A] px-4 py-3 flex justify-between items-center">
          <div>
            <span className="font-semibold text-sm text-white">{isEdit ? 'Edit Lead' : 'Add New Lead'}</span>
            {isEdit && <span className="font-mono text-[11px] text-gray-400 ml-2">{form.id}</span>}
          </div>
          <button className="bg-transparent border-none text-gray-400 text-xl cursor-pointer leading-none" onClick={onClose}>&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3 pb-2 border-b border-gray-100">Details</div>
            <div className="grid grid-cols-2 gap-x-3">
              <Field label="LEAD ID">
                <input className={`px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full font-mono ${isEdit ? 'bg-gray-100' : 'bg-white'}`} value={form.id} readOnly={isEdit} placeholder="Enter Lead ID" onChange={isEdit ? undefined : (e) => set('id', e.target.value)} />
              </Field>
              <Field label="CREATION DATE">
                <input className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" type="date" value={form.createdAt} onKeyDown={(e) => e.preventDefault()} onChange={(e) => set('createdAt', e.target.value)} />
              </Field>
              <Field label="CLIENT NAME">
                <input className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={form.clientName || ''} placeholder="Client name" onChange={(e) => set('clientName', e.target.value)} />
              </Field>
              <Field label="CLIENT PHONE">
                <input className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full font-mono" value={form.clientPhone || ''} placeholder="10-digit phone" maxLength={10} inputMode="numeric" onChange={(e) => set('clientPhone', e.target.value.replace(/[^0-9]/g, ''))} />
              </Field>
              <Field label="ASSIGNED TO">
                <select className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={form.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
                  {form.assignedTo && !users.some((u) => u.name === form.assignedTo) && (
                    <option value={form.assignedTo}>{form.assignedTo}</option>
                  )}
                  {users.map((u) => <option key={u.id} value={u.name}>{u.name}</option>)}
                </select>
              </Field>
              <Field label="BRANCH">
                <select className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={form.branch} onChange={(e) => set('branch', e.target.value)}>
                  {branches.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="CLIENT TYPE">
                <select className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={form.clientType || ''} onChange={(e) => set('clientType', e.target.value)}>
                  <option value="">Select...</option>
                  {CLIENT_TYPES.map((ct) => <option key={ct} value={ct}>{ct}</option>)}
                </select>
              </Field>
              <Field label="PROPERTY TYPE">
                <select className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={form.propertyType || ''} onChange={(e) => set('propertyType', e.target.value)}>
                  <option value="">Select...</option>
                  {PROPERTY_TYPES.map((pt) => <option key={pt} value={pt}>{pt}</option>)}
                </select>
              </Field>
              <Field label="ARCHITECT/DESIGNER INVOLVED">
                <label className="flex items-center gap-2 px-2.5 py-2 text-[13px] cursor-pointer">
                  <input type="checkbox" checked={!!form.architectInvolved} onChange={(e) => set('architectInvolved', e.target.checked)} className="accent-[#EAB308]" />
                  <span className="text-[13px]">{form.architectInvolved ? 'Yes' : 'No'}</span>
                </label>
              </Field>
              <Field label="PROJECT PHASE">
                <select className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={form.projectPhase || ''} onChange={(e) => set('projectPhase', e.target.value)}>
                  <option value="">Select...</option>
                  {PROJECT_PHASES.map((ph) => <option key={ph} value={ph}>{ph}</option>)}
                </select>
              </Field>
              <Field label="STATUS">
                {MARK_LOST_ELIGIBLE.has(form.status) ? (
                  <select className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={form.status} onChange={(e) => { set('status', e.target.value); if (e.target.value !== 'Order Lost') set('lostReason', ''); }}>
                    <option value={form.status}>{form.status}</option>
                    <option value="Order Lost">Order Lost</option>
                  </select>
                ) : (
                  <div className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md bg-gray-50 text-gray-500 w-full">{form.status}</div>
                )}
              </Field>
              {form.status === 'Order Lost' && (
                <Field label="LOST REASON">
                  <select className={`px-2.5 py-2 text-[13px] border rounded-md outline-none font-sans w-full ${!form.lostReason ? 'border-red-500' : 'border-gray-200'}`} value={form.lostReason || ''} onChange={(e) => set('lostReason', e.target.value)}>
                    <option value="" disabled>Select reason...</option>
                    {ORDER_LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </Field>
              )}
              <Field label="FOLLOW-UP DATE">
                <div
                  className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full cursor-pointer flex items-center justify-between bg-white"
                  onClick={() => setDrawerDatePopup('followUpDate')}
                >
                  <span className={`text-[13px] ${form.followUpDate ? 'text-gray-700' : 'text-gray-400'}`}>{form.followUpDate ? fmtDate(form.followUpDate) : 'Click to set date'}</span>
                  {form.followUpDate && <span className="text-[11px] text-gray-400 cursor-pointer" onClick={(e) => { e.stopPropagation(); set('followUpDate', ''); }}>{'✕'}</span>}
                </div>
              </Field>
              <Field label="CLOSURE EXPECTED">
                <div
                  className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full cursor-pointer flex items-center justify-between bg-white"
                  onClick={() => setDrawerDatePopup('closureDate')}
                >
                  <span className={`text-[13px] ${form.closureDate ? 'text-gray-700' : 'text-gray-400'}`}>{form.closureDate ? fmtDate(form.closureDate) : 'Click to set date'}</span>
                  {form.closureDate && <span className="text-[11px] text-gray-400 cursor-pointer" onClick={(e) => { e.stopPropagation(); set('closureDate', ''); }}>{'✕'}</span>}
                </div>
              </Field>
              <Field label="CART VALUE">
                <input
                  className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full font-mono"
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={form.cartValue ? Number(form.cartValue).toLocaleString('en-IN') : ''}
                  onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); set('cartValue', v ? Number(v) : 0); }}
                />
              </Field>
            </div>
            <div className="mt-2">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">CART ITEMS</label>
              <input
                className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full"
                placeholder="e.g. Tiles, Laminates, Wall Panels, Plywood"
                value={Array.isArray(form.cartItems) ? (typeof form.cartItems[0] === 'string' ? (form.cartItems as unknown as string[]).join(', ') : (form.cartItems as CartItem[]).map(i => i.name).join(', ')) : (form.cartItems || '')}
                onChange={(e) => set('cartItems', e.target.value)}
              />
              <p className="text-[10px] text-gray-400 mt-1">Comma-separated list of items</p>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-md text-[13px] font-medium cursor-pointer" onClick={onClose}>Cancel</button>
              <button className="bg-[#EAB308] text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer flex-1" onClick={handleSave}>{isEdit ? 'Save Changes' : 'Add Lead'}</button>
            </div>
            {closureDateWarning && <div className="text-xs text-red-500 mt-2">{closureDateWarning}</div>}
          </div>

          {isEdit && (
            <div className="border-t-2 border-gray-200">
              <div className="pt-4 px-5">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3 pb-2 border-b border-gray-100">Remarks {remarks.length > 0 && <span className="text-gray-400 font-normal">({remarks.length})</span>}</div>
              </div>
              <div ref={timelineRef} className="px-5 py-3">
                {remarks.length === 0 && <p className="text-gray-400 text-[13px] text-center py-5">No remarks yet</p>}
                {remarks.map((r, i) => (
                  <div key={i} className="flex gap-2.5 mb-4 relative">
                    {i < remarks.length - 1 && <div className="absolute left-[13px] top-8 -bottom-4 w-px bg-gray-200" />}
                    <Avatar name={r.author} size={28} />
                    <div className="flex-1">
                      <div className="text-xs mb-1">
                        <span className="font-semibold">{r.author}</span>
                        <span className="text-gray-400 ml-2">{fmtTimestamp(r.ts)}</span>
                      </div>
                      <div className="bg-[#FAFAFA] px-3 py-2 rounded-lg text-[13px] leading-relaxed border border-gray-200">{r.text}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-5 pb-5">
                <input className="px-2.5 py-2 text-xs border border-gray-200 rounded-md outline-none font-sans w-full mb-2" value={remarkAuthor} placeholder="Author name" onChange={(e) => setRemarkAuthor(e.target.value)} />
                <textarea
                  className="px-2.5 py-2 text-xs border border-gray-200 rounded-md outline-none font-sans w-full min-h-[60px] resize-y"
                  value={remarkText}
                  onChange={(e) => setRemarkText(e.target.value)}
                  onKeyDown={handleRemarkKeyDown}
                  placeholder="Add a remark... (Ctrl+Enter to submit)"
                />
                <button className="bg-[#EAB308] text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer w-full mt-2" disabled={!remarkText.trim()} onClick={submitRemark}>Add Remark</button>
              </div>
            </div>
          )}

          {isEdit && (
            <div className="border-t-2 border-gray-200">
              <div className="pt-4 px-5">
                <div className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3 pb-2 border-b border-gray-100">Visit History {visits.length > 0 && <span className="text-gray-400 font-normal">({visits.length})</span>}</div>
              </div>
              <div className="px-5 pb-3">
                {visits.length === 0 && <p className="text-gray-400 text-[13px] text-center py-5">No visits recorded</p>}
                {visits.map((v, i) => (
                  <div key={i} className="mb-3 border border-gray-200 rounded-md p-2.5 bg-[#FAFAFA]">
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-semibold">{fmtDate(v.date)}</span>
                      <span className="text-[11px] bg-[#EAB30818] text-amber-700 px-2 py-0.5 rounded-[10px] font-medium">{v.channel}</span>
                    </div>
                    {v.cartSnapshot && (typeof v.cartSnapshot === 'string' ? v.cartSnapshot : (Array.isArray(v.cartSnapshot) && v.cartSnapshot.length > 0)) ? (
                      <div className="text-[11px] text-gray-500">
                        {typeof v.cartSnapshot === 'string' ? v.cartSnapshot : (v.cartSnapshot as CartItem[]).map((c, ci) => (
                          <div key={ci}>{typeof c === 'string' ? c : `${c.name} x${c.qty}`}</div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[11px] text-gray-400">No cart items at this visit</div>
                    )}
                  </div>
                ))}
              </div>
              <div className="px-5 pb-5">
                <div className="flex gap-2 items-center">
                  <select className="px-2.5 py-2 text-xs border border-gray-200 rounded-md outline-none font-sans flex-1" value={visitChannel} onChange={(e) => setVisitChannel(e.target.value)}>
                    {VISIT_CHANNELS.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                  </select>
                  <button className="bg-[#EAB308] text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer whitespace-nowrap" onClick={logVisit}>Log Visit</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      {drawerDatePopup && (
        <DateEditPopup
          field={drawerDatePopup}
          currentDate={form[drawerDatePopup] as string}
          followUpDate={form.followUpDate}
          closureDate={form.closureDate}
          assignedTo={form.assignedTo}
          onSave={handleDrawerDateSave}
          onCancel={() => setDrawerDatePopup(null)}
        />
      )}
    </>
  );
}

// ── Date Edit Popup ─────────────────────────────────────────────────────────
interface DateEditPopupProps {
  field: 'followUpDate' | 'closureDate';
  currentDate?: string;
  followUpDate?: string;
  closureDate?: string;
  assignedTo?: string;
  onSave: (newDate: string, remark: string) => void;
  onCancel: () => void;
}

function DateEditPopup({ field, currentDate, followUpDate, closureDate, assignedTo, onSave, onCancel }: DateEditPopupProps) {
  const label = field === 'followUpDate' ? 'Follow-up Date' : 'Closure Date';
  const [newDate, setNewDate] = useState(currentDate || '');
  const [remark, setRemark] = useState('');
  const [warning, setWarning] = useState('');
  const [autoUpdateNote, setAutoUpdateNote] = useState('');

  const toDateObj = (s: string): Date | undefined => {
    if (!s) return undefined;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const toStr = (d: Date | undefined): string => {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const validate = (date: string): string => {
    setAutoUpdateNote('');
    if (field === 'closureDate' && followUpDate && date && date < followUpDate) {
      return 'Closure date cannot be earlier than follow-up date (' + fmtDate(followUpDate) + ')';
    }
    if (field === 'followUpDate' && closureDate && date && date > closureDate) {
      setAutoUpdateNote('Closure date will be automatically updated to ' + fmtDate(date));
    }
    return '';
  };

  const handleDateSelect = (date: Date | undefined) => {
    const dateStr = toStr(date);
    setNewDate(dateStr);
    setWarning(validate(dateStr));
  };

  const remarkRequired = !!(newDate && newDate !== currentDate);

  const handleSave = () => {
    const w = validate(newDate);
    if (w) { setWarning(w); return; }
    if (remarkRequired && !remark.trim()) { setWarning('Remark is required when changing the date.'); return; }
    onSave(newDate, remark.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[1000]" onClick={onCancel}>
      <div className="bg-white rounded-lg overflow-hidden w-[90%] shadow-[0_20px_60px_rgba(0,0,0,0.15)] max-w-[380px]" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#1A1A1A] text-white px-5 py-3 flex justify-between items-center">
          <span className="font-semibold text-sm">Update {label}</span>
          <button className="bg-transparent border-none text-gray-400 text-xl cursor-pointer leading-none" onClick={onCancel}>&times;</button>
        </div>
        <div className="p-4">
          {currentDate && (
            <div className="text-xs text-gray-400 mb-2">
              Current: <span className="font-semibold text-gray-700">{fmtDate(currentDate)}</span>
            </div>
          )}
          {newDate && newDate !== currentDate && (
            <div className="text-xs text-[#EAB308] mb-2">
              New: <span className="font-semibold">{fmtDate(newDate)}</span>
            </div>
          )}
          <div className="flex justify-center">
            <DayPicker
              className="rdp-compact"
              mode="single"
              selected={toDateObj(newDate)}
              onSelect={handleDateSelect}
            />
          </div>
          {warning && <div className="text-[11px] text-red-500 mt-1 mb-1">{warning}</div>}
          {autoUpdateNote && <div className="text-[11px] text-[#EAB308] mt-1 mb-1">{autoUpdateNote}</div>}
          <div className="mt-2">
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: remarkRequired ? '#EF4444' : '#9CA3AF' }}>
              REMARK {remarkRequired ? <span className="text-red-500">* REQUIRED</span> : '(OPTIONAL)'}
            </label>
            <textarea
              className={`px-2.5 py-2 text-xs rounded-md outline-none font-sans w-full min-h-[50px] resize-y border ${remarkRequired && !remark.trim() ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
              value={remark}
              onChange={(e) => { setRemark(e.target.value); if (warning === 'Remark is required when changing the date.') setWarning(''); }}
              placeholder={'Reason for changing ' + label.toLowerCase() + '...'}
            />
            {remarkRequired && !remark.trim() && (
              <div className="text-[10px] text-red-500 mt-0.5">Please enter a reason for this date change.</div>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <button className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-md text-[13px] font-medium cursor-pointer" onClick={onCancel}>Cancel</button>
            <button className={`bg-[#EAB308] text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer flex-1 ${warning || !newDate || (remarkRequired && !remark.trim()) ? 'opacity-50' : 'opacity-100'}`} disabled={!!warning || !newDate || (remarkRequired && !remark.trim())} onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirmation ─────────────────────────────────────────────────────
interface DeleteConfirmProps {
  leadId: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function DeleteConfirm({ leadId, onConfirm, onCancel }: DeleteConfirmProps) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[1000]">
      <div className="bg-white rounded-lg overflow-hidden w-[90%] shadow-[0_20px_60px_rgba(0,0,0,0.15)] max-w-[360px]">
        <div className="bg-[#1A1A1A] text-white px-5 py-3 flex justify-between items-center">
          <span className="font-semibold text-sm">Delete Lead</span>
        </div>
        <div className="p-5 text-center">
          <p className="mb-4 text-[13px]">Are you sure you want to delete lead <strong>{leadId}</strong>? This action cannot be undone.</p>
          <div className="flex gap-2 justify-center">
            <button className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-md text-[13px] font-medium cursor-pointer" onClick={onCancel}>Cancel</button>
            <button className="bg-red-500 text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer" onClick={onConfirm}>Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Admin Dashboard ────────────────────────────────────────────────────────
function AdminDashboard({ onBack }: { onBack: () => void }) {
  const [activeTab, setActiveTab] = useState<'users' | 'branches' | 'logs'>('users');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [branchList, setBranchList] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newRole, setNewRole] = useState('sales');
  const [error, setError] = useState('');
  const [editId, setEditId] = useState<string | number | null>(null);
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editBranches, setEditBranches] = useState<string[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  useEffect(() => {
    Promise.all([fetchUsers(), fetchBranches().catch(() => [])]).then(([userData, branchData]) => {
      setUsers(userData);
      setBranchList(branchData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const loadLogs = () => {
    setLogsLoading(true);
    fetchActivityLogs(200).then((data) => { setLogs(data); setLogsLoading(false); }).catch(() => setLogsLoading(false));
  };

  useEffect(() => {
    if (activeTab === 'logs') loadLogs();
  }, [activeTab]);

  const handleAdd = async () => {
    if (!newName.trim() || !newCode.trim()) { setError('Name and code are required'); return; }
    if (users.some((u) => u.code === newCode.trim())) { setError('Code already exists'); return; }
    setError('');
    try {
      const user = await addUser({ name: newName.trim(), code: newCode.trim(), role: newRole });
      setUsers((prev) => [...prev, user]);
      setNewName(''); setNewCode(''); setNewRole('sales');
    } catch (e: any) {
      setError(e.message || 'Failed to add user');
    }
  };

  const handleDelete = async (id: string | number, name: string) => {
    if (!window.confirm(`Delete user "${name}"?`)) return;
    try {
      await deleteUser(id);
      setUsers((prev) => prev.filter((u) => u.id !== id));
    } catch (e: any) {
      setError(e.message || 'Failed to delete user');
    }
  };

  const startEdit = (u: AppUser) => {
    setEditId(u.id); setEditName(u.name); setEditCode(u.code); setEditRole(u.role); setEditBranches(u.allowedBranches || []);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim() || !editCode.trim()) { setError('Name and code are required'); return; }
    if (users.some((u) => u.code === editCode.trim() && u.id !== editId)) { setError('Code already exists'); return; }
    setError('');
    try {
      await updateUser(editId!, { name: editName.trim(), code: editCode.trim(), role: editRole });
      await updateUserBranches(editId!, editBranches);
      setUsers((prev) => prev.map((u) => u.id === editId ? { ...u, name: editName.trim(), code: editCode.trim(), role: editRole, allowedBranches: editBranches } : u));
      setEditId(null);
    } catch (e: any) {
      setError(e.message || 'Failed to update user');
    }
  };

  const getActionBadge = (action: string): string => {
    if (action.includes('created') || action === 'csv_imported') return 'bg-green-100 text-green-700';
    if (action.includes('updated') || action.includes('remark')) return 'bg-blue-100 text-blue-700';
    if (action.includes('status') || action.includes('date')) return 'bg-amber-100 text-amber-700';
    if (action.includes('deleted')) return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-600';
  };

  const tabs = [
    { key: 'users' as const, label: 'Users' },
    { key: 'branches' as const, label: 'Branches' },
    { key: 'logs' as const, label: 'Logs' },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col">
      <header className="h-12 bg-[#1A1A1A] flex items-center px-6 justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-white">material</span>
          <span className="text-sm font-bold text-[#EAB308] -ml-2.5">depot</span>
          <span className="text-xs text-gray-400 ml-2">Super Admin</span>
        </div>
        <button className="bg-transparent border border-gray-600 text-gray-400 text-[11px] px-2.5 py-1 rounded cursor-pointer hover:text-white hover:border-gray-400" onClick={onBack}>Back to Login</button>
      </header>

      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto w-full px-6 flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3 text-[13px] font-semibold border-b-2 cursor-pointer bg-transparent ${activeTab === tab.key ? 'border-[#EAB308] text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-6 py-8">
        {activeTab === 'users' && (
          <>
            <h1 className="text-lg font-bold text-gray-800 mb-6">User Management</h1>

            <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">Add New User</h2>
              <div className="flex gap-3 items-end flex-wrap">
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Name</label>
                  <input className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" />
                </div>
                <div className="w-[100px]">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Code</label>
                  <input className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-mono w-full text-center" value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="0000" maxLength={10} />
                </div>
                <div className="w-[130px]">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Role</label>
                  <select className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={newRole} onChange={(e) => setNewRole(e.target.value)}>
                    <option value="sales">Sales</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                    <option value="superadmin">Super Admin</option>
                  </select>
                </div>
                <button className="bg-[#EAB308] text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer" onClick={handleAdd}>Add User</button>
              </div>
              {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {loading ? (
                <div className="p-8 text-center text-gray-400 text-sm">Loading users...</div>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[#FAFAFA]">
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left">Name</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left">Code</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left">Role</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left">Branch Access</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.id} className="border-t border-gray-200 hover:bg-[#FFFAF7]">
                        {editId === u.id ? (
                          <>
                            <td className="px-4 py-2"><input className="px-2 py-1 text-[13px] border border-gray-200 rounded outline-none w-full" value={editName} onChange={(e) => setEditName(e.target.value)} /></td>
                            <td className="px-4 py-2"><input className="px-2 py-1 text-[13px] border border-gray-200 rounded outline-none font-mono w-full text-center" value={editCode} onChange={(e) => setEditCode(e.target.value)} /></td>
                            <td className="px-4 py-2">
                              <select className="px-2 py-1 text-[13px] border border-gray-200 rounded outline-none w-full" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                                <option value="sales">Sales</option>
                                <option value="manager">Manager</option>
                                <option value="admin">Admin</option>
                                <option value="superadmin">Super Admin</option>
                              </select>
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex flex-wrap gap-1.5">
                                {branchList.map((b) => (
                                  <label key={b.id} className="flex items-center gap-1 cursor-pointer text-[11px] text-gray-600">
                                    <input
                                      type="checkbox"
                                      className="accent-[#EAB308]"
                                      checked={editBranches.includes(b.name)}
                                      onChange={() => setEditBranches((prev) => prev.includes(b.name) ? prev.filter((x) => x !== b.name) : [...prev, b.name])}
                                    />
                                    {b.name}
                                  </label>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-center whitespace-nowrap">
                              <button className="text-[#EAB308] text-xs font-semibold cursor-pointer bg-transparent border-none mr-2" onClick={handleSaveEdit}>Save</button>
                              <button className="text-gray-400 text-xs cursor-pointer bg-transparent border-none" onClick={() => setEditId(null)}>Cancel</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-2.5 text-[13px] font-medium">{u.name}</td>
                            <td className="px-4 py-2.5 text-[13px] font-mono">{u.code}</td>
                            <td className="px-4 py-2.5">
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${u.role === 'superadmin' ? 'bg-purple-100 text-purple-700' : u.role === 'admin' ? 'bg-blue-100 text-blue-700' : u.role === 'manager' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                                {u.role}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              {(u.allowedBranches || []).length === 0
                                ? <span className="text-[11px] text-gray-400">All branches</span>
                                : <div className="flex flex-wrap gap-1">{(u.allowedBranches!).map((b) => <span key={b} className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">{b}</span>)}</div>
                              }
                            </td>
                            <td className="px-4 py-2.5 text-center whitespace-nowrap">
                              <button className="text-gray-500 text-xs cursor-pointer bg-transparent border-none mr-3 hover:text-[#EAB308]" onClick={() => startEdit(u)}>Edit</button>
                              <button className="text-red-400 text-xs cursor-pointer bg-transparent border-none hover:text-red-600" onClick={() => handleDelete(u.id, u.name)}>Delete</button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                    {users.length === 0 && (
                      <tr><td colSpan={5} className="p-8 text-center text-gray-400 text-sm">No users found</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            <p className="text-xs text-gray-400 mt-4 text-center">{users.length} user{users.length !== 1 ? 's' : ''} total</p>
          </>
        )}

        {activeTab === 'branches' && (
          <>
            <h1 className="text-lg font-bold text-gray-800 mb-6">Branch Management</h1>
            <BranchManager branches={branchList} setBranches={setBranchList} />
          </>
        )}

        {activeTab === 'logs' && (
          <>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-lg font-bold text-gray-800">Activity Logs</h1>
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400">{logs.length} log entries</span>
                <button className="bg-white text-gray-700 border border-gray-200 px-4 py-2 rounded-md text-[13px] font-medium cursor-pointer hover:border-gray-300" onClick={loadLogs}>Refresh</button>
              </div>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              {logsLoading ? (
                <div className="p-8 text-center text-gray-400 text-sm">Loading logs...</div>
              ) : (
                <div className="max-h-[600px] overflow-y-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-[#FAFAFA] sticky top-0">
                        <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left">Time</th>
                        <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left">User</th>
                        <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left">Action</th>
                        <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left">Entity</th>
                        <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {logs.map((log) => (
                        <tr key={log.id} className="border-t border-gray-200 hover:bg-[#FFFAF7]">
                          <td className="px-4 py-2.5 text-[12px] text-gray-500 whitespace-nowrap">{fmtTimestamp(log.created_at)}</td>
                          <td className="px-4 py-2.5 text-[13px] font-medium">{log.user_name}</td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-block px-2 py-0.5 rounded-xl text-[11px] font-semibold ${getActionBadge(log.action)}`}>
                              {log.action}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-[12px] text-gray-500">
                            {log.entity_type}{log.entity_id ? ` / ${log.entity_id}` : ''}
                          </td>
                          <td className="px-4 py-2.5 text-[12px] text-gray-500 max-w-[250px] truncate">{log.details || '—'}</td>
                        </tr>
                      ))}
                      {logs.length === 0 && (
                        <tr><td colSpan={5} className="p-8 text-center text-gray-400 text-sm">No log entries found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface BranchManagerProps {
  branches: Branch[];
  setBranches: React.Dispatch<React.SetStateAction<Branch[]>>;
}

function BranchManager({ branches, setBranches }: BranchManagerProps) {
  const [newBranch, setNewBranch] = useState('');
  const [editBranchId, setEditBranchId] = useState<string | number | null>(null);
  const [editBranchName, setEditBranchName] = useState('');
  const [branchError, setBranchError] = useState('');

  const handleAddBranch = async () => {
    const name = newBranch.trim();
    if (!name) { setBranchError('Branch name is required'); return; }
    if (branches.some((b) => b.name.toLowerCase() === name.toLowerCase())) { setBranchError('Branch already exists'); return; }
    setBranchError('');
    try {
      const b = await addBranch(name);
      setBranches((prev) => [...prev, b]);
      setNewBranch('');
    } catch (e: any) {
      setBranchError(e.message || 'Failed to add branch');
    }
  };

  const handleDeleteBranch = async (id: string | number, name: string) => {
    if (!window.confirm(`Delete branch "${name}"?`)) return;
    try {
      await deleteBranch(id);
      setBranches((prev) => prev.filter((b) => b.id !== id));
    } catch (e: any) {
      setBranchError(e.message || 'Failed to delete branch');
    }
  };

  const handleSaveBranch = async () => {
    const name = editBranchName.trim();
    if (!name) { setBranchError('Branch name is required'); return; }
    if (branches.some((b) => b.name.toLowerCase() === name.toLowerCase() && b.id !== editBranchId)) { setBranchError('Branch already exists'); return; }
    setBranchError('');
    try {
      await updateBranch(editBranchId!, name);
      setBranches((prev) => prev.map((b) => b.id === editBranchId ? { ...b, name } : b));
      setEditBranchId(null);
    } catch (e: any) {
      setBranchError(e.message || 'Failed to update branch');
    }
  };

  return (
    <>
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">Add New Branch</h2>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Branch Name</label>
            <input className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} placeholder="e.g. Koramangala" onKeyDown={(e) => { if (e.key === 'Enter') handleAddBranch(); }} />
          </div>
          <button className="bg-[#EAB308] text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer" onClick={handleAddBranch}>Add Branch</button>
        </div>
        {branchError && <p className="text-red-500 text-xs mt-2">{branchError}</p>}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#FAFAFA]">
              <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left">Branch Name</th>
              <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-center w-[120px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id} className="border-t border-gray-200 hover:bg-[#FFFAF7]">
                {editBranchId === b.id ? (
                  <>
                    <td className="px-4 py-2"><input className="px-2 py-1 text-[13px] border border-gray-200 rounded outline-none w-full" value={editBranchName} onChange={(e) => setEditBranchName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveBranch(); }} autoFocus /></td>
                    <td className="px-4 py-2 text-center whitespace-nowrap">
                      <button className="text-[#EAB308] text-xs font-semibold cursor-pointer bg-transparent border-none mr-2" onClick={handleSaveBranch}>Save</button>
                      <button className="text-gray-400 text-xs cursor-pointer bg-transparent border-none" onClick={() => setEditBranchId(null)}>Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2.5 text-[13px] font-medium">{b.name}</td>
                    <td className="px-4 py-2.5 text-center whitespace-nowrap">
                      <button className="text-gray-500 text-xs cursor-pointer bg-transparent border-none mr-3 hover:text-[#EAB308]" onClick={() => { setEditBranchId(b.id); setEditBranchName(b.name); setBranchError(''); }}>Edit</button>
                      <button className="text-red-400 text-xs cursor-pointer bg-transparent border-none hover:text-red-600" onClick={() => handleDeleteBranch(b.id, b.name)}>Delete</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {branches.length === 0 && (
              <tr><td colSpan={2} className="p-8 text-center text-gray-400 text-sm">No branches found</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-4 mb-8 text-center">{branches.length} branch{branches.length !== 1 ? 'es' : ''} total</p>
    </>
  );
}

interface LoginScreenProps {
  onLogin: (user: AppUser) => void;
  onAdmin: () => void;
}

function LoginScreen({ onLogin, onAdmin }: LoginScreenProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    try {
      const user = await loginWithCode(code.trim());
      if (user) {
        onLogin(user);
      } else {
        setError('Invalid code');
      }
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdminAccess = async () => {
    if (!code.trim()) { setError('Enter your admin code first'); return; }
    setLoading(true);
    setError('');
    try {
      const user = await loginWithCode(code.trim());
      if (user && user.role === 'superadmin') {
        onAdmin();
      } else if (user) {
        setError('Access denied. Super Admin code required.');
      } else {
        setError('Invalid code');
      }
    } catch {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col">
      <header className="h-12 bg-[#1A1A1A] flex items-center px-6">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-white">material</span>
          <span className="text-sm font-bold text-[#EAB308] -ml-2.5">depot</span>
          <span className="text-xs text-gray-400 ml-2">Sales CRM</span>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center">
        <div className="bg-white rounded-lg border border-gray-200 shadow-[0_4px_12px_rgba(0,0,0,0.08)] w-[360px] p-8">
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-1 mb-2">
              <span className="text-lg font-bold text-[#1A1A1A]">material</span>
              <span className="text-lg font-bold text-[#EAB308] -ml-1.5">depot</span>
            </div>
            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">Sales CRM Login</p>
          </div>
          <form onSubmit={handleSubmit}>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Enter your unique code</label>
            <input
              className="px-2.5 py-2.5 text-[15px] border border-gray-200 rounded-md outline-none font-mono w-full text-center tracking-[0.3em] focus:border-[#EAB308]"
              type="text"
              value={code}
              onChange={(e) => { setCode(e.target.value); setError(''); }}
              placeholder="0000"
              maxLength={10}
              autoFocus
            />
            {error && <p className="text-red-500 text-xs mt-2 text-center">{error}</p>}
            <div className="flex gap-2 mt-4">
              <button
                type="submit"
                disabled={loading || !code.trim()}
                className={`bg-[#EAB308] text-white border-none px-5 py-2.5 rounded-md text-[13px] font-semibold cursor-pointer flex-1 ${loading || !code.trim() ? 'opacity-50' : 'opacity-100'}`}
              >
                {loading ? 'Logging in...' : 'Login'}
              </button>
              <button
                type="button"
                disabled={loading || !code.trim()}
                onClick={handleAdminAccess}
                className={`bg-white text-gray-600 border border-gray-200 px-4 py-2.5 rounded-md text-[13px] font-medium cursor-pointer ${loading || !code.trim() ? 'opacity-50' : 'opacity-100'}`}
              >
                Admin
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── App ─────────────────────────────────────────────────────────────────────
interface CsvRow {
  leadId: string;
  clientName: string;
  clientPhone: string;
  createdAt: string;
  assignedTo: string;
  branch: string;
  status: string;
  lostReason: string;
  cartItems: string;
  cartValue: number;
  followUpDate: string;
  closureDate: string;
  remarks: Remark[];
  visits: Visit[];
  clientType: string;
  propertyType: string;
  architectInvolved: boolean;
}

type DateEditState = { leadId: string; field: 'followUpDate' | 'closureDate' };

export default function App() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [mainTab, setMainTab] = useState<'leads' | 'dashboard' | 'storeVisit' | 'sales'>('leads');
  const [dashLogs, setDashLogs] = useState<ActivityLog[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('materialdepot_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        setCurrentUser({ ...parsed, allowedBranches: parsed.allowedBranches || [] });
      }
    } catch {}
    setUserLoaded(true);
  }, []);

  const handleLogin = (user: AppUser) => {
    const userData: AppUser = { id: user.id, name: user.name, code: user.code, role: user.role, allowedBranches: user.allowedBranches || [] };
    setCurrentUser(userData);
    localStorage.setItem('materialdepot_user', JSON.stringify(userData));
    logActivity({ userId: user.id, userName: user.name, action: 'user_login', entityType: 'user', entityId: user.id, details: user.name + ' logged in' }).catch(console.error);
  };

  const handleLogout = () => {
    if (currentUser) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'user_logout', entityType: 'user', entityId: currentUser.id, details: currentUser.name + ' logged out' }).catch(console.error);
    }
    setCurrentUser(null);
    localStorage.removeItem('materialdepot_user');
  };

  const [leads, setLeads] = useState<Lead[]>([]);
  const [branches, setBranches] = useState<string[]>(DEFAULT_BRANCHES);
  const [crmUsers, setCrmUsers] = useState<AppUser[]>([]);
  const [dbReady, setDbReady] = useState(false);
  const [leadsLoading, setLeadsLoading] = useState(false);
  const [leadsTotal, setLeadsTotal] = useState(0);
  const [leadsTotalPages, setLeadsTotalPages] = useState(1);
  const [leadsStats, setLeadsStats] = useState<CRMLeadsStats | null>(null);

  useEffect(() => {
    if (mainTab === 'dashboard' && dashLogs.length === 0) {
      fetchActivityLogs(500).then(setDashLogs).catch(() => {});
    }
  }, [mainTab]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [personFilter, setPersonFilter] = useState<string[]>([]);
  const [branchFilter, setBranchFilter] = useState<string[]>([]);
  const [createdDateFrom, setCreatedDateFrom] = useState('');
  const [createdDateTo, setCreatedDateTo] = useState('');
  const [followUpDateFrom, setFollowUpDateFrom] = useState('');
  const [followUpDateTo, setFollowUpDateTo] = useState('');
  const [closureDateFrom, setClosureDateFrom] = useState('');
  const [closureDateTo, setClosureDateTo] = useState('');
  const [cartValueGt, setCartValueGt] = useState('');
  const [taskFilter, setTaskFilter] = useState('');
  const [sortCol, setSortCol] = useState('latestVisit');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [drawerLead, setDrawerLead] = useState<Lead | null>(null);

  useEffect(() => {
    if (!drawerLead) return;
    fetchLeadRemarks(drawerLead.id).then(remarks => {
      if (remarks.length) {
        setLeads(prev => prev.map(l =>
          l.id === drawerLead.id && l.clientPhone === drawerLead.clientPhone ? { ...l, remarks } : l
        ));
      }
    }).catch(() => {});
  }, [drawerLead?.id, drawerLead?.clientPhone]);

  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [deleteLeadState, setDeleteLeadState] = useState<Lead | null>(null);
  const [dateEditPopup, setDateEditPopup] = useState<DateEditState | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);

  const debouncedSearch = useDebouncedValue(search.trim(), 600);
  const debouncedCartValueGt = useDebouncedValue(cartValueGt.trim(), 400);

  useEffect(() => {
    setPage(0);
  }, [
    debouncedSearch, branchFilter, personFilter, statusFilter,
    createdDateFrom, createdDateTo,
    followUpDateFrom, followUpDateTo,
    closureDateFrom, closureDateTo,
    debouncedCartValueGt,
  ]);

  useEffect(() => {
    if (!currentUser) return;
    const branchCsv = branchFilter.join(',');
    const bmCsv = personFilter.join(',');
    const statusCsv = statusFilter.join(',');
    const cartGt = debouncedCartValueGt ? Number(debouncedCartValueGt) : undefined;
    setLeadsLoading(true);
    let cancelled = false;
    Promise.all([
      fetchCRMLeads({
        page: page + 1,
        pageSize,
        branch: branchCsv || undefined,
        bm: bmCsv || undefined,
        q: debouncedSearch || undefined,
        status: statusCsv || undefined,
        createdFrom: createdDateFrom || undefined,
        createdTo: createdDateTo || undefined,
        followupFrom: followUpDateFrom || undefined,
        followupTo: followUpDateTo || undefined,
        closureFrom: closureDateFrom || undefined,
        closureTo: closureDateTo || undefined,
        cartValueGt: cartGt,
      }),
      fetchBranches().catch(() => []),
      fetchUsers().catch(() => []),
    ]).then(([crmLeadsPage, dbBranches, dbUsers]) => {
      if (cancelled) return;
      if (dbBranches.length > 0) setBranches(dbBranches.map((b: { name: string }) => b.name));
      setCrmUsers(dbUsers);
      setLeads(crmLeadsPage.results as Lead[]);
      setLeadsTotal(crmLeadsPage.count);
      setLeadsTotalPages(crmLeadsPage.totalPages);
      setDbReady(true);
      setLeadsLoading(false);
    }).catch(() => {
      if (cancelled) return;
      setDbReady(true);
      setLeadsLoading(false);
    });
    return () => { cancelled = true; };
  }, [
    currentUser, page, pageSize, debouncedSearch,
    branchFilter, personFilter, statusFilter,
    createdDateFrom, createdDateTo,
    followUpDateFrom, followUpDateTo,
    closureDateFrom, closureDateTo,
    debouncedCartValueGt,
  ]);

  useEffect(() => {
    if (!currentUser) return;
    const branchCsv = branchFilter.join(',');
    const bmCsv = personFilter.join(',');
    const statusCsv = statusFilter.join(',');
    const cartGt = debouncedCartValueGt ? Number(debouncedCartValueGt) : undefined;
    let cancelled = false;
    fetchCRMLeadsStats({
      branch: branchCsv || undefined,
      bm: bmCsv || undefined,
      q: debouncedSearch || undefined,
      status: statusCsv || undefined,
      createdFrom: createdDateFrom || undefined,
      createdTo: createdDateTo || undefined,
      followupFrom: followUpDateFrom || undefined,
      followupTo: followUpDateTo || undefined,
      closureFrom: closureDateFrom || undefined,
      closureTo: closureDateTo || undefined,
      cartValueGt: cartGt,
    }).then((stats) => {
      if (!cancelled) setLeadsStats(stats);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [
    currentUser, debouncedSearch,
    branchFilter, personFilter, statusFilter,
    createdDateFrom, createdDateTo,
    followUpDateFrom, followUpDateTo,
    closureDateFrom, closureDateTo,
    debouncedCartValueGt,
  ]);

  const [csvPreview, setCsvPreview] = useState<CsvRow[] | null>(null);
  const [csvErrors, setCsvErrors] = useState<string[] | null>(null);
  const [csvSelected, setCsvSelected] = useState<Set<number>>(new Set());
  const [csvImportCount, setCsvImportCount] = useState<number | null>(null);
  const csvFileRef = useRef<HTMLInputElement>(null);

  const [saveErrorMsg, setSaveErrorMsg] = useState<string | null>(null);
  const showSaveError = (msg: string = 'Failed to save. Please log out and log back in, then try again.') => {
    setSaveErrorMsg(msg);
    setTimeout(() => setSaveErrorMsg(null), 8000);
  };

  const ALL_COLUMNS = [
    { key: 'id', label: 'Lead ID' },
    { key: 'clientName', label: 'Client Name' },
    { key: 'clientPhone', label: 'Client Phone' },
    { key: 'createdAt', label: 'Created' },
    { key: 'firstVisit', label: 'First Visit' },
    { key: 'latestVisit', label: 'Latest Visit' },
    { key: 'assignedTo', label: 'Assigned To' },
    { key: 'branch', label: 'Branch' },
    { key: 'clientType', label: 'Client Type' },
    { key: 'propertyType', label: 'Property Type' },
    { key: 'architectInvolved', label: 'Architect/Designer' },
    { key: 'projectPhase', label: 'Project Phase' },
    { key: 'status', label: 'Status' },
    { key: 'cartItems', label: 'Cart Items' },
    { key: 'followUpDate', label: 'Follow-up' },
    { key: 'closureDate', label: 'Closure Date' },
    { key: 'visitCount', label: 'Visits' },
    { key: 'cartValue', label: 'Cart Value' },
  ];
  const [visibleCols, setVisibleCols] = useState<string[]>(() => {
    if (typeof window === 'undefined') return ALL_COLUMNS.map((c) => c.key);
    try {
      const stored = localStorage.getItem('materialdepot_cols');
      if (stored) return JSON.parse(stored);
    } catch {}
    return ALL_COLUMNS.map((c) => c.key);
  });
  const isColVisible = (key: string) => visibleCols.includes(key);
  const toggleCol = (key: string) => {
    setVisibleCols((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      localStorage.setItem('materialdepot_cols', JSON.stringify(next));
      return next;
    });
  };

  const isAdminUser = currentUser?.role === 'superadmin';
  const userAllowedBranches = isAdminUser ? [] : (currentUser?.allowedBranches || []);

  const availableBMs = [...new Set(leads.map((l) => l.assignedTo).filter(Boolean))].sort();

  const baseFiltered = leads.filter((l) => {
    if (personFilter.length > 0 && !personFilter.includes(l.assignedTo)) return false;
    if (userAllowedBranches.length > 0) {
      if (!userAllowedBranches.includes(l.branch)) return false;
    } else if (branchFilter.length > 0 && !branchFilter.includes(l.branch)) return false;
    if (createdDateFrom && (!l.createdAt || l.createdAt < createdDateFrom)) return false;
    if (createdDateTo && (!l.createdAt || l.createdAt > createdDateTo)) return false;
    if (followUpDateFrom || followUpDateTo) {
      if (!l.followUpDate) return false;
      if (followUpDateFrom && l.followUpDate < followUpDateFrom) return false;
      if (followUpDateTo && l.followUpDate > followUpDateTo) return false;
    }
    if (closureDateFrom || closureDateTo) {
      if (!l.closureDate) return false;
      if (closureDateFrom && l.closureDate < closureDateFrom) return false;
      if (closureDateTo && l.closureDate > closureDateTo) return false;
    }
    if (cartValueGt !== '' && (l.cartValue || 0) < Number(cartValueGt)) return false;
    if (taskFilter === 'followup_pending' && l.followUpDate) return false;
    if (taskFilter === 'closure_pending' && l.closureDate) return false;
    if (taskFilter === 'overdue') {
      const today = todayStr();
      const followUpOverdue = l.followUpDate && l.followUpDate < today;
      const closureOverdue = l.closureDate && l.closureDate < today;
      if (!followUpOverdue && !closureOverdue) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const matchId = l.id.toLowerCase().includes(q);
      const matchPerson = l.assignedTo.toLowerCase().includes(q);
      const cartStr = typeof l.cartItems === 'string' ? l.cartItems : Array.isArray(l.cartItems) ? l.cartItems.map(i => typeof i === 'string' ? i : i.name).join(' ') : '';
      const matchItems = cartStr.toLowerCase().includes(q);
      const matchClient = (l.clientName || '').toLowerCase().includes(q);
      const matchPhone = (l.clientPhone || '').includes(q);
      if (!matchId && !matchPerson && !matchItems && !matchClient && !matchPhone) return false;
    }
    return true;
  });

  const filtered = baseFiltered.filter((l) => {
    if (statusFilter.length > 0 && !statusFilter.includes(l.status)) return false;
    return true;
  });

  const pipelineTotal = leadsStats?.total.value ?? 0;
  const pipelineActive = leadsStats?.active.value ?? 0;
  const pipelineWon = leadsStats?.won.value ?? 0;
  const pipelineLost = leadsStats?.lost.value ?? 0;
  const pctWon = pipelineTotal ? (pipelineWon / pipelineTotal) * 100 : 0;
  const pctActive = pipelineTotal ? (pipelineActive / pipelineTotal) * 100 : 0;
  const pctLost = pipelineTotal ? (pipelineLost / pipelineTotal) * 100 : 0;

  const statsByStatus = new Map<string, { count: number; value: number }>(
    (leadsStats?.byStatus || []).map((s) => [s.status, { count: s.count, value: s.value }]),
  );
  const stageSummary = STATUSES.map((status) => {
    const row = statsByStatus.get(status);
    return { status, count: row?.count || 0, value: row?.value || 0 };
  });

  const statusChips = stageSummary.filter((s) => s.value > 0);

  const totalLeadsCount = leadsStats?.total.count ?? leadsTotal ?? filtered.length;
  const activeCount = leadsStats?.active.count ?? 0;
  const wonCount = leadsStats?.won.count ?? 0;
  const lostCount = leadsStats?.lost.count ?? 0;

  const getFirstVisit = (l: Lead): string => { const v = l.visits || []; return v.length > 0 ? [...v].sort((a, b) => a.date.localeCompare(b.date))[0].date : l.createdAt || ''; };
  const getLatestVisit = (l: Lead): string => { const v = l.visits || []; return v.length > 0 ? [...v].sort((a, b) => b.date.localeCompare(a.date))[0].date : l.createdAt || ''; };

  const sorted = [...filtered].sort((a, b) => {
    let va: any, vb: any;
    if (sortCol === 'visitCount') {
      va = (a.visits || []).length;
      vb = (b.visits || []).length;
      return sortDir === 'asc' ? va - vb : vb - va;
    }
    if (sortCol === 'firstVisit') { va = getFirstVisit(a); vb = getFirstVisit(b); return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va); }
    if (sortCol === 'latestVisit') { va = getLatestVisit(a); vb = getLatestVisit(b); return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va); }
    va = (a as any)[sortCol]; vb = (b as any)[sortCol];
    if (sortCol === 'cartValue') { va = va || 0; vb = vb || 0; return sortDir === 'asc' ? va - vb : vb - va; }
    if (sortCol === 'architectInvolved') { va = va ? 1 : 0; vb = vb ? 1 : 0; return sortDir === 'asc' ? va - vb : vb - va; }
    if (va == null) va = ''; if (vb == null) vb = '';
    if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setPage(0);
  };

  useEffect(() => { setPage(0); }, [search, statusFilter, personFilter, branchFilter, createdDateFrom, createdDateTo, followUpDateFrom, followUpDateTo, closureDateFrom, closureDateTo, cartValueGt]);

  const totalPages = leadsTotalPages || (Math.ceil(sorted.length / pageSize) || 1);
  const safePage = Math.min(page, totalPages - 1);
  const paginatedRows = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const filteredTotal = pipelineTotal;

  const saveLead = (formData: Lead) => {
    const existing = leads.find((l) => l.id === formData.id && l.clientPhone === formData.clientPhone) || leads.find((l) => l.id === formData.id);
    const isNew = !existing;
    const finalData = existing ? mergeLead(existing, formData) : formData;
    setLeads((prev) => {
      const idx = prev.findIndex((l) => l.id === finalData.id && l.clientPhone === finalData.clientPhone);
      if (idx >= 0) { const next = [...prev]; next[idx] = finalData; return next; }
      return [...prev, finalData];
    });
    upsertLead(finalData).catch((e) => { console.error('Save failed:', e); showSaveError(); });
    if (finalData.clientPhone) {
      updateLeadProperties(finalData.clientPhone, {
        client_type: finalData.clientType || undefined,
        property_type: finalData.propertyType || undefined,
        architect_involved: finalData.architectInvolved ? 'yes' : 'no',
        followup_date: finalData.followUpDate || undefined,
        project_phase: finalData.projectPhase || undefined,
        estimated_closure_date: finalData.closureDate || undefined,
      }).catch((e) => console.error('Property sync failed:', e));
    }
    if (currentUser) {
      if (isNew) {
        logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'created_lead', entityType: 'lead', entityId: formData.id, details: formData.clientName || '' }).catch(console.error);
      } else {
        logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'updated_lead', entityType: 'lead', entityId: formData.id, details: formData.clientName || '' }).catch(console.error);
      }
    }
    setDrawerLead(null);
    setShowAddDrawer(false);
  };

  const removeLead = (id: string) => {
    const lead = leads.find((l) => l.id === id);
    setLeads((prev) => prev.filter((l) => !(l.id === id && l.clientPhone === (lead ? lead.clientPhone : ''))));
    deleteLeadDb(id, lead ? lead.clientPhone || '' : '').catch((e) => console.error('Delete failed:', e));
    if (currentUser) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'deleted_lead', entityType: 'lead', entityId: id, details: lead ? lead.clientName || '' : '' }).catch(console.error);
    }
    setDeleteLeadState(null);
  };

  const updateStatus = (id: string, newStatus: string, lostReason?: string) => {
    const userName = currentUser ? currentUser.name : '';
    const oldLead = leads.find((l) => l.id === id);
    const oldStatus = oldLead ? oldLead.status : '';
    setLeads((prev) => {
      const updated = prev.map((l) => {
        if (l.id !== id) return l;
        const remark: Remark = { ts: new Date().toISOString(), author: userName, text: 'Status changed from ' + l.status + ' to ' + newStatus + (lostReason ? ' (' + lostReason + ')' : '') };
        return { ...l, status: newStatus, lostReason: newStatus === 'Order Lost' ? lostReason : '', remarks: [...(l.remarks || []), remark] };
      });
      const lead = updated.find((l) => l.id === id);
      if (lead) upsertLead(lead).catch((e) => console.error('Status update failed:', e));
      return updated;
    });
    if (newStatus === 'Order Lost') {
      markLeadLost(id, lostReason || '').catch((e) => console.error('Estimate lost sync failed:', e));
    }
    if (currentUser) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'status_changed', entityType: 'lead', entityId: id, details: oldStatus + ' → ' + newStatus }).catch(console.error);
    }
  };

  const addRemark = (leadId: string, clientPhone: string, remark: Remark) => {
    setLeads((prev) => prev.map((l) => (l.id === leadId && l.clientPhone === clientPhone) ? { ...l, remarks: [...(l.remarks || []), remark] } : l));
    appendRemarkToLead(leadId, clientPhone, remark).then((latestRemarks: Remark[]) => {
      setLeads((prev) => prev.map((l) => (l.id === leadId && l.clientPhone === clientPhone) ? { ...l, remarks: latestRemarks } : l));
    }).catch((e) => console.error('Remark save failed:', e));
    if (currentUser) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'added_remark', entityType: 'lead', entityId: leadId, details: remark.text ? remark.text.substring(0, 100) : '' }).catch(console.error);
    }
  };

  const handleDateEditSave = (newDate: string, remarkText: string) => {
    if (!dateEditPopup) return;
    const { leadId, field } = dateEditPopup;
    const leadPhone = (leads.find((l) => l.id === leadId) || {} as Lead).clientPhone || '';
    const userName = currentUser ? currentUser.name : '';
    setLeads((prev) => {
      const updated = prev.map((l) => {
        if (!(l.id === leadId && l.clientPhone === leadPhone)) return l;
        const u: Lead = { ...l, [field]: newDate };
        if (field === 'followUpDate' && newDate && l.closureDate && newDate > l.closureDate) {
          u.closureDate = newDate;
        }
        if (field === 'closureDate' && l.followUpDate && newDate && newDate < l.followUpDate) {
          return l;
        }
        const remarks: Remark[] = [...(l.remarks || [])];
        if (remarkText) {
          const label = field === 'followUpDate' ? 'Follow-up' : 'Closure';
          const oldDate = l[field];
          const text = label + ' date changed' + (oldDate ? ' from ' + fmtDate(oldDate) : '') + ' to ' + fmtDate(newDate) + ': ' + remarkText;
          remarks.push({ ts: new Date().toISOString(), author: userName, text });
        }
        if (field === 'followUpDate' && newDate && l.closureDate && newDate > l.closureDate) {
          remarks.push({ ts: new Date().toISOString(), author: userName, text: 'Closure date auto-updated from ' + fmtDate(l.closureDate) + ' to ' + fmtDate(newDate) + ' (follow-up date exceeded closure date)' });
        }
        u.remarks = remarks;
        return u;
      });
      const lead = updated.find((l) => l.id === leadId && l.clientPhone === leadPhone);
      if (lead) {
        fetchLead(leadId, leadPhone).then((dbLead: Lead) => {
          const mergedRemarks = [...(dbLead.remarks || [])];
          (lead.remarks || []).forEach((r) => {
            if (!mergedRemarks.some((mr) => mr.ts === r.ts && mr.text === r.text)) mergedRemarks.push(r);
          });
          const merged: Lead = { ...lead, remarks: mergedRemarks };
          upsertLead(merged).catch((e) => { console.error('Date edit save failed:', e); showSaveError(); });
          setLeads((p) => p.map((l) => (l.id === leadId && l.clientPhone === leadPhone) ? merged : l));
        }).catch(() => {
          upsertLead(lead).catch((e) => { console.error('Date edit save failed:', e); showSaveError(); });
        });
      }
      return updated;
    });
    if (currentUser) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'date_changed', entityType: 'lead', entityId: leadId, details: field + ' set to ' + newDate }).catch(console.error);
    }
    setDateEditPopup(null);
  };

  // ── CSV helpers ──────────────────────────────────────────────────────────
  const CSV_HEADERS = ['Lead ID','Client Name','Client Phone','Created Date','Assigned To','Branch','Status','Lost Reason','Cart Items','Cart Value','Follow-up Date','Closure Date','Remarks','Visits','Client Type','Property Type','Architect/Designer Involved'];

  const downloadCsvTemplate = () => {
    const rows = [
      CSV_HEADERS.join(','),
      '"MD-ABC123",Vikram Rao,9876543210,15/03/2026,Arjun Mehta,JP Nagar,Quote Approval Pending,,"Portland Cement 50kg, Binding Wire, Sand","1,65,000",10/04/2026,20/04/2026,Client requested bulk quote|15/03/2026|Arjun Mehta,15/03/2026|Website;18/03/2026|JP Nagar Centre,Home Owner,Apartment,yes',
      '"MD-DEF456",Anita Deshmukh,9845012345,10/03/2026,Priya Sharma,Whitefield,Order Lost,Pricing Issue,"TMT Steel Bars, Cement","3,00,000",05/04/2026,,,,Commercial Owner,Commercial,no',
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'materialdepot_crm_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const parseCsvLine = (line: string): string[] => {
    const fields: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && i + 1 < line.length && line[i + 1] === '"') {
          current += '"'; i++;
        } else if (ch === '"') {
          inQuotes = false;
        } else {
          current += ch;
        }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { fields.push(current.trim()); current = ''; }
        else { current += ch; }
      }
    }
    fields.push(current.trim());
    return fields;
  };

  const parseDDMMYYYY = (d: string): string | null => {
    if (!d) return '';
    const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return null;
    const iso = `${m[3]}-${m[2]}-${m[1]}`;
    if (isNaN(new Date(iso + 'T00:00:00').getTime())) return null;
    return iso;
  };
  const isValidCsvDate = (d: string): boolean => parseDDMMYYYY(d) !== null;

  const handleCsvFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (csvFileRef.current) csvFileRef.current.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      let text = ev.target?.result as string;
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
      if (lines.length === 0) { setCsvErrors(['File is empty.']); return; }
      const headerFields = parseCsvLine(lines[0]);
      const headerMatch = CSV_HEADERS.every((h, i) => (headerFields[i] || '').trim().toLowerCase() === h.toLowerCase());
      if (!headerMatch) { setCsvErrors(['Header row does not match expected format. Expected: ' + CSV_HEADERS.join(', ')]); return; }
      if (lines.length < 2) { setCsvErrors(['File contains only headers and no data rows.']); return; }

      const errors: string[] = [];
      const parsed: CsvRow[] = [];

      for (let r = 1; r < lines.length; r++) {
        const rowNum = r + 1;
        const fields = parseCsvLine(lines[r]);
        if (fields.length < 14) { errors.push('Row ' + rowNum + ': Expected at least 14 columns, got ' + fields.length); continue; }

        const [leadId, clientName, clientPhone, createdDate, assignedTo, branch, status, lostReason, cartItemsStr, cartValueStr, followUpDate, closureDate, remarksStr, visitsStr, clientTypeStr, propertyTypeStr, architectInvolvedStr] = fields;

        if (!leadId) errors.push('Row ' + rowNum + ': Lead ID is required');
        if (!/^\d{10}$/.test(clientPhone)) errors.push('Row ' + rowNum + ': Client Phone must be exactly 10 digits');

        if (createdDate && !isValidCsvDate(createdDate)) errors.push('Row ' + rowNum + ': Created Date "' + createdDate + '" must be DD/MM/YYYY format');
        if (branch && !branches.includes(branch)) errors.push('Row ' + rowNum + ': Branch "' + branch + '" is not a valid branch');
        if (status && !STATUSES.includes(status)) errors.push('Row ' + rowNum + ': Status "' + status + '" is not a valid status');

        if (status === 'Order Lost') {
          if (lostReason && !ORDER_LOST_REASONS.includes(lostReason)) errors.push('Row ' + rowNum + ': Lost Reason "' + lostReason + '" is not a valid reason');
        } else if (status) {
          if (lostReason) errors.push('Row ' + rowNum + ': Lost Reason should be empty when Status is not "Order Lost"');
        }

        const cartItems = cartItemsStr ? cartItemsStr.split(/[;,]/).map(s => s.trim()).filter(Boolean).join(', ') : '';

        const cartValueClean = cartValueStr ? cartValueStr.replace(/[^0-9]/g, '') : '';
        let cartValue = cartValueClean ? Number(cartValueClean) : 0;
        if (cartValueStr && !cartValueClean && cartValueStr.trim()) errors.push('Row ' + rowNum + ': Cart Value must be a number');

        if (followUpDate && !isValidCsvDate(followUpDate)) errors.push('Row ' + rowNum + ': Follow-up Date "' + followUpDate + '" must be DD/MM/YYYY format');
        if (closureDate && !isValidCsvDate(closureDate)) errors.push('Row ' + rowNum + ': Closure Date "' + closureDate + '" must be DD/MM/YYYY format');

        const clientType = (clientTypeStr || '').trim();
        const propertyType = (propertyTypeStr || '').trim();
        const architectInvolvedRaw = (architectInvolvedStr || '').trim().toLowerCase();
        if (clientType && !CLIENT_TYPES.includes(clientType)) errors.push('Row ' + rowNum + ': Client Type "' + clientType + '" is not valid. Must be one of: ' + CLIENT_TYPES.join(', '));
        if (propertyType && !PROPERTY_TYPES.includes(propertyType)) errors.push('Row ' + rowNum + ': Property Type "' + propertyType + '" is not valid. Must be one of: ' + PROPERTY_TYPES.join(', '));
        if (architectInvolvedRaw && !['true', 'false', 'yes', 'no'].includes(architectInvolvedRaw)) errors.push('Row ' + rowNum + ': Architect/Designer Involved "' + architectInvolvedStr + '" must be true/false/yes/no or empty');
        const architectInvolved = ['true', 'yes'].includes(architectInvolvedRaw);

        let remarks: Remark[] = [];
        if (remarksStr) {
          const remarkParts = remarksStr.split(';');
          for (const rp of remarkParts) {
            if (!rp.trim()) continue;
            const segs = rp.split('|');
            if (segs.length >= 3) {
              const remarkDate = segs[1].trim() ? (parseDDMMYYYY(segs[1].trim()) || segs[1].trim()) : todayStr();
              remarks.push({ text: segs[0].trim(), ts: remarkDate + 'T10:00:00', author: segs[2].trim() });
            } else if (segs.length >= 1 && segs[0].trim()) {
              remarks.push({ text: segs[0].trim(), ts: todayStr() + 'T10:00:00', author: assignedTo || '' });
            }
          }
        }

        let visits: Visit[] = [];
        if (visitsStr) {
          const visitParts = visitsStr.split(';');
          for (const vp of visitParts) {
            if (!vp.trim()) continue;
            const segs = vp.split('|');
            const vDate = (segs[0] || '').trim();
            const vChannel = (segs[1] || '').trim();
            if (vDate && !isValidCsvDate(vDate)) { errors.push('Row ' + rowNum + ': Visit date "' + vDate + '" must be DD/MM/YYYY format'); continue; }
            if (vChannel && !VISIT_CHANNELS.includes(vChannel)) { errors.push('Row ' + rowNum + ': Visit channel "' + vChannel + '" is not valid'); continue; }
            let vCart: CartItem[] = [];
            if (segs[2]) {
              for (const ci of segs[2].split(',')) {
                if (!ci.trim()) continue;
                const cs = ci.split(':');
                if (cs.length === 3) vCart.push({ name: cs[0].trim(), qty: Number(cs[1]) || 0, price: Number(cs[2]) || 0 });
              }
            }
            visits.push({ date: (vDate ? parseDDMMYYYY(vDate) : null) || todayStr(), channel: vChannel || VISIT_CHANNELS[0], cartSnapshot: vCart });
          }
        }

        parsed.push({ leadId: leadId.trim(), clientName: clientName || '', clientPhone, createdAt: (createdDate ? parseDDMMYYYY(createdDate) : null) || todayStr(), assignedTo: assignedTo || '', branch: branch || (branches[0] || ''), status: status || STATUSES[0], lostReason: lostReason || '', cartItems, cartValue, followUpDate: followUpDate ? (parseDDMMYYYY(followUpDate) || '') : '', closureDate: closureDate ? (parseDDMMYYYY(closureDate) || '') : '', remarks, visits, clientType, propertyType, architectInvolved });
      }

      if (errors.length > 0) { setCsvErrors(errors); setCsvPreview(null); }
      else {
        const dedupeMap = new Map<string, CsvRow>();
        parsed.forEach((p) => {
          const key = p.leadId + '|' + p.clientPhone;
          dedupeMap.set(key, p);
        });
        const deduped = [...dedupeMap.values()];
        if (deduped.length < parsed.length) {
          console.log('CSV deduplication: ' + parsed.length + ' rows → ' + deduped.length + ' unique (by Lead ID + Phone)');
        }
        setCsvPreview(deduped);
        setCsvSelected(new Set(deduped.map((_, i) => i)));
        setCsvErrors(null);
      }
    };
    reader.readAsText(file);
  };

  const importCsvLeads = () => {
    if (!csvPreview) return;
    const newLeads: Lead[] = csvPreview.filter((_, i) => csvSelected.has(i)).map((row) => ({
      id: row.leadId,
      createdAt: row.createdAt,
      assignedTo: row.assignedTo,
      branch: row.branch,
      status: row.status,
      lostReason: row.lostReason,
      cartValue: row.cartValue,
      cartItems: row.cartItems,
      followUpDate: row.followUpDate,
      closureDate: row.closureDate,
      remarks: row.remarks,
      visits: row.visits,
      clientName: row.clientName,
      clientPhone: row.clientPhone,
      clientType: row.clientType || '',
      propertyType: row.propertyType || '',
      architectInvolved: row.architectInvolved || false,
    }));
    setLeads((prev) => {
      const updated = [...prev];
      const toUpsert: Lead[] = [];
      for (const incoming of newLeads) {
        const existIdx = updated.findIndex((l) => l.id === incoming.id && l.clientPhone === incoming.clientPhone) >= 0
          ? updated.findIndex((l) => l.id === incoming.id && l.clientPhone === incoming.clientPhone)
          : updated.findIndex((l) => l.id === incoming.id);
        if (existIdx >= 0) {
          updated[existIdx] = mergeLead(updated[existIdx], incoming);
          toUpsert.push(updated[existIdx]);
        } else {
          updated.push(incoming);
          toUpsert.push(incoming);
        }
      }
      upsertLeads(toUpsert).then(() => console.log('CSV import to Supabase successful:', toUpsert.length, 'leads')).catch((e) => { console.error('CSV import failed:', e); alert('Import saved locally but failed to sync to database: ' + (e.message || e)); });
      return updated;
    });
    if (currentUser) {
      logActivity({ userId: currentUser.id, userName: currentUser.name, action: 'csv_imported', entityType: 'lead', entityId: null, details: newLeads.length + ' leads imported' }).catch(console.error);
    }
    setCsvImportCount(newLeads.length);
    setCsvPreview(null);
    setCsvSelected(new Set());
    setTimeout(() => setCsvImportCount(null), 3000);
  };

  const today = todayStr();

  const isOverdue = (l: Lead): boolean => !!(l.followUpDate && l.followUpDate < today && !['Delivered', 'Refunded', 'Order Lost'].includes(l.status));

  const toggleStatusFilter = useCallback((status: string) => {
    setStatusFilter((prev) => prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]);
  }, []);

  const COL_COUNT = visibleCols.length + 1;

  if (!userLoaded) return null;
  if (showAdmin) return <AdminDashboard onBack={() => setShowAdmin(false)} />;
  if (!currentUser) return <LoginScreen onLogin={handleLogin} onAdmin={() => setShowAdmin(true)} />;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <header className="sticky top-0 z-[900] h-12 bg-[#1A1A1A] flex items-center px-6 justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-white">material</span>
          <span className="text-sm font-bold text-[#EAB308] -ml-2.5">depot</span>
          <span className="text-xs text-gray-400 ml-2">Sales CRM</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-300">{currentUser.name}</span>
          <button
            className="bg-transparent border border-gray-600 text-gray-400 text-[11px] px-2.5 py-1 rounded cursor-pointer hover:text-white hover:border-gray-400"
            onClick={handleLogout}
          >
            Logout
          </button>
        </div>
      </header>

      <div className="bg-[#1A1A1A] border-t border-gray-700 px-6 flex gap-1">
        {([{ key: 'leads' as const, label: 'Leads' }, { key: 'dashboard' as const, label: 'Dashboard' }, { key: 'storeVisit' as const, label: 'Store Visit Form' }, { key: 'sales' as const, label: 'Sales' }]).map(t => (
          <button
            key={t.key}
            onClick={() => {
              if (t.key === 'sales') {
                router.push('/dashboard');
                return;
              }
              setMainTab(t.key);
            }}
            className={`px-4 py-2 text-[12px] font-semibold border-b-2 cursor-pointer bg-transparent transition-colors ${mainTab === t.key ? 'border-[#EAB308] text-white' : 'border-transparent text-gray-400 hover:text-gray-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {mainTab === 'dashboard' && (
        <Dashboard logs={dashLogs} branches={branches} />
      )}

      {mainTab === 'storeVisit' && (
        <StoreVisitWrapper />
      )}

      {mainTab === 'leads' && <div className="px-3 py-3 sm:px-6 sm:py-4">
        <div className="bg-white rounded-lg px-6 py-4 border border-gray-200">
          <div className="flex justify-between flex-wrap gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total Pipeline Value</div>
              <div className="font-mono text-[22px] font-bold text-black">{fmtINR(pipelineTotal)}</div>
              <div className="text-[11px] text-gray-400">{filtered.length} leads</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Active Pipeline</div>
              <div className="font-mono text-lg font-bold text-[#EAB308]">{fmtINR(pipelineActive)}</div>
              <div className="text-[11px] text-gray-400">{activeCount} leads</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Won</div>
              <div className="font-mono text-lg font-bold text-green-700">{fmtINR(pipelineWon)}</div>
              <div className="text-[11px] text-gray-400">{wonCount} leads</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Lost / Refunded</div>
              <div className="font-mono text-lg font-bold text-gray-400">{fmtINR(pipelineLost)}</div>
              <div className="text-[11px] text-gray-400">{lostCount} leads</div>
            </div>
          </div>
          <div className="flex h-1.5 rounded-sm overflow-hidden mt-4 bg-gray-200">
            <div className="bg-green-500 transition-[width] duration-300" style={{ width: pctWon + '%' }} />
            <div className="bg-[#EAB308] transition-[width] duration-300" style={{ width: pctActive + '%' }} />
            <div className="bg-gray-400 transition-[width] duration-300" style={{ width: pctLost + '%' }} />
          </div>
          {statusChips.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {statusChips.map((sc) => (
                <span
                  key={sc.status}
                  onClick={() => toggleStatusFilter(sc.status)}
                  className={`inline-flex items-center px-2.5 py-1 rounded-2xl bg-white text-[11px] cursor-pointer border ${statusFilter.includes(sc.status) ? 'border-[#EAB308]' : 'border-gray-200'}`}
                >
                  <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: STATUS_COLORS[sc.status] }} />
                  <span className="text-[11px]">{sc.status}</span>
                  <span className="font-mono text-[11px] font-semibold ml-1.5">{fmtINR(sc.value)}</span>
                  <span className="text-[10px] text-gray-400 ml-1">({sc.count})</span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex gap-3 mt-3 overflow-x-auto pb-1">
          {stageSummary.map((ss) => {
            const active = statusFilter.includes(ss.status);
            return (
              <div
                key={ss.status}
                onClick={() => toggleStatusFilter(ss.status)}
                className={`bg-white rounded-lg px-4 py-3 border-[1.5px] text-center min-w-[130px] cursor-pointer flex-[1_0_140px] ${active ? 'border-[#EAB308]' : 'border-gray-200'}`}
              >
                <div className={`text-2xl font-bold ${active ? 'text-[#EAB308]' : 'text-gray-700'}`}>{ss.count}</div>
                <div className="text-[9px] font-semibold uppercase tracking-wider text-gray-400 mt-0.5">{ss.status}</div>
                {ss.value > 0 && (
                  <div className="font-mono text-[11px] font-semibold mt-1" style={{ color: STATUS_COLORS[ss.status] }}>{fmtINR(ss.value)}</div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-between items-center py-3 gap-3 flex-wrap">
          <div className="flex gap-2 items-center flex-1 overflow-x-auto sm:overflow-visible pb-1 sm:flex-wrap sm:pb-0 [&::-webkit-scrollbar]:hidden">
            <input
              className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-[220px]"
              placeholder="Search leads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <MultiSelect options={STATUSES} selected={statusFilter} onChange={setStatusFilter} label="All Statuses" />
            <MultiSelect options={availableBMs} selected={personFilter.filter((p) => availableBMs.includes(p))} onChange={setPersonFilter} label="All Salespeople" />
            {userAllowedBranches.length > 0 ? (
              <span className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md bg-gray-50 text-gray-500 whitespace-nowrap">{userAllowedBranches.join(', ')}</span>
            ) : (
              <MultiSelect options={branches} selected={branchFilter} onChange={setBranchFilter} label="All Branches" />
            )}
            <DateRangePicker label="Created Date" dateFrom={createdDateFrom} dateTo={createdDateTo} onChange={(from, to) => { setCreatedDateFrom(from); setCreatedDateTo(to); }} />
            <DateRangePicker label="Follow-up Date" dateFrom={followUpDateFrom} dateTo={followUpDateTo} onChange={(from, to) => { setFollowUpDateFrom(from); setFollowUpDateTo(to); }} />
            <DateRangePicker label="Closure Date" dateFrom={closureDateFrom} dateTo={closureDateTo} onChange={(from, to) => { setClosureDateFrom(from); setClosureDateTo(to); }} />
            <span className="text-[10px] font-semibold text-gray-400 ml-1">{'₹'} &gt;</span>
            <input
              className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-[130px] font-mono"
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={cartValueGt ? Number(cartValueGt).toLocaleString('en-IN') : ''}
              onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setCartValueGt(v); }}
            />
            {cartValueGt !== '' && <button className="bg-white text-gray-700 border border-gray-200 py-1.5 px-2.5 rounded-md text-[11px] font-medium cursor-pointer" onClick={() => { setCartValueGt(''); }}>Clear</button>}
            <select
              className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans bg-white cursor-pointer"
              value={taskFilter}
              onChange={(e) => setTaskFilter(e.target.value)}
            >
              <option value="">All Tasks</option>
              <option value="followup_pending">Follow-up Date Pending</option>
              <option value="closure_pending">Closure Date Pending</option>
              <option value="overdue">Overdue Tasks</option>
            </select>
            <span className="text-xs text-gray-500">{leadsLoading ? <span className="flex items-center gap-1"><svg className="animate-spin h-3 w-3 text-[#EAB308]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Loading...</span> : `${filtered.length} lead${filtered.length !== 1 ? 's' : ''}`}</span>
          </div>
          <div className="flex gap-2 items-center">
            <div className="hidden sm:flex gap-2 items-center">
              <MultiSelect options={ALL_COLUMNS.map((c) => c.label)} selected={ALL_COLUMNS.filter((c) => isColVisible(c.key)).map((c) => c.label)} onChange={(labels) => { const keys = ALL_COLUMNS.filter((c) => labels.includes(c.label)).map((c) => c.key); setVisibleCols(keys); localStorage.setItem('materialdepot_cols', JSON.stringify(keys)); }} label="Columns" />
              <button className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-md text-[13px] font-medium cursor-pointer" onClick={downloadCsvTemplate}>Download Template</button>
              <button className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-md text-[13px] font-medium cursor-pointer" onClick={() => csvFileRef.current?.click()}>Upload CSV</button>
              <input ref={csvFileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
            </div>
            <button className="bg-[#EAB308] text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer whitespace-nowrap" onClick={() => setShowAddDrawer(true)}>+ Add Lead</button>
          </div>
        </div>

        <div className="sm:hidden flex flex-col gap-2">
          {leadsLoading && <div className="flex items-center justify-center gap-2 py-10 text-gray-400 text-sm"><svg className="animate-spin h-4 w-4 text-[#EAB308]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Loading leads...</div>}
          {!leadsLoading && paginatedRows.length === 0 && <div className="text-center text-gray-400 py-10 text-sm">No leads found</div>}
          {paginatedRows.map((l) => (
            <div key={l.id} className="bg-white rounded-lg border border-gray-200 px-4 py-3" onClick={() => setDrawerLead(l)}>
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[14px] truncate">{l.clientName || '—'}</div>
                  <div className="font-mono text-[11px] text-gray-400">{l.clientPhone || '—'}</div>
                </div>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 mt-0.5" style={{ background: (STATUS_COLORS[l.status] || '#9CA3AF') + '20', color: STATUS_COLORS[l.status] || '#9CA3AF' }}>{l.status}</span>
              </div>
              <div className="flex gap-3 mt-2 text-[11px] text-gray-500 flex-wrap">
                {l.followUpDate && <span className={isOverdue(l) ? 'text-red-500 font-semibold' : ''}>{isOverdue(l) ? '⚠ ' : ''}Follow-up: {fmtDate(l.followUpDate)}</span>}
                {!l.followUpDate && <span className="text-gray-300">No follow-up date</span>}
                {l.closureDate && <span>Closure: {fmtDate(l.closureDate)}</span>}
                {(l.cartValue || 0) > 0 && <span className="font-mono font-semibold text-gray-700">{fmtINR(l.cartValue)}</span>}
              </div>
              <div className="flex justify-between items-center mt-2">
                <div className="flex items-center gap-1.5">
                  <Avatar name={l.assignedTo} size={18} />
                  <span className="text-[11px] text-gray-500">{l.assignedTo}</span>
                </div>
                <span className="text-[11px] text-gray-400">{l.branch}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden sm:block bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
          <div className="max-h-[calc(100vh-340px)] overflow-y-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="bg-[#FAFAFA]">
                  {isColVisible('id') && <Th label="Lead ID" sortKey="id" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="max-w-[110px] w-[110px]" />}
                  {isColVisible('clientName') && <Th label="Client Name" sortKey="clientName" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                  {isColVisible('clientPhone') && <Th label="Client Phone" sortKey="clientPhone" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                  {isColVisible('createdAt') && <Th label="Created" sortKey="createdAt" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                  {isColVisible('firstVisit') && <Th label="First Visit" sortKey="firstVisit" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                  {isColVisible('latestVisit') && <Th label="Latest Visit" sortKey="latestVisit" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                  {isColVisible('assignedTo') && <Th label="Assigned To" sortKey="assignedTo" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                  {isColVisible('branch') && <Th label="Branch" sortKey="branch" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                  {isColVisible('clientType') && <Th label="Client Type" sortKey="clientType" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                  {isColVisible('propertyType') && <Th label="Property Type" sortKey="propertyType" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                  {isColVisible('architectInvolved') && <Th label="Architect/Designer" sortKey="architectInvolved" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                  {isColVisible('projectPhase') && <Th label="Project Phase" sortKey="projectPhase" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                  {isColVisible('status') && <Th label="Status" sortKey="status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                  {isColVisible('cartItems') && <Th label="Cart Items" sortKey={null} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                  {isColVisible('followUpDate') && <Th label="Follow-up" sortKey="followUpDate" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                  {isColVisible('closureDate') && <Th label="Closure Date" sortKey="closureDate" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />}
                  {isColVisible('visitCount') && <Th label="Visits" sortKey="visitCount" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-center" />}
                  {isColVisible('cartValue') && <Th label="Cart Value" sortKey="cartValue" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-right" />}
                  <Th label="Actions" sortKey={null} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-center" />
                </tr>
              </thead>
              <tbody>
                {paginatedRows.map((l) => (
                  <tr
                    key={l.id}
                    className="border-t border-gray-200 hover:bg-[#FFFAF7]"
                  >
                    {isColVisible('id') && <td className="px-3 py-2.5 text-[13px] align-middle max-w-[110px]">
                      <span className="font-mono text-[11px] font-semibold bg-gray-100 px-2 py-0.5 rounded whitespace-nowrap">{l.id}</span>
                    </td>}
                    {isColVisible('clientName') && <td className="px-3 py-2.5 text-[13px] align-middle text-xs">{l.clientName || '—'}</td>}
                    {isColVisible('clientPhone') && <td className="px-3 py-2.5 text-[13px] align-middle text-xs font-mono">{l.clientPhone || '—'}</td>}
                    {isColVisible('createdAt') && <td className="px-3 py-2.5 text-[13px] align-middle text-gray-500 text-xs">{fmtDate(l.createdAt)}</td>}
                    {isColVisible('firstVisit') && <td className="px-3 py-2.5 text-[13px] align-middle text-gray-500 text-xs">{fmtDate(((l.visits || []).length > 0 ? [...(l.visits || [])].sort((a, b) => a.date.localeCompare(b.date))[0].date : l.createdAt))}</td>}
                    {isColVisible('latestVisit') && <td className="px-3 py-2.5 text-[13px] align-middle text-gray-500 text-xs">{fmtDate(((l.visits || []).length > 0 ? [...(l.visits || [])].sort((a, b) => b.date.localeCompare(a.date))[0].date : l.createdAt))}</td>}
                    {isColVisible('assignedTo') && <td className="px-3 py-2.5 text-[13px] align-middle">
                      <div className="flex items-center gap-1.5">
                        <Avatar name={l.assignedTo} />
                        <span className="text-xs">{l.assignedTo}</span>
                      </div>
                    </td>}
                    {isColVisible('branch') && <td className="px-3 py-2.5 text-[13px] align-middle text-xs">{l.branch || '—'}</td>}
                    {isColVisible('clientType') && <td className="px-3 py-2.5 text-[13px] align-middle text-xs">{l.clientType || '—'}</td>}
                    {isColVisible('propertyType') && <td className="px-3 py-2.5 text-[13px] align-middle text-xs">{l.propertyType || '—'}</td>}
                    {isColVisible('architectInvolved') && <td className="px-3 py-2.5 text-[13px] align-middle text-xs">
                      {l.architectInvolved == null ? '—' : l.architectInvolved ? <span className="text-green-600 font-semibold">Yes</span> : <span className="text-gray-400">No</span>}
                    </td>}
                    {isColVisible('projectPhase') && <td className="px-3 py-2.5 text-[13px] align-middle text-xs">{l.projectPhase || '—'}</td>}
                    {isColVisible('status') && <td className="px-3 py-2.5 text-[13px] align-middle">
                      <EditableStatus status={l.status} lostReason={l.lostReason} onCommit={(s, reason) => updateStatus(l.id, s, reason)} />
                    </td>}
                    {isColVisible('cartItems') && <td className="px-3 py-2.5 text-[13px] align-middle text-xs max-w-[200px]">
                      <span className="whitespace-nowrap overflow-hidden text-ellipsis block">
                        {typeof l.cartItems === 'string' ? (l.cartItems || '—') : Array.isArray(l.cartItems) ? (l.cartItems.map(i => typeof i === 'string' ? i : i.name).join(', ') || '—') : '—'}
                      </span>
                    </td>}
                    {isColVisible('followUpDate') && <td className="px-3 py-2.5 text-[13px] align-middle cursor-pointer" onClick={() => setDateEditPopup({ leadId: l.id, field: 'followUpDate' })}>
                      {l.followUpDate ? (
                        <span className={`text-xs border-b border-dashed border-gray-300 ${isOverdue(l) ? 'font-bold text-red-500' : 'font-normal text-gray-700'}`}>
                          {isOverdue(l) && '⚠ '}{fmtDate(l.followUpDate)}
                        </span>
                      ) : <span className="text-gray-400 text-[11px] border-b border-dashed border-gray-300">+ Set date</span>}
                    </td>}
                    {isColVisible('closureDate') && <td className="px-3 py-2.5 text-[13px] align-middle cursor-pointer" onClick={() => setDateEditPopup({ leadId: l.id, field: 'closureDate' })}>
                      {l.closureDate ? (
                        <span className="text-xs text-gray-500 border-b border-dashed border-gray-300">{fmtDate(l.closureDate)}</span>
                      ) : <span className="text-gray-400 text-[11px] border-b border-dashed border-gray-300">+ Set date</span>}
                    </td>}
                    {isColVisible('visitCount') && <td className="px-3 py-2.5 text-[13px] align-middle text-center">
                      {(l.visits || []).length > 0 ? (
                        <span className="inline-flex items-center justify-center bg-[#3B82F618] text-blue-500 font-bold text-[11px] rounded-full w-[22px] h-[22px] border border-[#3B82F640]">{(l.visits || []).length}</span>
                      ) : (
                        <span className="text-gray-400 text-[11px]">0</span>
                      )}
                    </td>}
                    {isColVisible('cartValue') && <td className="px-3 py-2.5 text-[13px] align-middle text-right font-mono font-bold">
                      {fmtINR(l.cartValue)}
                    </td>}
                    <td className="px-3 py-2.5 text-[13px] align-middle text-center whitespace-nowrap">
                      <button className="bg-transparent border-none cursor-pointer py-1 px-1.5 text-[13px] text-gray-700 relative" title="Edit" onClick={() => setDrawerLead(l)}>
                        Edit
                        {(l.remarks || []).length > 0 && <span className="absolute -top-0.5 -right-1 bg-[#EAB308] text-white text-[9px] font-bold rounded-full w-4 h-4 inline-flex items-center justify-center">{l.remarks!.length}</span>}
                      </button>
                    </td>
                  </tr>
                ))}
                {leadsLoading && (
                  <tr><td colSpan={COL_COUNT} className="p-10 text-center text-gray-400">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4 text-[#EAB308]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                      Loading leads...
                    </div>
                  </td></tr>
                )}
                {!leadsLoading && paginatedRows.length === 0 && (
                  <tr><td colSpan={COL_COUNT} className="p-10 text-center text-gray-400">No leads found</td></tr>
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-[#FFF7F0]">
                    <td colSpan={COL_COUNT - 2} className="px-3 py-2.5 text-[13px] align-middle font-semibold text-xs">Total ({filtered.length} lead{filtered.length !== 1 ? 's' : ''})</td>
                    <td className="px-3 py-2.5 text-[13px] align-middle text-right font-mono font-bold text-[#EAB308]">{fmtINR(filteredTotal)}</td>
                    <td className="px-3 py-2.5 text-[13px] align-middle" />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-3 px-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Rows per page:</span>
              <select className="px-2 py-1 text-xs border border-gray-200 rounded outline-none" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={75}>75</option>
                <option value={100}>100</option>
              </select>
              <span className="text-xs text-gray-400 ml-2">
                {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, leadsTotal || sorted.length)} of {leadsTotal || sorted.length}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button className="px-2.5 py-1 text-xs border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default hover:bg-gray-50" disabled={safePage === 0} onClick={() => setPage(0)}>First</button>
              <button className="px-2.5 py-1 text-xs border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default hover:bg-gray-50" disabled={safePage === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
              <span className="text-xs text-gray-600 px-2">Page {safePage + 1} of {totalPages}</span>
              <button className="px-2.5 py-1 text-xs border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default hover:bg-gray-50" disabled={safePage >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
              <button className="px-2.5 py-1 text-xs border border-gray-200 rounded bg-white cursor-pointer disabled:opacity-40 disabled:cursor-default hover:bg-gray-50" disabled={safePage >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>Last</button>
            </div>
          </div>
        )}
      </div>}

      {(showAddDrawer || drawerLead) && (
        <LeadDrawer
          lead={drawerLead ? (leads.find((l) => l.id === drawerLead.id) || drawerLead) : null}
          currentUser={currentUser}
          branches={branches}
          users={availableBMs.map(name => ({ id: name, name }))}
          onSave={saveLead}
          onClose={() => { setDrawerLead(null); setShowAddDrawer(false); }}
          onAddRemark={drawerLead ? (remark: Remark) => addRemark(drawerLead.id, drawerLead.clientPhone || '', remark) : undefined}
          onImmediateSave={(updatedLead: Lead) => {
            setLeads((prev) => prev.map((l) => (l.id === updatedLead.id && l.clientPhone === updatedLead.clientPhone) ? updatedLead : l));
            fetchLead(updatedLead.id, updatedLead.clientPhone || '').then((dbLead: Lead) => {
              const mergedRemarks = [...(dbLead.remarks || [])];
              (updatedLead.remarks || []).forEach((r) => {
                if (!mergedRemarks.some((mr) => mr.ts === r.ts && mr.text === r.text)) mergedRemarks.push(r);
              });
              const merged: Lead = { ...updatedLead, remarks: mergedRemarks };
              upsertLead(merged).catch((e) => { console.error('Drawer date save failed:', e); showSaveError(); });
              setLeads((p) => p.map((l) => (l.id === merged.id && l.clientPhone === merged.clientPhone) ? merged : l));
            }).catch(() => {
              upsertLead(updatedLead).catch((e) => { console.error('Drawer date save failed:', e); showSaveError(); });
            });
          }}
        />
      )}

      {dateEditPopup && (() => {
        const lead = leads.find((l) => l.id === dateEditPopup.leadId);
        if (!lead) return null;
        return (
          <DateEditPopup
            field={dateEditPopup.field}
            currentDate={lead[dateEditPopup.field]}
            followUpDate={lead.followUpDate}
            closureDate={lead.closureDate}
            assignedTo={lead.assignedTo}
            onSave={handleDateEditSave}
            onCancel={() => setDateEditPopup(null)}
          />
        );
      })()}

      {csvErrors && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[1000]">
          <div className="bg-white rounded-lg overflow-hidden w-[90%] shadow-[0_20px_60px_rgba(0,0,0,0.15)] max-w-[540px]">
            <div className="bg-[#1A1A1A] text-white px-5 py-3 flex justify-between items-center">
              <span className="font-semibold text-sm">CSV Validation Errors</span>
              <button className="bg-transparent border-none text-gray-400 text-xl cursor-pointer leading-none" onClick={() => setCsvErrors(null)}>&times;</button>
            </div>
            <div className="p-5 max-h-[400px] overflow-y-auto">
              <p className="text-[13px] mb-3 text-red-500 font-semibold">
                {csvErrors.length} error{csvErrors.length !== 1 ? 's' : ''} found. No leads were imported.
              </p>
              <ul className="m-0 pl-5 text-xs leading-[1.8] text-gray-700">
                {csvErrors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 text-right">
              <button className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-md text-[13px] font-medium cursor-pointer" onClick={() => setCsvErrors(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {csvPreview && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[1000]">
          <div className="bg-white rounded-lg overflow-hidden w-[90%] shadow-[0_20px_60px_rgba(0,0,0,0.15)] max-w-[1100px]">
            <div className="bg-[#1A1A1A] text-white px-5 py-3 flex justify-between items-center">
              <span className="font-semibold text-sm">Review CSV Import</span>
              <button className="bg-transparent border-none text-gray-400 text-xl cursor-pointer leading-none" onClick={() => { setCsvPreview(null); setCsvSelected(new Set()); }}>&times;</button>
            </div>
            <div className="px-5 py-4">
              <p className="text-[13px] mb-3 text-gray-700">
                <strong>{csvPreview.length}</strong> lead{csvPreview.length !== 1 ? 's' : ''} ready to import
              </p>
              <div className="max-h-[350px] overflow-y-auto border border-gray-200 rounded-md">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#FAFAFA] sticky top-0">
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none w-8">
                        <input type="checkbox" checked={csvSelected.size === csvPreview.length} onChange={(e) => {
                          if (e.target.checked) setCsvSelected(new Set(csvPreview.map((_, i) => i)));
                          else setCsvSelected(new Set());
                        }} />
                      </th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Row#</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Lead ID</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Client Name</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Phone</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Created</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Assigned To</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Branch</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Status</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Cart Items</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-right whitespace-nowrap select-none">Cart Value</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-center whitespace-nowrap select-none">Remarks</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-center whitespace-nowrap select-none">Visits</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Client Type</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none">Property Type</th>
                      <th className="px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-center whitespace-nowrap select-none">Architect</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvPreview.map((row, i) => (
                      <tr key={i} className={`border-t border-gray-100 ${csvSelected.has(i) ? 'bg-white' : 'bg-gray-50'}`}>
                        <td className="px-3 py-2.5 text-[13px] align-middle w-8">
                          <input type="checkbox" checked={csvSelected.has(i)} onChange={() => {
                            setCsvSelected((prev) => {
                              const next = new Set(prev);
                              if (next.has(i)) next.delete(i); else next.add(i);
                              return next;
                            });
                          }} />
                        </td>
                        <td className="px-3 py-2.5 text-[13px] align-middle">{i + 2}</td>
                        <td className="px-3 py-2.5 text-[13px] align-middle"><span className="font-mono text-[11px] font-semibold bg-gray-100 px-2 py-0.5 rounded">{row.leadId}</span></td>
                        <td className="px-3 py-2.5 text-[13px] align-middle">{row.clientName || '—'}</td>
                        <td className="px-3 py-2.5 text-[13px] align-middle font-mono text-[11px]">{row.clientPhone}</td>
                        <td className="px-3 py-2.5 text-[13px] align-middle text-[11px] text-gray-500">{fmtDate(row.createdAt)}</td>
                        <td className="px-3 py-2.5 text-[13px] align-middle">{row.assignedTo}</td>
                        <td className="px-3 py-2.5 text-[13px] align-middle">{row.branch}</td>
                        <td className="px-3 py-2.5 text-[13px] align-middle"><StatusBadge status={row.status} /></td>
                        <td className="px-3 py-2.5 text-[13px] align-middle text-[11px] max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">
                          {(typeof row.cartItems === 'string' ? row.cartItems : Array.isArray(row.cartItems) ? (row.cartItems as string[]).join(', ') : '') || '—'}
                        </td>
                        <td className="px-3 py-2.5 text-[13px] align-middle text-right font-mono text-[11px]">{fmtINR(row.cartValue)}</td>
                        <td className="px-3 py-2.5 text-[13px] align-middle text-center text-[11px]">{row.remarks.length || '—'}</td>
                        <td className="px-3 py-2.5 text-[13px] align-middle text-center text-[11px]">{row.visits.length || '—'}</td>
                        <td className="px-3 py-2.5 text-[13px] align-middle text-[11px]">{row.clientType || '—'}</td>
                        <td className="px-3 py-2.5 text-[13px] align-middle text-[11px]">{row.propertyType || '—'}</td>
                        <td className="px-3 py-2.5 text-[13px] align-middle text-center text-[11px]">{row.architectInvolved ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-md text-[13px] font-medium cursor-pointer" onClick={() => { setCsvPreview(null); setCsvSelected(new Set()); }}>Cancel</button>
              <button className={`bg-[#EAB308] text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer ${csvSelected.size === 0 ? 'opacity-50' : 'opacity-100'}`} disabled={csvSelected.size === 0} onClick={importCsvLeads}>
                Import Selected ({csvSelected.size})
              </button>
            </div>
          </div>
        </div>
      )}

      {csvImportCount != null && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1A1A1A] text-white px-6 py-2.5 rounded-lg text-[13px] font-semibold z-[1100] shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
          Successfully imported {csvImportCount} lead{csvImportCount !== 1 ? 's' : ''}
        </div>
      )}
      {saveErrorMsg && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-600 text-white px-5 py-3 rounded-lg text-[13px] font-semibold z-[1100] shadow-[0_4px_12px_rgba(0,0,0,0.2)] flex items-center gap-4">
          <span>⚠ {saveErrorMsg}</span>
          <button
            onClick={handleLogout}
            className="bg-white text-red-600 px-3 py-1 rounded text-[12px] font-bold cursor-pointer border-none shrink-0"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
