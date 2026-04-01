'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/style.css';
import { fetchLeads, upsertLead, upsertLeads, deleteLead as deleteLeadDb } from '../lib/supabase';

// ── Constants ───────────────────────────────────────────────────────────────
const SALES_PEOPLE = ['Arjun Mehta', 'Priya Sharma', 'Rahul Verma', 'Sneha Iyer', 'Karan Patel'];
const BRANCHES = ['JP Nagar', 'Whitefield', 'Yelankha', 'HQ'];

const STATUSES = [
  'Quote Approval Pending',
  'Request for Availability Check',
  'Order Placed',
  'Delivered',
  'Refunded',
  'Order Lost',
];

const STATUS_COLORS = {
  'Quote Approval Pending': '#F59E0B',
  'Request for Availability Check': '#3B82F6',
  'Order Placed': '#F97316',
  'Delivered': '#22C55E',
  'Refunded': '#EF4444',
  'Order Lost': '#9CA3AF',
};

const ORDER_LOST_REASONS = [
  'Pricing Issue',
  'Credit Issue',
  'Order Closed Already',
  'Cash/Non GST Issue',
  'Delayed Estimate',
  'Sample/Material Not Approved',
  'Enquiry Invalid',
  'Enquiry Cancelled',
];

const PIPELINE_BUCKETS = {
  Active: ['Quote Approval Pending', 'Request for Availability Check', 'Order Placed'],
  Won: ['Delivered'],
  Lost: ['Refunded', 'Order Lost'],
};

const VISIT_CHANNELS = ['Website', 'JP Nagar Centre', 'Whitefield Centre', 'Yelankha Centre', 'HQ Showroom', 'Phone Call'];


// ── Helpers ─────────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10);

const genId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let r = '';
  for (let i = 0; i < 6; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return `MD-${r}`;
};

const fmtINR = (n) => {
  if (n == null || isNaN(n)) return '\u20B90';
  return '\u20B9' + Number(n).toLocaleString('en-IN');
};

const fmtDate = (d) => {
  if (!d) return '\u2014';
  const dt = new Date(d + 'T00:00:00');
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const fmtTimestamp = (ts) => {
  const dt = new Date(ts);
  return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' \u00B7 ' +
    dt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
};

// ── Client names pool ───────────────────────────────────────────────────────
const CLIENT_NAMES = [
  'Vikram Rao', 'Anita Deshmukh', 'Suresh Kulkarni', 'Meena Nair', 'Rajesh Gupta',
  'Deepa Joshi', 'Amit Tiwari', 'Kavita Reddy', 'Sanjay Bhat', 'Pooja Shetty',
  'Manoj Kumar', 'Lakshmi Pillai', 'Nitin Agarwal', 'Swathi Menon', 'Harish Gowda',
  'Divya Krishnan', 'Ramesh Patil', 'Sunita Hegde', 'Arun Prasad', 'Neha Saxena',
  'Prakash Iyengar', 'Rekha Devi', 'Venkatesh Murthy', 'Anjali Kapoor', 'Girish Naik',
  'Padma Rangan', 'Kiran Srinivas', 'Usha Malhotra', 'Dinesh Chandra', 'Fatima Begum',
];

const CLIENT_PHONES = [
  '9876543210', '9845012345', '9901234567', '9823456789', '9734561234',
  '9612345678', '9556789012', '9445678901', '9367890123', '9278901234',
  '9189012345', '9090123456', '8901234567', '8812345678', '8723456789',
  '8634567890', '8545678901', '8456789012', '8367890123', '8278901234',
  '8189012345', '8090123456', '7901234567', '7812345678', '7723456789',
  '7634567890', '7545678901', '7456789012', '7367890123', '7278901234',
];

// ── Components// ── Components ──────────────────────────────────────────────────────────────

function Avatar({ name, size = 24 }) {
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  return (
    <div className="bg-[#EAB308] text-white rounded-full inline-flex items-center justify-center font-semibold shrink-0" style={{ width: size, height: size, fontSize: size * 0.45, lineHeight: size + 'px' }}>
      {initial}
    </div>
  );
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || '#9CA3AF';
  return (
    <span className="inline-block px-2 py-0.5 rounded-xl text-[11px] font-semibold border whitespace-nowrap" style={{ background: color + '18', color, borderColor: color + '40' }}>
      {status}
    </span>
  );
}

function EditableStatus({ status, lostReason, onCommit }) {
  const [editing, setEditing] = useState(false);
  const [pendingLost, setPendingLost] = useState(false);

  if (pendingLost) {
    return (
      <select
        autoFocus
        value=""
        onChange={(e) => { onCommit('Order Lost', e.target.value); setPendingLost(false); setEditing(false); }}
        onBlur={() => { setPendingLost(false); setEditing(false); }}
        className="py-1 px-2 text-xs border border-red-500 rounded-md outline-none"
      >
        <option value="" disabled>Select reason...</option>
        {ORDER_LOST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
      </select>
    );
  }

  if (editing) {
    return (
      <select
        autoFocus
        value={status}
        onChange={(e) => {
          if (e.target.value === 'Order Lost') { setPendingLost(true); }
          else { onCommit(e.target.value); setEditing(false); }
        }}
        onBlur={() => setEditing(false)}
        className="py-1 px-2 text-xs border border-gray-200 rounded-md outline-none"
      >
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    );
  }
  return (
    <span onDoubleClick={() => setEditing(true)}>
      <StatusBadge status={status} />
      {status === 'Order Lost' && lostReason && <div className="text-[10px] text-gray-400 mt-0.5">{lostReason}</div>}
    </span>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Th({ label, sortKey, sortCol, sortDir, onSort, className: extraClass }) {
  const active = sortCol === sortKey;
  return (
    <th
      className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left whitespace-nowrap select-none ${sortKey ? 'cursor-pointer' : 'cursor-default'} ${extraClass || ''}`}
      onClick={() => sortKey && onSort(sortKey)}
    >
      {label}
      {sortKey && (
        <span className={`ml-1 ${active ? 'opacity-100' : 'opacity-30'}`}>
          {active ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : '\u21D5'}
        </span>
      )}
    </th>
  );
}

// ── Multi-Select Dropdown ───────────────────────────────────────────────────
function MultiSelect({ options, selected, onChange, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (val) => {
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
        <span className="text-[10px] text-gray-400">{open ? '\u25B2' : '\u25BC'}</span>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-[100] bg-white border border-gray-200 rounded-md shadow-[0_4px_12px_rgba(0,0,0,0.1)] max-h-[260px] overflow-y-auto min-w-full mt-0.5">
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

function DateRangePicker({ dateFrom, dateTo, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const hasRange = dateFrom || dateTo;
  const display = !hasRange
    ? 'Date Range'
    : dateFrom && dateTo
      ? `${fmtDate(dateFrom)} \u2013 ${fmtDate(dateTo)}`
      : dateFrom
        ? `From ${fmtDate(dateFrom)}`
        : `Until ${fmtDate(dateTo)}`;

  const toDateObj = (s) => {
    if (!s) return undefined;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const toStr = (d) => {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const selected = (dateFrom || dateTo) ? { from: toDateObj(dateFrom), to: toDateObj(dateTo) } : undefined;

  const handleSelect = (range) => {
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
        <span className="text-[10px] text-gray-400">{open ? '\u25B2' : '\u25BC'}</span>
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

// ── Cart Items Editor ───────────────────────────────────────────────────────
function CartItemsEditor({ items, onChange }) {
  const update = (idx, field, value) => {
    const next = items.map((it, i) => i === idx ? { ...it, [field]: field === 'name' ? value : Number(value) || 0 } : it);
    onChange(next);
  };
  const remove = (idx) => onChange(items.filter((_, i) => i !== idx));
  const add = () => onChange([...items, { name: '', qty: 1, price: 0 }]);
  const total = items.reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);

  return (
    <div>
      <div className="flex gap-2 mb-1">
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1 flex-[3]">ITEM NAME</span>
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1 flex-1 text-center">QTY</span>
        <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1 flex-[1.5] text-right">RATE (\u20B9)</span>
        <span className="w-7" />
      </div>
      {items.map((it, i) => (
        <div key={i} className="flex gap-2 mb-1.5 items-center">
          <input className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans flex-[3]" value={it.name} placeholder="Item name" onChange={(e) => update(i, 'name', e.target.value)} />
          <input className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans flex-1 text-center" type="number" min="1" value={it.qty} onChange={(e) => update(i, 'qty', e.target.value)} />
          <input className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans flex-[1.5] text-right" type="number" min="0" value={it.price} onChange={(e) => update(i, 'price', e.target.value)} />
          <button className="bg-transparent border-none text-red-500 text-lg cursor-pointer w-7 leading-none" onClick={() => remove(i)} title="Remove">&times;</button>
        </div>
      ))}
      <div className="flex justify-between items-center mt-2">
        <span className="text-[#EAB308] text-xs font-semibold cursor-pointer" onClick={add}>+ Add Item</span>
        <span className="font-mono font-semibold text-[13px]">Subtotal: {fmtINR(total)}</span>
      </div>
    </div>
  );
}

// ── Follow-up Remark Prompt ─────────────────────────────────────────────────
function FollowUpRemarkPrompt({ oldDate, newDate, onConfirm, onCancel }) {
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
            {' \u2192 '}
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

// ── Lead Drawer (Edit + Remarks + Visit History in single view) ─────────────
function LeadDrawer({ lead, onSave, onClose, onAddRemark }) {
  const isEdit = !!lead;
  const [form, setForm] = useState(() => lead ? { ...lead, branch: lead.branch || BRANCHES[0], lostReason: lead.lostReason || '', cartItems: lead.cartItems ? lead.cartItems.map(i => ({ ...i })) : [], visits: lead.visits ? lead.visits.map(v => ({ ...v, cartSnapshot: v.cartSnapshot ? v.cartSnapshot.map(c => ({ ...c })) : [] })) : [] } : {
    id: genId(), createdAt: todayStr(), assignedTo: SALES_PEOPLE[0], branch: BRANCHES[0], status: STATUSES[0],
    cartValue: 0, cartItems: [], followUpDate: '', closureDate: '', lostReason: '', remarks: [],
    clientName: '', clientPhone: '', visits: [],
  });
  const origFollowUpDate = useRef(lead ? lead.followUpDate : '');
  const [remarkAuthor, setRemarkAuthor] = useState(lead ? lead.assignedTo : SALES_PEOPLE[0]);
  const [closureDateWarning, setClosureDateWarning] = useState('');
  const [drawerDatePopup, setDrawerDatePopup] = useState(null); // 'followUpDate' | 'closureDate' | null
  const [remarkText, setRemarkText] = useState('');
  const [visitChannel, setVisitChannel] = useState(VISIT_CHANNELS[0]);
  const timelineRef = useRef(null);

  useEffect(() => {
    const total = form.cartItems.reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);
    if (total > 0) setForm((f) => ({ ...f, cartValue: total }));
  }, [form.cartItems]);

  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
  }, [form.remarks]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleDrawerDateSave = (newDate, remarkText) => {
    const field = drawerDatePopup;
    setDrawerDatePopup(null);
    if (field === 'followUpDate') {
      if (isEdit && origFollowUpDate.current && newDate !== origFollowUpDate.current) {
        // Auto-add remark for follow-up change
        const remarkObj = remarkText
          ? { ts: new Date().toISOString(), author: form.assignedTo, text: 'Follow-up date changed from ' + fmtDate(origFollowUpDate.current) + ' to ' + fmtDate(newDate) + ': ' + remarkText }
          : null;
        setForm((f) => {
          const updated = { ...f, followUpDate: newDate };
          if (newDate && f.closureDate && newDate > f.closureDate) updated.closureDate = newDate;
          if (remarkObj) updated.remarks = [...(f.remarks || []), remarkObj];
          return updated;
        });
        origFollowUpDate.current = newDate;
      } else {
        setForm((f) => {
          const updated = { ...f, followUpDate: newDate };
          if (newDate && f.closureDate && newDate > f.closureDate) updated.closureDate = newDate;
          return updated;
        });
      }
    } else {
      if (remarkText) {
        const remarkObj = { ts: new Date().toISOString(), author: form.assignedTo, text: 'Closure date changed' + (form.closureDate ? ' from ' + fmtDate(form.closureDate) : '') + ' to ' + fmtDate(newDate) + ': ' + remarkText };
        setForm((f) => ({ ...f, closureDate: newDate, remarks: [...(f.remarks || []), remarkObj] }));
      } else {
        set('closureDate', newDate);
      }
    }
  };

  const handleSave = () => {
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
    const remark = { ts: new Date().toISOString(), author: remarkAuthor, text: remarkText.trim() };
    setForm((f) => ({ ...f, remarks: [...(f.remarks || []), remark] }));
    if (isEdit && onAddRemark) onAddRemark(remark);
    setRemarkText('');
  };

  const handleRemarkKeyDown = (e) => {
    if (e.ctrlKey && e.key === 'Enter') submitRemark();
  };

  const logVisit = () => {
    const visit = {
      date: todayStr(),
      channel: visitChannel,
      cartSnapshot: form.cartItems.map((it) => ({ name: it.name, qty: it.qty, price: it.price })),
    };
    setForm((f) => ({ ...f, visits: [...(f.visits || []), visit] }));
  };

  const remarks = form.remarks || [];
  const visits = form.visits || [];

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[900]" onClick={onClose} />
      <div className="fixed top-0 right-0 w-[480px] h-screen bg-white z-[901] flex flex-col shadow-[-4px_0_20px_rgba(0,0,0,0.1)] animate-[slideInRight_0.25s_ease-out]">
        {/* Header */}
        <div className="bg-[#1A1A1A] px-4 py-3 flex justify-between items-center">
          <div>
            <span className="font-semibold text-sm text-white">{isEdit ? 'Edit Lead' : 'Add New Lead'}</span>
            {isEdit && <span className="font-mono text-[11px] text-gray-400 ml-2">{form.id}</span>}
          </div>
          <button className="bg-transparent border-none text-gray-400 text-xl cursor-pointer leading-none" onClick={onClose}>&times;</button>
        </div>

        {/* Scrollable content: Details + Remarks + Visits together */}
        <div className="flex-1 overflow-y-auto">
          {/* Details Section */}
          <div className="p-5">
            <div className="text-xs font-bold uppercase tracking-wider text-gray-700 mb-3 pb-2 border-b border-gray-100">Details</div>
            <div className="grid grid-cols-2 gap-x-3">
              <Field label="LEAD ID">
                <input className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full font-mono bg-gray-100" value={form.id} readOnly />
              </Field>
              <Field label="CREATION DATE">
                <input className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" type="date" value={form.createdAt} onKeyDown={(e) => e.preventDefault()} onChange={(e) => set('createdAt', e.target.value)} />
              </Field>
              <Field label="CLIENT NAME">
                <input className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={form.clientName || ''} placeholder="Client name" onChange={(e) => set('clientName', e.target.value)} />
              </Field>
              <Field label="CLIENT PHONE">
                <input className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={form.clientPhone || ''} placeholder="10-digit phone" onChange={(e) => set('clientPhone', e.target.value)} />
              </Field>
              <Field label="ASSIGNED TO">
                <select className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={form.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
                  {SALES_PEOPLE.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="BRANCH">
                <select className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={form.branch} onChange={(e) => set('branch', e.target.value)}>
                  {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              </Field>
              <Field label="STATUS">
                <select className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={form.status} onChange={(e) => { set('status', e.target.value); if (e.target.value !== 'Order Lost') set('lostReason', ''); }}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
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
                  {form.followUpDate && <span className="text-[11px] text-gray-400 cursor-pointer" onClick={(e) => { e.stopPropagation(); set('followUpDate', ''); }}>{'\u2715'}</span>}
                </div>
              </Field>
              <Field label="CLOSURE EXPECTED">
                <div
                  className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full cursor-pointer flex items-center justify-between bg-white"
                  onClick={() => setDrawerDatePopup('closureDate')}
                >
                  <span className={`text-[13px] ${form.closureDate ? 'text-gray-700' : 'text-gray-400'}`}>{form.closureDate ? fmtDate(form.closureDate) : 'Click to set date'}</span>
                  {form.closureDate && <span className="text-[11px] text-gray-400 cursor-pointer" onClick={(e) => { e.stopPropagation(); set('closureDate', ''); }}>{'\u2715'}</span>}
                </div>
              </Field>
              <Field label="CART VALUE">
                <input className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full font-mono" type="number" min="0" value={form.cartValue} onChange={(e) => set('cartValue', Number(e.target.value) || 0)} />
              </Field>
            </div>
            <div className="mt-2">
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">CART ITEMS</label>
              <CartItemsEditor items={form.cartItems} onChange={(items) => set('cartItems', items)} />
            </div>
            <div className="flex gap-2 mt-4">
              <button className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-md text-[13px] font-medium cursor-pointer" onClick={onClose}>Cancel</button>
              <button className="bg-[#EAB308] text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer flex-1" onClick={handleSave}>{isEdit ? 'Save Changes' : 'Add Lead'}</button>
            </div>
          </div>

          {/* Remarks Section */}
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
                <select className="px-2.5 py-2 text-xs border border-gray-200 rounded-md outline-none font-sans w-full mb-2" value={remarkAuthor} onChange={(e) => setRemarkAuthor(e.target.value)}>
                  {SALES_PEOPLE.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
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

          {/* Visit History Section */}
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
                    {v.cartSnapshot && v.cartSnapshot.length > 0 ? (
                      <div className="text-[11px] text-gray-500">
                        {v.cartSnapshot.map((c, ci) => (
                          <div key={ci}>{c.name} x{c.qty} @ {fmtINR(c.price)}</div>
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
          currentDate={form[drawerDatePopup]}
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

// ── Date Edit Popup (Follow-up / Closure) ──────────────────────────────────
function DateEditPopup({ field, currentDate, followUpDate, closureDate, assignedTo, onSave, onCancel }) {
  const label = field === 'followUpDate' ? 'Follow-up Date' : 'Closure Date';
  const [newDate, setNewDate] = useState(currentDate || '');
  const [remark, setRemark] = useState('');
  const [warning, setWarning] = useState('');
  const [autoUpdateNote, setAutoUpdateNote] = useState('');

  const validate = (date) => {
    setAutoUpdateNote('');
    if (field === 'closureDate' && followUpDate && date && date < followUpDate) {
      return 'Closure date cannot be earlier than follow-up date (' + fmtDate(followUpDate) + ')';
    }
    if (field === 'followUpDate' && closureDate && date && date > closureDate) {
      setAutoUpdateNote('Closure date will be automatically updated to ' + fmtDate(date));
    }
    return '';
  };

  const handleDateChange = (d) => {
    setNewDate(d);
    setWarning(validate(d));
  };

  const handleSave = () => {
    const w = validate(newDate);
    if (w) { setWarning(w); return; }
    onSave(newDate, remark.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[1000]" onClick={onCancel}>
      <div className="bg-white rounded-lg overflow-hidden w-[90%] shadow-[0_20px_60px_rgba(0,0,0,0.15)] max-w-[380px]" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#1A1A1A] text-white px-5 py-3 flex justify-between items-center">
          <span className="font-semibold text-sm">Update {label}</span>
          <button className="bg-transparent border-none text-gray-400 text-xl cursor-pointer leading-none" onClick={onCancel}>&times;</button>
        </div>
        <div className="p-5">
          {currentDate && (
            <div className="text-xs text-gray-400 mb-2.5">
              Current: <span className="font-semibold text-gray-700">{fmtDate(currentDate)}</span>
            </div>
          )}
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">NEW DATE</label>
          <input
            className={`px-2.5 py-2 text-[13px] border rounded-md outline-none font-sans w-full mb-1 ${warning ? 'border-red-500' : 'border-gray-200'}`}
            type="date"
            value={newDate}
            onKeyDown={(e) => e.preventDefault()}
            onChange={(e) => handleDateChange(e.target.value)}
            autoFocus
          />
          {warning && <div className="text-[11px] text-red-500 mb-2">{warning}</div>}
          {autoUpdateNote && <div className="text-[11px] text-[#EAB308] mb-2">{autoUpdateNote}</div>}
          <div className="mt-2">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">REMARK (OPTIONAL)</label>
            <textarea
              className="px-2.5 py-2 text-xs border border-gray-200 rounded-md outline-none font-sans w-full min-h-[60px] resize-y"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder={'Reason for changing ' + label.toLowerCase() + '...'}
            />
          </div>
          <div className="flex gap-2 mt-4">
            <button className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-md text-[13px] font-medium cursor-pointer" onClick={onCancel}>Cancel</button>
            <button className={`bg-[#EAB308] text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer flex-1 ${warning ? 'opacity-50' : 'opacity-100'}`} disabled={!!warning} onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirmation ─────────────────────────────────────────────────────
function DeleteConfirm({ leadId, onConfirm, onCancel }) {
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

// ── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [leads, setLeads] = useState([]);
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    fetchLeads().then((dbLeads) => {
      setLeads(dbLeads);
      setDbReady(true);
    }).catch(() => setDbReady(true));
  }, []);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState([]);
  const [personFilter, setPersonFilter] = useState([]);
  const [branchFilter, setBranchFilter] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [cartValueGt, setCartValueGt] = useState('');
  const [sortCol, setSortCol] = useState('latestVisit');
  const [sortDir, setSortDir] = useState('desc');
  const [drawerLead, setDrawerLead] = useState(null);
  const [showAddDrawer, setShowAddDrawer] = useState(false);
  const [deleteLead, setDeleteLead] = useState(null);
  const [dateEditPopup, setDateEditPopup] = useState(null);
  const [csvPreview, setCsvPreview] = useState(null);
  const [csvErrors, setCsvErrors] = useState(null);
  const [csvSelected, setCsvSelected] = useState(new Set());
  const [csvImportCount, setCsvImportCount] = useState(null);
  const csvFileRef = useRef(null);

  // Persist to localStorage
  // No more localStorage — data is persisted to Supabase on each operation

  // Base filtered leads (all filters except status -- so pipeline & stage cards react to filters)
  const baseFiltered = leads.filter((l) => {
    if (personFilter.length > 0 && !personFilter.includes(l.assignedTo)) return false;
    if (branchFilter.length > 0 && !branchFilter.includes(l.branch)) return false;
    const visitDates = (l.visits || []).map((v) => v.date);
    if (visitDates.length === 0) visitDates.push(l.createdAt || '');
    const earliest = visitDates.sort()[0];
    const latest = [...visitDates].sort().reverse()[0];
    if (dateFrom && latest < dateFrom) return false;
    if (dateTo && earliest > dateTo) return false;
    if (cartValueGt !== '' && (l.cartValue || 0) < Number(cartValueGt)) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchId = l.id.toLowerCase().includes(q);
      const matchPerson = l.assignedTo.toLowerCase().includes(q);
      const matchItems = (l.cartItems || []).some((it) => it.name.toLowerCase().includes(q));
      const matchClient = (l.clientName || '').toLowerCase().includes(q);
      const matchPhone = (l.clientPhone || '').includes(q);
      if (!matchId && !matchPerson && !matchItems && !matchClient && !matchPhone) return false;
    }
    return true;
  });

  // Pipeline computations (from filtered leads, excluding status filter)
  const pipelineTotal = baseFiltered.reduce((s, l) => s + (l.cartValue || 0), 0);
  const pipelineActive = baseFiltered.filter((l) => PIPELINE_BUCKETS.Active.includes(l.status)).reduce((s, l) => s + (l.cartValue || 0), 0);
  const pipelineWon = baseFiltered.filter((l) => PIPELINE_BUCKETS.Won.includes(l.status)).reduce((s, l) => s + (l.cartValue || 0), 0);
  const pipelineLost = baseFiltered.filter((l) => PIPELINE_BUCKETS.Lost.includes(l.status)).reduce((s, l) => s + (l.cartValue || 0), 0);
  const pctWon = pipelineTotal ? (pipelineWon / pipelineTotal) * 100 : 0;
  const pctActive = pipelineTotal ? (pipelineActive / pipelineTotal) * 100 : 0;
  const pctLost = pipelineTotal ? (pipelineLost / pipelineTotal) * 100 : 0;

  // Stage summary (from filtered leads)
  const stageSummary = STATUSES.map((status) => {
    const stageLeads = baseFiltered.filter((l) => l.status === status);
    return { status, count: stageLeads.length, value: stageLeads.reduce((s, l) => s + (l.cartValue || 0), 0) };
  });

  // Per-status chips for pipeline panel
  const statusChips = stageSummary.filter((s) => s.value > 0);

  // Active lead counts for pipeline metrics
  const activeCount = baseFiltered.filter((l) => PIPELINE_BUCKETS.Active.includes(l.status)).length;
  const wonCount = baseFiltered.filter((l) => PIPELINE_BUCKETS.Won.includes(l.status)).length;
  const lostCount = baseFiltered.filter((l) => PIPELINE_BUCKETS.Lost.includes(l.status)).length;

  // Filtering (full -- applies status filter on top of baseFiltered)
  const filtered = baseFiltered.filter((l) => {
    if (statusFilter.length > 0 && !statusFilter.includes(l.status)) return false;
    return true;
  });

  // Sorting
  const getFirstVisit = (l) => { const v = l.visits || []; return v.length > 0 ? [...v].sort((a, b) => a.date.localeCompare(b.date))[0].date : l.createdAt || ''; };
  const getLatestVisit = (l) => { const v = l.visits || []; return v.length > 0 ? [...v].sort((a, b) => b.date.localeCompare(a.date))[0].date : l.createdAt || ''; };

  const sorted = [...filtered].sort((a, b) => {
    let va, vb;
    if (sortCol === 'visitCount') {
      va = (a.visits || []).length;
      vb = (b.visits || []).length;
      return sortDir === 'asc' ? va - vb : vb - va;
    }
    if (sortCol === 'firstVisit') { va = getFirstVisit(a); vb = getFirstVisit(b); return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va); }
    if (sortCol === 'latestVisit') { va = getLatestVisit(a); vb = getLatestVisit(b); return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va); }
    va = a[sortCol]; vb = b[sortCol];
    if (sortCol === 'cartValue') { va = va || 0; vb = vb || 0; return sortDir === 'asc' ? va - vb : vb - va; }
    if (va == null) va = ''; if (vb == null) vb = '';
    if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb || '').toLowerCase(); }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (col) => {
    if (sortCol === col) setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const filteredTotal = filtered.reduce((s, l) => s + (l.cartValue || 0), 0);

  // Lead CRUD — optimistic state update + async Supabase persist
  const saveLead = (formData) => {
    setLeads((prev) => {
      const idx = prev.findIndex((l) => l.id === formData.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = formData; return next; }
      return [...prev, formData];
    });
    upsertLead(formData).catch((e) => console.error('Save failed:', e));
    setDrawerLead(null);
    setShowAddDrawer(false);
  };

  const removeLead = (id) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    deleteLeadDb(id).catch((e) => console.error('Delete failed:', e));
    setDeleteLead(null);
  };

  const updateStatus = (id, newStatus, lostReason) => {
    setLeads((prev) => {
      const updated = prev.map((l) => l.id === id ? { ...l, status: newStatus, lostReason: newStatus === 'Order Lost' ? lostReason : '' } : l);
      const lead = updated.find((l) => l.id === id);
      if (lead) upsertLead(lead).catch((e) => console.error('Status update failed:', e));
      return updated;
    });
  };

  const addRemark = (leadId, remark) => {
    setLeads((prev) => {
      const updated = prev.map((l) => l.id === leadId ? { ...l, remarks: [...(l.remarks || []), remark] } : l);
      const lead = updated.find((l) => l.id === leadId);
      if (lead) upsertLead(lead).catch((e) => console.error('Remark save failed:', e));
      return updated;
    });
  };

  const handleDateEditSave = (newDate, remarkText) => {
    if (!dateEditPopup) return;
    const { leadId, field } = dateEditPopup;
    setLeads((prev) => {
      const updated = prev.map((l) => {
        if (l.id !== leadId) return l;
        const u = { ...l, [field]: newDate };
        if (field === 'followUpDate' && newDate && l.closureDate && newDate > l.closureDate) {
          u.closureDate = newDate;
        }
        if (field === 'closureDate' && l.followUpDate && newDate && newDate < l.followUpDate) {
          return l;
        }
        const remarks = [...(l.remarks || [])];
        if (remarkText) {
          const label = field === 'followUpDate' ? 'Follow-up' : 'Closure';
          const oldDate = l[field];
          const text = label + ' date changed' + (oldDate ? ' from ' + fmtDate(oldDate) : '') + ' to ' + fmtDate(newDate) + ': ' + remarkText;
          remarks.push({ ts: new Date().toISOString(), author: l.assignedTo, text });
        }
        if (field === 'followUpDate' && newDate && l.closureDate && newDate > l.closureDate) {
          remarks.push({ ts: new Date().toISOString(), author: l.assignedTo, text: 'Closure date auto-updated from ' + fmtDate(l.closureDate) + ' to ' + fmtDate(newDate) + ' (follow-up date exceeded closure date)' });
        }
        u.remarks = remarks;
        return u;
      });
      const lead = updated.find((l) => l.id === leadId);
      if (lead) upsertLead(lead).catch((e) => console.error('Date edit save failed:', e));
      return updated;
    });
    setDateEditPopup(null);
  };

  // ── CSV helpers ──────────────────────────────────────────────────────────
  const CSV_HEADERS = ['Lead ID','Client Name','Client Phone','Created Date','Assigned To','Branch','Status','Lost Reason','Cart Items','Cart Value','Follow-up Date','Closure Date','Remarks','Visits'];

  const downloadCsvTemplate = () => {
    const rows = [
      CSV_HEADERS.join(','),
      'MD-ABC123,Vikram Rao,9876543210,2026-03-15,Arjun Mehta,JP Nagar,Quote Approval Pending,,Portland Cement 50kg:100:1250;Binding Wire:50:800,165000,2026-04-10,2026-04-20,Client requested bulk quote|2026-03-15|Arjun Mehta,2026-03-15|Website|Portland Cement 50kg:100:1250;2026-03-18|JP Nagar Centre|',
      'MD-DEF456,Anita Deshmukh,9845012345,2026-03-10,Priya Sharma,Whitefield,Order Lost,Pricing Issue,TMT Steel Bars 12mm:200:1500,300000,2026-04-05,,,',
    ];
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'materialdepot_crm_template.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const parseCsvLine = (line) => {
    const fields = [];
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

  const isValidDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d + 'T00:00:00').getTime());

  const handleCsvFile = (e) => {
    const file = e.target.files?.[0];
    if (csvFileRef.current) csvFileRef.current.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      let text = ev.target.result;
      // Strip BOM
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
      if (lines.length === 0) { setCsvErrors(['File is empty.']); return; }
      // Validate header
      const headerFields = parseCsvLine(lines[0]);
      const headerMatch = CSV_HEADERS.every((h, i) => (headerFields[i] || '').trim().toLowerCase() === h.toLowerCase());
      if (!headerMatch) { setCsvErrors(['Header row does not match expected format. Expected: ' + CSV_HEADERS.join(', ')]); return; }
      if (lines.length < 2) { setCsvErrors(['File contains only headers and no data rows.']); return; }

      const errors = [];
      const parsed = [];

      for (let r = 1; r < lines.length; r++) {
        const rowNum = r + 1;
        const fields = parseCsvLine(lines[r]);
        if (fields.length < 14) { errors.push('Row ' + rowNum + ': Expected 14 columns, got ' + fields.length); continue; }

        const [leadId, clientName, clientPhone, createdDate, assignedTo, branch, status, lostReason, cartItemsStr, cartValueStr, followUpDate, closureDate, remarksStr, visitsStr] = fields;

        // Compulsory fields
        if (!leadId) errors.push('Row ' + rowNum + ': Lead ID is required');
        if (!/^\d{10}$/.test(clientPhone)) errors.push('Row ' + rowNum + ': Client Phone must be exactly 10 digits');

        // Optional field validation (only validate if provided)
        if (createdDate && !isValidDate(createdDate)) errors.push('Row ' + rowNum + ': Created Date "' + createdDate + '" must be YYYY-MM-DD format');
        if (assignedTo && !SALES_PEOPLE.includes(assignedTo)) errors.push('Row ' + rowNum + ': Assigned To "' + assignedTo + '" is not a valid salesperson');
        if (branch && !BRANCHES.includes(branch)) errors.push('Row ' + rowNum + ': Branch "' + branch + '" is not a valid branch');
        if (status && !STATUSES.includes(status)) errors.push('Row ' + rowNum + ': Status "' + status + '" is not a valid status');

        if (status === 'Order Lost') {
          if (lostReason && !ORDER_LOST_REASONS.includes(lostReason)) errors.push('Row ' + rowNum + ': Lost Reason "' + lostReason + '" is not a valid reason');
        } else if (status) {
          if (lostReason) errors.push('Row ' + rowNum + ': Lost Reason should be empty when Status is not "Order Lost"');
        }

        // Parse cart items
        let cartItems = [];
        if (cartItemsStr) {
          const parts = cartItemsStr.split(';');
          for (const part of parts) {
            if (!part.trim()) continue;
            const segs = part.split(':');
            if (segs.length !== 3) { errors.push('Row ' + rowNum + ': Cart item "' + part + '" must be in format ItemName:Qty:Price'); continue; }
            const [name, qtyStr, priceStr] = segs;
            const qty = Number(qtyStr);
            const price = Number(priceStr);
            if (!name.trim()) { errors.push('Row ' + rowNum + ': Cart item name cannot be empty'); continue; }
            if (isNaN(qty) || qty <= 0) { errors.push('Row ' + rowNum + ': Cart item qty "' + qtyStr + '" must be a positive number'); continue; }
            if (isNaN(price) || price < 0) { errors.push('Row ' + rowNum + ': Cart item price "' + priceStr + '" must be a non-negative number'); continue; }
            cartItems.push({ name: name.trim(), qty, price });
          }
        }

        let cartValue = cartValueStr ? Number(cartValueStr) : cartItems.reduce((s, i) => s + i.qty * i.price, 0);
        if (cartValueStr && isNaN(Number(cartValueStr))) errors.push('Row ' + rowNum + ': Cart Value must be a number');

        if (followUpDate && !isValidDate(followUpDate)) errors.push('Row ' + rowNum + ': Follow-up Date "' + followUpDate + '" must be YYYY-MM-DD format');
        if (closureDate && !isValidDate(closureDate)) errors.push('Row ' + rowNum + ': Closure Date "' + closureDate + '" must be YYYY-MM-DD format');

        // Parse remarks: "text|date|author;text|date|author"
        let remarks = [];
        if (remarksStr) {
          const remarkParts = remarksStr.split(';');
          for (const rp of remarkParts) {
            if (!rp.trim()) continue;
            const segs = rp.split('|');
            if (segs.length >= 3) {
              remarks.push({ text: segs[0].trim(), ts: (segs[1].trim() || todayStr()) + 'T10:00:00', author: segs[2].trim() });
            } else if (segs.length >= 1 && segs[0].trim()) {
              remarks.push({ text: segs[0].trim(), ts: todayStr() + 'T10:00:00', author: assignedTo || SALES_PEOPLE[0] });
            }
          }
        }

        // Parse visits: "date|channel|cartSnapshot;date|channel|cartSnapshot"
        let visits = [];
        if (visitsStr) {
          const visitParts = visitsStr.split(';');
          for (const vp of visitParts) {
            if (!vp.trim()) continue;
            const segs = vp.split('|');
            const vDate = (segs[0] || '').trim();
            const vChannel = (segs[1] || '').trim();
            if (vDate && !isValidDate(vDate)) { errors.push('Row ' + rowNum + ': Visit date "' + vDate + '" must be YYYY-MM-DD format'); continue; }
            if (vChannel && !VISIT_CHANNELS.includes(vChannel)) { errors.push('Row ' + rowNum + ': Visit channel "' + vChannel + '" is not valid'); continue; }
            let vCart = [];
            if (segs[2]) {
              for (const ci of segs[2].split(',')) {
                if (!ci.trim()) continue;
                const cs = ci.split(':');
                if (cs.length === 3) vCart.push({ name: cs[0].trim(), qty: Number(cs[1]) || 0, price: Number(cs[2]) || 0 });
              }
            }
            visits.push({ date: vDate || todayStr(), channel: vChannel || VISIT_CHANNELS[0], cartSnapshot: vCart });
          }
        }

        parsed.push({ leadId: leadId.trim(), clientName: clientName || '', clientPhone, createdAt: createdDate || todayStr(), assignedTo: assignedTo || SALES_PEOPLE[0], branch: branch || BRANCHES[0], status: status || STATUSES[0], lostReason: lostReason || '', cartItems, cartValue, followUpDate: followUpDate || '', closureDate: closureDate || '', remarks, visits });
      }

      if (errors.length > 0) { setCsvErrors(errors); setCsvPreview(null); }
      else {
        setCsvPreview(parsed);
        setCsvSelected(new Set(parsed.map((_, i) => i)));
        setCsvErrors(null);
      }
    };
    reader.readAsText(file);
  };

  const importCsvLeads = () => {
    const newLeads = csvPreview.filter((_, i) => csvSelected.has(i)).map((row) => ({
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
    }));
    setLeads((prev) => [...prev, ...newLeads]);
    upsertLeads(newLeads).catch((e) => console.error('CSV import failed:', e));
    setCsvImportCount(newLeads.length);
    setCsvPreview(null);
    setCsvSelected(new Set());
    setTimeout(() => setCsvImportCount(null), 3000);
  };

  const today = todayStr();

  const isOverdue = (l) => l.followUpDate && l.followUpDate < today && !['Delivered', 'Refunded', 'Order Lost'].includes(l.status);

  const toggleStatusFilter = useCallback((status) => {
    setStatusFilter((prev) => prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]);
  }, []);

  // Column count for colSpan: Lead ID, Client Name, Client Phone, First Visit, Latest Visit, Assigned To, Branch, Status, Cart Items, Follow-up, Closure Date, Visits, Cart Value, Actions = 14
  const COL_COUNT = 14;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Header */}
      <header className="sticky top-0 z-[900] h-12 bg-[#1A1A1A] flex items-center px-6 justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold text-white">material</span>
          <span className="text-sm font-bold text-[#EAB308] -ml-2.5">depot</span>
          <span className="text-xs text-gray-400 ml-2">Sales CRM</span>
        </div>
      </header>

      <div className="px-6 py-4">
        {/* Pipeline Revenue Summary */}
        <div className="bg-white rounded-lg px-6 py-4 border border-gray-200">
          <div className="flex justify-between flex-wrap gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Total Pipeline Value</div>
              <div className="font-mono text-[22px] font-bold text-black">{fmtINR(pipelineTotal)}</div>
              <div className="text-[11px] text-gray-400">{leads.length} leads</div>
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
          {/* Stacked bar */}
          <div className="flex h-1.5 rounded-sm overflow-hidden mt-4 bg-gray-200">
            <div className="bg-green-500 transition-[width] duration-300" style={{ width: pctWon + '%' }} />
            <div className="bg-[#EAB308] transition-[width] duration-300" style={{ width: pctActive + '%' }} />
            <div className="bg-gray-400 transition-[width] duration-300" style={{ width: pctLost + '%' }} />
          </div>
          {/* Per-status chips */}
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

        {/* Stage Cards */}
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

        {/* Toolbar */}
        <div className="flex justify-between items-center py-3 gap-3 flex-wrap">
          <div className="flex gap-2 items-center flex-wrap flex-1">
            <input
              className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-[220px]"
              placeholder="Search leads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <MultiSelect options={STATUSES} selected={statusFilter} onChange={setStatusFilter} label="All Statuses" />
            <MultiSelect options={SALES_PEOPLE} selected={personFilter} onChange={setPersonFilter} label="All Salespeople" />
            <MultiSelect options={BRANCHES} selected={branchFilter} onChange={setBranchFilter} label="All Branches" />
            <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} onChange={(from, to) => { setDateFrom(from); setDateTo(to); }} />
            <span className="text-[10px] font-semibold text-gray-400 ml-1">{'\u20B9'} &gt;</span>
            <input
              className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-[130px] font-mono"
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={cartValueGt ? Number(cartValueGt).toLocaleString('en-IN') : ''}
              onChange={(e) => { const v = e.target.value.replace(/[^0-9]/g, ''); setCartValueGt(v); }}
            />
            {cartValueGt !== '' && <button className="bg-white text-gray-700 border border-gray-200 py-1.5 px-2.5 rounded-md text-[11px] font-medium cursor-pointer" onClick={() => { setCartValueGt(''); }}>Clear</button>}
            <span className="text-xs text-gray-500">{filtered.length} lead{filtered.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex gap-2 items-center">
            <button className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-md text-[13px] font-medium cursor-pointer" onClick={downloadCsvTemplate}>Download Template</button>
            <button className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-md text-[13px] font-medium cursor-pointer" onClick={() => csvFileRef.current?.click()}>Upload CSV</button>
            <input ref={csvFileRef} type="file" accept=".csv" className="hidden" onChange={handleCsvFile} />
            <button className="bg-[#EAB308] text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer" onClick={() => setShowAddDrawer(true)}>+ Add Lead</button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-[#FAFAFA]">
                  <Th label="Lead ID" sortKey="id" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Client Name" sortKey="clientName" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Client Phone" sortKey="clientPhone" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="First Visit" sortKey="firstVisit" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Latest Visit" sortKey="latestVisit" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Assigned To" sortKey="assignedTo" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Branch" sortKey="branch" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Status" sortKey="status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Cart Items" sortKey={null} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Follow-up" sortKey="followUpDate" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Closure Date" sortKey="closureDate" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Visits" sortKey="visitCount" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-center" />
                  <Th label="Cart Value" sortKey="cartValue" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-right" />
                  <Th label="Actions" sortKey={null} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} className="text-center" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((l) => (
                  <tr
                    key={l.id}
                    className="border-t border-gray-200 hover:bg-[#FFFAF7]"
                  >
                    <td className="px-3 py-2.5 text-[13px] align-middle">
                      <span className="font-mono text-[11px] font-semibold bg-gray-100 px-2 py-0.5 rounded">{l.id}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] align-middle text-xs">{l.clientName || '\u2014'}</td>
                    <td className="px-3 py-2.5 text-[13px] align-middle text-xs font-mono">{l.clientPhone || '\u2014'}</td>
                    <td className="px-3 py-2.5 text-[13px] align-middle text-gray-500 text-xs">{fmtDate(((l.visits || []).length > 0 ? [...l.visits].sort((a, b) => a.date.localeCompare(b.date))[0].date : l.createdAt))}</td>
                    <td className="px-3 py-2.5 text-[13px] align-middle text-gray-500 text-xs">{fmtDate(((l.visits || []).length > 0 ? [...l.visits].sort((a, b) => b.date.localeCompare(a.date))[0].date : l.createdAt))}</td>
                    <td className="px-3 py-2.5 text-[13px] align-middle">
                      <div className="flex items-center gap-1.5">
                        <Avatar name={l.assignedTo} />
                        <span className="text-xs">{l.assignedTo}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[13px] align-middle text-xs">{l.branch || '\u2014'}</td>
                    <td className="px-3 py-2.5 text-[13px] align-middle">
                      <EditableStatus status={l.status} lostReason={l.lostReason} onCommit={(s, reason) => updateStatus(l.id, s, reason)} />
                    </td>
                    <td className="px-3 py-2.5 text-[13px] align-middle text-xs max-w-[160px]">
                      {(l.cartItems || []).slice(0, 2).map((it, i) => (
                        <div key={i} className="whitespace-nowrap overflow-hidden text-ellipsis">
                          {it.name} x{it.qty}
                        </div>
                      ))}
                      {(l.cartItems || []).length > 2 && <span className="text-gray-400 text-[11px]">+{l.cartItems.length - 2} more</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] align-middle cursor-pointer" onClick={() => setDateEditPopup({ leadId: l.id, field: 'followUpDate' })}>
                      {l.followUpDate ? (
                        <span className={`text-xs border-b border-dashed border-gray-300 ${isOverdue(l) ? 'font-bold text-red-500' : 'font-normal text-gray-700'}`}>
                          {isOverdue(l) && '\u26A0 '}{fmtDate(l.followUpDate)}
                        </span>
                      ) : <span className="text-gray-400 text-[11px] border-b border-dashed border-gray-300">+ Set date</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] align-middle cursor-pointer" onClick={() => setDateEditPopup({ leadId: l.id, field: 'closureDate' })}>
                      {l.closureDate ? (
                        <span className="text-xs text-gray-500 border-b border-dashed border-gray-300">{fmtDate(l.closureDate)}</span>
                      ) : <span className="text-gray-400 text-[11px] border-b border-dashed border-gray-300">+ Set date</span>}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] align-middle text-center">
                      {(l.visits || []).length > 0 ? (
                        <span className="inline-flex items-center justify-center bg-[#3B82F618] text-blue-500 font-bold text-[11px] rounded-full w-[22px] h-[22px] border border-[#3B82F640]">{(l.visits || []).length}</span>
                      ) : (
                        <span className="text-gray-400 text-[11px]">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] align-middle text-right font-mono font-bold">
                      {fmtINR(l.cartValue)}
                    </td>
                    <td className="px-3 py-2.5 text-[13px] align-middle text-center whitespace-nowrap">
                      <button className="bg-transparent border-none cursor-pointer py-1 px-1.5 text-[13px] text-gray-700 relative" title="Edit" onClick={() => setDrawerLead(l)}>
                        Edit
                        {(l.remarks || []).length > 0 && <span className="absolute -top-0.5 -right-1 bg-[#EAB308] text-white text-[9px] font-bold rounded-full w-4 h-4 inline-flex items-center justify-center">{l.remarks.length}</span>}
                      </button>
                      <button className="bg-transparent border-none cursor-pointer py-1 px-1.5 text-[13px] text-red-500 relative" title="Delete" onClick={() => setDeleteLead(l)}>{'\u2715'}</button>
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
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

      {/* Drawer */}
      {(showAddDrawer || drawerLead) && (
        <LeadDrawer
          lead={drawerLead}
          onSave={saveLead}
          onClose={() => { setDrawerLead(null); setShowAddDrawer(false); }}
          onAddRemark={drawerLead ? (remark) => addRemark(drawerLead.id, remark) : undefined}
        />
      )}
      {deleteLead && (
        <DeleteConfirm
          leadId={deleteLead.id}
          onConfirm={() => removeLead(deleteLead.id)}
          onCancel={() => setDeleteLead(null)}
        />
      )}

      {/* Date Edit Popup */}
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

      {/* CSV Error Modal */}
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

      {/* CSV Preview Modal */}
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
                        <td className="px-3 py-2.5 text-[13px] align-middle">{row.clientName || '\u2014'}</td>
                        <td className="px-3 py-2.5 text-[13px] align-middle font-mono text-[11px]">{row.clientPhone}</td>
                        <td className="px-3 py-2.5 text-[13px] align-middle text-[11px] text-gray-500">{fmtDate(row.createdAt)}</td>
                        <td className="px-3 py-2.5 text-[13px] align-middle">{row.assignedTo}</td>
                        <td className="px-3 py-2.5 text-[13px] align-middle">{row.branch}</td>
                        <td className="px-3 py-2.5 text-[13px] align-middle"><StatusBadge status={row.status} /></td>
                        <td className="px-3 py-2.5 text-[13px] align-middle text-[11px] max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">
                          {row.cartItems.map((c) => c.name).join('; ') || '\u2014'}
                        </td>
                        <td className="px-3 py-2.5 text-[13px] align-middle text-right font-mono text-[11px]">{fmtINR(row.cartValue)}</td>
                        <td className="px-3 py-2.5 text-[13px] align-middle text-center text-[11px]">{row.remarks.length || '\u2014'}</td>
                        <td className="px-3 py-2.5 text-[13px] align-middle text-center text-[11px]">{row.visits.length || '\u2014'}</td>
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

      {/* CSV import confirmation toast */}
      {csvImportCount != null && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#1A1A1A] text-white px-6 py-2.5 rounded-lg text-[13px] font-semibold z-[1100] shadow-[0_4px_12px_rgba(0,0,0,0.2)]">
          Successfully imported {csvImportCount} lead{csvImportCount !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

