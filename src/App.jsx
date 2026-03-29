import { useState, useEffect, useRef } from 'react';

// ── Font injection ──────────────────────────────────────────────────────────
const fontLink = document.createElement('link');
fontLink.rel = 'stylesheet';
fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap';
document.head.appendChild(fontLink);

// ── Constants ───────────────────────────────────────────────────────────────
const SALES_PEOPLE = ['Arjun Mehta', 'Priya Sharma', 'Rahul Verma', 'Sneha Iyer', 'Karan Patel'];

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

const PIPELINE_BUCKETS = {
  Active: ['Quote Approval Pending', 'Request for Availability Check', 'Order Placed'],
  Won: ['Delivered'],
  Lost: ['Refunded', 'Order Lost'],
};

const LS_KEY = 'materialdepot_crm_v2';

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

// ── Seed data ───────────────────────────────────────────────────────────────
const SEED_LEADS = [
  { id: genId(), createdAt: '2026-03-15', assignedTo: 'Arjun Mehta', status: 'Quote Approval Pending', cartValue: 125000, cartItems: [{ name: 'Portland Cement 50kg', qty: 100, price: 1250 }], followUpDate: '2026-03-28', closureDate: '2026-04-10', remarks: [{ ts: '2026-03-15T10:30:00', author: 'Arjun Mehta', text: 'Client requested quote for bulk cement order' }] },
  { id: genId(), createdAt: '2026-03-10', assignedTo: 'Priya Sharma', status: 'Request for Availability Check', cartValue: 340000, cartItems: [{ name: 'TMT Steel Bars 12mm', qty: 200, price: 1500 }, { name: 'Binding Wire', qty: 50, price: 800 }], followUpDate: '2026-03-25', closureDate: '2026-04-05', remarks: [{ ts: '2026-03-10T14:00:00', author: 'Priya Sharma', text: 'Large construction project - need availability check for steel' }] },
  { id: genId(), createdAt: '2026-03-01', assignedTo: 'Rahul Verma', status: 'Order Placed', cartValue: 89000, cartItems: [{ name: 'AAC Blocks', qty: 500, price: 178 }], followUpDate: '2026-04-01', closureDate: '2026-04-08', remarks: [{ ts: '2026-03-01T09:00:00', author: 'Rahul Verma', text: 'Order confirmed, delivery scheduled for next week' }] },
  { id: genId(), createdAt: '2026-02-20', assignedTo: 'Sneha Iyer', status: 'Delivered', cartValue: 215000, cartItems: [{ name: 'Ceramic Floor Tiles', qty: 300, price: 450 }, { name: 'Tile Adhesive 20kg', qty: 100, price: 650 }], followUpDate: '', closureDate: '2026-03-10', remarks: [{ ts: '2026-03-10T16:00:00', author: 'Sneha Iyer', text: 'Delivered and payment received' }] },
  { id: genId(), createdAt: '2026-02-15', assignedTo: 'Karan Patel', status: 'Order Lost', cartValue: 78000, cartItems: [{ name: 'Plywood 18mm', qty: 40, price: 1950 }], followUpDate: '', closureDate: '', remarks: [{ ts: '2026-02-28T11:00:00', author: 'Karan Patel', text: 'Client went with a competitor on price' }] },
  { id: genId(), createdAt: '2026-03-20', assignedTo: 'Arjun Mehta', status: 'Refunded', cartValue: 45000, cartItems: [{ name: 'Primer 20L', qty: 10, price: 4500 }], followUpDate: '', closureDate: '2026-03-22', remarks: [{ ts: '2026-03-22T13:30:00', author: 'Arjun Mehta', text: 'Client cancelled, full refund issued' }] },
];

// ── Components ──────────────────────────────────────────────────────────────

function Avatar({ name, size = 24 }) {
  const initial = name ? name.charAt(0).toUpperCase() : '?';
  return (
    <div style={{ ...S.avatar, width: size, height: size, fontSize: size * 0.45, lineHeight: size + 'px' }}>
      {initial}
    </div>
  );
}

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || '#9CA3AF';
  return (
    <span style={{ ...S.statusBadge, background: color + '18', color, borderColor: color + '40' }}>
      {status}
    </span>
  );
}

function EditableStatus({ status, onCommit }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <select
        autoFocus
        value={status}
        onChange={(e) => { onCommit(e.target.value); setEditing(false); }}
        onBlur={() => setEditing(false)}
        style={S.statusSelect}
      >
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    );
  }
  return <span onDoubleClick={() => setEditing(true)}><StatusBadge status={status} /></span>;
}

function Field({ label, children }) {
  return (
    <div style={S.field}>
      <label style={S.fieldLabel}>{label}</label>
      {children}
    </div>
  );
}

function Th({ label, sortKey, sortCol, sortDir, onSort, style }) {
  const active = sortCol === sortKey;
  return (
    <th
      style={{ ...S.th, cursor: sortKey ? 'pointer' : 'default', ...style }}
      onClick={() => sortKey && onSort(sortKey)}
    >
      {label}
      {sortKey && (
        <span style={{ marginLeft: 4, opacity: active ? 1 : 0.3 }}>
          {active ? (sortDir === 'asc' ? '\u25B2' : '\u25BC') : '\u21D5'}
        </span>
      )}
    </th>
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
      <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
        <span style={{ ...S.fieldLabel, flex: 3 }}>ITEM NAME</span>
        <span style={{ ...S.fieldLabel, flex: 1, textAlign: 'center' }}>QTY</span>
        <span style={{ ...S.fieldLabel, flex: 1.5, textAlign: 'right' }}>RATE (\u20B9)</span>
        <span style={{ width: 28 }} />
      </div>
      {items.map((it, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'center' }}>
          <input style={{ ...S.input, flex: 3 }} value={it.name} placeholder="Item name" onChange={(e) => update(i, 'name', e.target.value)} />
          <input style={{ ...S.input, flex: 1, textAlign: 'center' }} type="number" min="1" value={it.qty} onChange={(e) => update(i, 'qty', e.target.value)} />
          <input style={{ ...S.input, flex: 1.5, textAlign: 'right' }} type="number" min="0" value={it.price} onChange={(e) => update(i, 'price', e.target.value)} />
          <button style={S.removeBtn} onClick={() => remove(i)} title="Remove">&times;</button>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <span style={{ ...S.addItemLink, cursor: 'pointer' }} onClick={add}>+ Add Item</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 600, fontSize: 13 }}>Subtotal: {fmtINR(total)}</span>
      </div>
    </div>
  );
}

// ── Follow-up Remark Prompt ─────────────────────────────────────────────────
function FollowUpRemarkPrompt({ oldDate, newDate, onConfirm, onCancel }) {
  const [text, setText] = useState('');
  return (
    <div style={S.overlay}>
      <div style={{ ...S.modalBox, maxWidth: 400 }}>
        <div style={S.modalHeader}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Follow-up Date Changed</span>
        </div>
        <div style={{ padding: 20 }}>
          <p style={{ marginBottom: 12, fontSize: 13 }}>
            <span style={{ color: '#9CA3AF' }}>{fmtDate(oldDate)}</span>
            {' \u2192 '}
            <span style={{ fontWeight: 600 }}>{fmtDate(newDate)}</span>
          </p>
          <label style={S.fieldLabel}>REASON FOR CHANGE *</label>
          <textarea
            style={{ ...S.input, width: '100%', minHeight: 80, marginTop: 4, resize: 'vertical' }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter reason for changing follow-up date..."
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
            <button style={S.cancelBtn} onClick={onCancel}>Cancel</button>
            <button style={{ ...S.primaryBtn, opacity: text.trim() ? 1 : 0.5 }} disabled={!text.trim()} onClick={() => onConfirm(text.trim())}>Confirm</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Lead Modal ──────────────────────────────────────────────────────────────
function LeadModal({ lead, onSave, onClose }) {
  const isEdit = !!lead;
  const [form, setForm] = useState(() => lead ? { ...lead, cartItems: lead.cartItems ? lead.cartItems.map(i => ({ ...i })) : [] } : {
    id: genId(), createdAt: todayStr(), assignedTo: SALES_PEOPLE[0], status: STATUSES[0],
    cartValue: 0, cartItems: [], followUpDate: '', closureDate: '', remarks: [],
  });
  const origFollowUpDate = useRef(lead ? lead.followUpDate : '');
  const [fuPrompt, setFuPrompt] = useState(null);

  useEffect(() => {
    const total = form.cartItems.reduce((s, it) => s + (it.qty || 0) * (it.price || 0), 0);
    if (total > 0) setForm((f) => ({ ...f, cartValue: total }));
  }, [form.cartItems]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleFollowUpChange = (newDate) => {
    if (isEdit && origFollowUpDate.current && newDate !== origFollowUpDate.current) {
      setFuPrompt({ oldDate: origFollowUpDate.current, newDate });
    } else {
      set('followUpDate', newDate);
    }
  };

  const handleFuConfirm = (remarkText) => {
    const remark = { ts: new Date().toISOString(), author: form.assignedTo, text: remarkText };
    setForm((f) => ({
      ...f,
      followUpDate: fuPrompt.newDate,
      remarks: [...(f.remarks || []), remark],
    }));
    origFollowUpDate.current = fuPrompt.newDate;
    setFuPrompt(null);
  };

  const handleSave = () => onSave(form);

  return (
    <div style={S.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ ...S.modalBox, maxWidth: 560 }}>
        <div style={S.modalHeader}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{isEdit ? 'Edit Lead' : 'Add New Lead'}</span>
          <button style={S.closeBtn} onClick={onClose}>&times;</button>
        </div>
        <div style={{ padding: 20, maxHeight: '70vh', overflowY: 'auto' }}>
          <div style={S.formGrid}>
            <Field label="LEAD ID">
              <input style={{ ...S.input, fontFamily: "'JetBrains Mono', monospace", background: '#F3F4F6' }} value={form.id} readOnly />
            </Field>
            <Field label="CREATION DATE">
              <input style={S.input} type="date" value={form.createdAt} onChange={(e) => set('createdAt', e.target.value)} />
            </Field>
            <Field label="ASSIGNED TO">
              <select style={S.input} value={form.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
                {SALES_PEOPLE.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="STATUS">
              <select style={S.input} value={form.status} onChange={(e) => set('status', e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="FOLLOW-UP DATE">
              <input style={S.input} type="date" value={form.followUpDate} onChange={(e) => handleFollowUpChange(e.target.value)} />
            </Field>
            <Field label="CLOSURE EXPECTED">
              <input style={S.input} type="date" value={form.closureDate} onChange={(e) => set('closureDate', e.target.value)} />
            </Field>
          </div>
          <div style={{ marginTop: 16 }}>
            <label style={S.fieldLabel}>CART ITEMS</label>
            <CartItemsEditor items={form.cartItems} onChange={(items) => set('cartItems', items)} />
          </div>
          <div style={{ marginTop: 16 }}>
            <Field label="CART VALUE (\u20B9)">
              <input style={{ ...S.input, fontFamily: "'JetBrains Mono', monospace" }} type="number" min="0" value={form.cartValue} onChange={(e) => set('cartValue', Number(e.target.value) || 0)} />
            </Field>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
            <button style={S.cancelBtn} onClick={onClose}>Cancel</button>
            <button style={S.primaryBtn} onClick={handleSave}>{isEdit ? 'Save Changes' : 'Add Lead'}</button>
          </div>
        </div>
      </div>
      {fuPrompt && (
        <FollowUpRemarkPrompt
          oldDate={fuPrompt.oldDate}
          newDate={fuPrompt.newDate}
          onConfirm={handleFuConfirm}
          onCancel={() => setFuPrompt(null)}
        />
      )}
    </div>
  );
}

// ── Remarks Drawer ──────────────────────────────────────────────────────────
function RemarksDrawer({ lead, onClose, onAddRemark }) {
  const [author, setAuthor] = useState(lead.assignedTo);
  const [text, setText] = useState('');
  const timelineRef = useRef(null);

  useEffect(() => {
    if (timelineRef.current) timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
  }, [lead.remarks]);

  const submit = () => {
    if (!text.trim()) return;
    onAddRemark({ ts: new Date().toISOString(), author, text: text.trim() });
    setText('');
  };

  const handleKeyDown = (e) => {
    if (e.ctrlKey && e.key === 'Enter') submit();
  };

  return (
    <>
      <div style={S.drawerBackdrop} onClick={onClose} />
      <div style={S.drawer}>
        <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
        <div style={S.drawerHeader}>
          <div>
            <span style={{ fontWeight: 600, fontSize: 14, color: '#fff' }}>Remarks</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#9CA3AF', marginLeft: 8 }}>{lead.id}</span>
          </div>
          <button style={S.closeBtn} onClick={onClose}>&times;</button>
        </div>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #E5E7EB', fontSize: 12 }}>
          <StatusBadge status={lead.status} />
          {lead.followUpDate && <span style={{ marginLeft: 12, color: '#6B7280' }}>Follow-up: {fmtDate(lead.followUpDate)}</span>}
          {lead.closureDate && <span style={{ marginLeft: 12, color: '#6B7280' }}>Closure: {fmtDate(lead.closureDate)}</span>}
        </div>
        <div ref={timelineRef} style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          {(!lead.remarks || lead.remarks.length === 0) && <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', marginTop: 40 }}>No remarks yet</p>}
          {(lead.remarks || []).map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 16, position: 'relative' }}>
              {i < (lead.remarks || []).length - 1 && <div style={{ position: 'absolute', left: 13, top: 32, bottom: -16, width: 1, background: '#E5E7EB' }} />}
              <Avatar name={r.author} size={28} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{r.author}</span>
                  <span style={{ color: '#9CA3AF', marginLeft: 8 }}>{fmtTimestamp(r.ts)}</span>
                </div>
                <div style={S.remarkBubble}>{r.text}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: 16, borderTop: '1px solid #E5E7EB' }}>
          <select style={{ ...S.input, width: '100%', marginBottom: 8, fontSize: 12 }} value={author} onChange={(e) => setAuthor(e.target.value)}>
            {SALES_PEOPLE.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <textarea
            style={{ ...S.input, width: '100%', minHeight: 60, resize: 'vertical', fontSize: 12 }}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a remark... (Ctrl+Enter to submit)"
          />
          <button style={{ ...S.primaryBtn, width: '100%', marginTop: 8 }} disabled={!text.trim()} onClick={submit}>Add Remark</button>
        </div>
      </div>
    </>
  );
}

// ── Delete Confirmation ─────────────────────────────────────────────────────
function DeleteConfirm({ leadId, onConfirm, onCancel }) {
  return (
    <div style={S.overlay}>
      <div style={{ ...S.modalBox, maxWidth: 360 }}>
        <div style={S.modalHeader}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Delete Lead</span>
        </div>
        <div style={{ padding: 20, textAlign: 'center' }}>
          <p style={{ marginBottom: 16, fontSize: 13 }}>Are you sure you want to delete lead <strong>{leadId}</strong>? This action cannot be undone.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button style={S.cancelBtn} onClick={onCancel}>Cancel</button>
            <button style={{ ...S.primaryBtn, background: '#EF4444' }} onClick={onConfirm}>Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [leads, setLeads] = useState(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored) { const parsed = JSON.parse(stored); if (Array.isArray(parsed) && parsed.length > 0) return parsed; }
    } catch (e) { /* ignore */ }
    return SEED_LEADS;
  });

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [personFilter, setPersonFilter] = useState('');
  const [sortCol, setSortCol] = useState('createdAt');
  const [sortDir, setSortDir] = useState('desc');
  const [modalLead, setModalLead] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [drawerLead, setDrawerLead] = useState(null);
  const [deleteLead, setDeleteLead] = useState(null);

  // Persist to localStorage
  useEffect(() => { localStorage.setItem(LS_KEY, JSON.stringify(leads)); }, [leads]);

  // Pipeline computations (always from ALL leads)
  const pipelineTotal = leads.reduce((s, l) => s + (l.cartValue || 0), 0);
  const pipelineActive = leads.filter((l) => PIPELINE_BUCKETS.Active.includes(l.status)).reduce((s, l) => s + (l.cartValue || 0), 0);
  const pipelineWon = leads.filter((l) => PIPELINE_BUCKETS.Won.includes(l.status)).reduce((s, l) => s + (l.cartValue || 0), 0);
  const pipelineLost = leads.filter((l) => PIPELINE_BUCKETS.Lost.includes(l.status)).reduce((s, l) => s + (l.cartValue || 0), 0);
  const pctWon = pipelineTotal ? (pipelineWon / pipelineTotal) * 100 : 0;
  const pctActive = pipelineTotal ? (pipelineActive / pipelineTotal) * 100 : 0;
  const pctLost = pipelineTotal ? (pipelineLost / pipelineTotal) * 100 : 0;

  // Stage summary (always from ALL leads)
  const stageSummary = STATUSES.map((status) => {
    const stageLeads = leads.filter((l) => l.status === status);
    return { status, count: stageLeads.length, value: stageLeads.reduce((s, l) => s + (l.cartValue || 0), 0) };
  });

  // Per-status chips for pipeline panel
  const statusChips = stageSummary.filter((s) => s.value > 0);

  // Active lead counts for pipeline metrics
  const activeCount = leads.filter((l) => PIPELINE_BUCKETS.Active.includes(l.status)).length;
  const wonCount = leads.filter((l) => PIPELINE_BUCKETS.Won.includes(l.status)).length;
  const lostCount = leads.filter((l) => PIPELINE_BUCKETS.Lost.includes(l.status)).length;

  // Filtering
  const filtered = leads.filter((l) => {
    if (statusFilter && l.status !== statusFilter) return false;
    if (personFilter && l.assignedTo !== personFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchId = l.id.toLowerCase().includes(q);
      const matchPerson = l.assignedTo.toLowerCase().includes(q);
      const matchItems = (l.cartItems || []).some((it) => it.name.toLowerCase().includes(q));
      if (!matchId && !matchPerson && !matchItems) return false;
    }
    return true;
  });

  // Sorting
  const sorted = [...filtered].sort((a, b) => {
    let va = a[sortCol], vb = b[sortCol];
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

  // Lead CRUD
  const saveLead = (formData) => {
    setLeads((prev) => {
      const idx = prev.findIndex((l) => l.id === formData.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = formData; return next; }
      return [...prev, formData];
    });
    setModalLead(null);
    setShowAddModal(false);
  };

  const removeLead = (id) => {
    setLeads((prev) => prev.filter((l) => l.id !== id));
    setDeleteLead(null);
  };

  const updateStatus = (id, newStatus) => {
    setLeads((prev) => prev.map((l) => l.id === id ? { ...l, status: newStatus } : l));
  };

  const addRemark = (leadId, remark) => {
    setLeads((prev) => prev.map((l) => l.id === leadId ? { ...l, remarks: [...(l.remarks || []), remark] } : l));
    setDrawerLead((d) => d && d.id === leadId ? { ...d, remarks: [...(d.remarks || []), remark] } : d);
  };

  const today = todayStr();

  const isOverdue = (l) => l.followUpDate && l.followUpDate < today && !['Delivered', 'Refunded', 'Order Lost'].includes(l.status);

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAFA' }}>
      {/* Header */}
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>material</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#F97316', marginLeft: -10 }}>depot</span>
          <span style={{ fontSize: 12, color: '#9CA3AF', marginLeft: 8 }}>Sales CRM</span>
        </div>
      </header>

      <div style={{ padding: '16px 24px' }}>
        {/* Pipeline Revenue Summary */}
        <div style={S.pipelineCard}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9CA3AF' }}>Total Pipeline Value</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 700, color: '#000' }}>{fmtINR(pipelineTotal)}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF' }}>{leads.length} leads</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9CA3AF' }}>Active Pipeline</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: '#F97316' }}>{fmtINR(pipelineActive)}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF' }}>{activeCount} leads</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9CA3AF' }}>Won</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: '#15803D' }}>{fmtINR(pipelineWon)}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF' }}>{wonCount} leads</div>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9CA3AF' }}>Lost / Refunded</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: '#9CA3AF' }}>{fmtINR(pipelineLost)}</div>
              <div style={{ fontSize: 11, color: '#9CA3AF' }}>{lostCount} leads</div>
            </div>
          </div>
          {/* Stacked bar */}
          <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 16, background: '#E5E7EB' }}>
            <div style={{ width: pctWon + '%', background: '#22C55E', transition: 'width 0.3s' }} />
            <div style={{ width: pctActive + '%', background: '#F97316', transition: 'width 0.3s' }} />
            <div style={{ width: pctLost + '%', background: '#9CA3AF', transition: 'width 0.3s' }} />
          </div>
          {/* Per-status chips */}
          {statusChips.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {statusChips.map((sc) => (
                <span
                  key={sc.status}
                  onClick={() => setStatusFilter((f) => f === sc.status ? '' : sc.status)}
                  style={{
                    ...S.chip,
                    border: statusFilter === sc.status ? '1px solid #F97316' : '1px solid #E5E7EB',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[sc.status], marginRight: 6 }} />
                  <span style={{ fontSize: 11 }}>{sc.status}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, marginLeft: 6 }}>{fmtINR(sc.value)}</span>
                  <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 4 }}>({sc.count})</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Stage Cards */}
        <div style={{ display: 'flex', gap: 12, marginTop: 12, overflowX: 'auto', paddingBottom: 4 }}>
          {stageSummary.map((ss) => {
            const active = statusFilter === ss.status;
            return (
              <div
                key={ss.status}
                onClick={() => setStatusFilter((f) => f === ss.status ? '' : ss.status)}
                style={{
                  ...S.stageCard,
                  borderColor: active ? '#F97316' : '#E5E7EB',
                  cursor: 'pointer',
                  flex: '1 0 140px',
                }}
              >
                <div style={{ fontSize: 24, fontWeight: 700, color: active ? '#F97316' : '#374151' }}>{ss.count}</div>
                <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9CA3AF', marginTop: 2 }}>{ss.status}</div>
                {ss.value > 0 && (
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, color: STATUS_COLORS[ss.status], marginTop: 4 }}>{fmtINR(ss.value)}</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Toolbar */}
        <div style={S.toolbar}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flex: 1 }}>
            <input
              style={{ ...S.input, width: 220 }}
              placeholder="Search leads..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select style={{ ...S.input, width: 200 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select style={{ ...S.input, width: 180 }} value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
              <option value="">All Salespeople</option>
              {SALES_PEOPLE.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <span style={{ fontSize: 12, color: '#6B7280' }}>{filtered.length} lead{filtered.length !== 1 ? 's' : ''}</span>
          </div>
          <button style={S.primaryBtn} onClick={() => setShowAddModal(true)}>+ Add Lead</button>
        </div>

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: 8, border: '1px solid #E5E7EB', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#FAFAFA' }}>
                  <Th label="Lead ID" sortKey="id" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Date Added" sortKey="createdAt" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Assigned To" sortKey="assignedTo" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Status" sortKey="status" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Cart Items" sortKey={null} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Follow-up" sortKey="followUpDate" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Closure Date" sortKey="closureDate" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <Th label="Cart Value" sortKey="cartValue" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ textAlign: 'right' }} />
                  <Th label="Actions" sortKey={null} sortCol={sortCol} sortDir={sortDir} onSort={handleSort} style={{ textAlign: 'center' }} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((l) => (
                  <tr
                    key={l.id}
                    style={{ borderTop: '1px solid #E5E7EB' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#FFFAF7'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = '#FFFFFF'; }}
                  >
                    <td style={S.td}>
                      <span style={S.leadIdChip}>{l.id}</span>
                    </td>
                    <td style={{ ...S.td, color: '#6B7280', fontSize: 12 }}>{fmtDate(l.createdAt)}</td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Avatar name={l.assignedTo} />
                        <span style={{ fontSize: 12 }}>{l.assignedTo}</span>
                      </div>
                    </td>
                    <td style={S.td}>
                      <EditableStatus status={l.status} onCommit={(s) => updateStatus(l.id, s)} />
                    </td>
                    <td style={{ ...S.td, fontSize: 12, maxWidth: 160 }}>
                      {(l.cartItems || []).slice(0, 2).map((it, i) => (
                        <div key={i} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {it.name} x{it.qty}
                        </div>
                      ))}
                      {(l.cartItems || []).length > 2 && <span style={{ color: '#9CA3AF', fontSize: 11 }}>+{l.cartItems.length - 2} more</span>}
                    </td>
                    <td style={S.td}>
                      {l.followUpDate ? (
                        <span style={{ fontWeight: isOverdue(l) ? 700 : 400, color: isOverdue(l) ? '#EF4444' : '#374151', fontSize: 12 }}>
                          {isOverdue(l) && '\u26A0 '}{fmtDate(l.followUpDate)}
                        </span>
                      ) : '\u2014'}
                    </td>
                    <td style={{ ...S.td, fontSize: 12, color: '#6B7280' }}>{fmtDate(l.closureDate)}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13 }}>
                      {fmtINR(l.cartValue)}
                    </td>
                    <td style={{ ...S.td, textAlign: 'center', whiteSpace: 'nowrap' }}>
                      <button style={S.actionBtn} title="Remarks" onClick={() => setDrawerLead(l)}>
                        <span role="img" aria-label="remarks">{'\uD83D\uDCAC'}</span>
                        {(l.remarks || []).length > 0 && <span style={S.remarksBadge}>{l.remarks.length}</span>}
                      </button>
                      <button style={S.actionBtn} title="Edit" onClick={() => setModalLead(l)}>Edit</button>
                      <button style={{ ...S.actionBtn, color: '#EF4444' }} title="Delete" onClick={() => setDeleteLead(l)}>{'\u2715'}</button>
                    </td>
                  </tr>
                ))}
                {sorted.length === 0 && (
                  <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>No leads found</td></tr>
                )}
              </tbody>
              {filtered.length > 0 && (
                <tfoot>
                  <tr style={{ background: '#FFF7F0' }}>
                    <td colSpan={7} style={{ ...S.td, fontWeight: 600, fontSize: 12 }}>Total ({filtered.length} lead{filtered.length !== 1 ? 's' : ''})</td>
                    <td style={{ ...S.td, textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13, color: '#F97316' }}>{fmtINR(filteredTotal)}</td>
                    <td style={S.td} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Modals & Drawer */}
      {(showAddModal || modalLead) && (
        <LeadModal
          lead={modalLead}
          onSave={saveLead}
          onClose={() => { setModalLead(null); setShowAddModal(false); }}
        />
      )}
      {drawerLead && (
        <RemarksDrawer
          lead={leads.find((l) => l.id === drawerLead.id) || drawerLead}
          onClose={() => setDrawerLead(null)}
          onAddRemark={(remark) => addRemark(drawerLead.id, remark)}
        />
      )}
      {deleteLead && (
        <DeleteConfirm
          leadId={deleteLead.id}
          onConfirm={() => removeLead(deleteLead.id)}
          onCancel={() => setDeleteLead(null)}
        />
      )}
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────
const S = {
  header: {
    position: 'sticky', top: 0, zIndex: 900, height: 48, background: '#1A1A1A',
    display: 'flex', alignItems: 'center', padding: '0 24px',
  },
  pipelineCard: {
    background: '#fff', borderRadius: 8, padding: '16px 24px', border: '1px solid #E5E7EB',
  },
  stageCard: {
    background: '#fff', borderRadius: 8, padding: '12px 16px', border: '1.5px solid #E5E7EB',
    textAlign: 'center', minWidth: 130,
  },
  toolbar: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '12px 0', gap: 12, flexWrap: 'wrap',
  },
  th: {
    padding: '10px 12px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.06em', color: '#9CA3AF', textAlign: 'left', whiteSpace: 'nowrap',
    userSelect: 'none',
  },
  td: {
    padding: '10px 12px', fontSize: 13, verticalAlign: 'middle',
  },
  leadIdChip: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600,
    background: '#F3F4F6', padding: '2px 8px', borderRadius: 4,
  },
  statusBadge: {
    display: 'inline-block', padding: '2px 8px', borderRadius: 12,
    fontSize: 11, fontWeight: 600, border: '1px solid', whiteSpace: 'nowrap',
  },
  statusSelect: {
    padding: '4px 8px', fontSize: 12, border: '1px solid #E5E7EB', borderRadius: 6,
    outline: 'none',
  },
  avatar: {
    background: '#F97316', color: '#fff', borderRadius: '50%', display: 'inline-flex',
    alignItems: 'center', justifyContent: 'center', fontWeight: 600, flexShrink: 0,
  },
  input: {
    padding: '8px 10px', fontSize: 13, border: '1px solid #E5E7EB', borderRadius: 6,
    outline: 'none', fontFamily: "'Inter', sans-serif",
  },
  field: { marginBottom: 12 },
  fieldLabel: {
    display: 'block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.06em', color: '#9CA3AF', marginBottom: 4,
  },
  formGrid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px',
  },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modalBox: {
    background: '#fff', borderRadius: 8, overflow: 'hidden', width: '90%',
    boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
  },
  modalHeader: {
    background: '#1A1A1A', color: '#fff', padding: '12px 20px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  closeBtn: {
    background: 'none', border: 'none', color: '#9CA3AF', fontSize: 20, cursor: 'pointer',
    lineHeight: 1,
  },
  primaryBtn: {
    background: '#F97316', color: '#fff', border: 'none', padding: '8px 20px',
    borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  cancelBtn: {
    background: '#fff', color: '#374151', border: '1px solid #E5E7EB', padding: '8px 20px',
    borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer',
  },
  removeBtn: {
    background: 'none', border: 'none', color: '#EF4444', fontSize: 18, cursor: 'pointer',
    width: 28, lineHeight: 1,
  },
  addItemLink: {
    color: '#F97316', fontSize: 12, fontWeight: 600, background: 'none', border: 'none',
  },
  actionBtn: {
    background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px',
    fontSize: 13, color: '#374151', position: 'relative',
  },
  remarksBadge: {
    position: 'absolute', top: -2, right: -4, background: '#F97316', color: '#fff',
    fontSize: 9, fontWeight: 700, borderRadius: '50%', width: 16, height: 16,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  },
  chip: {
    display: 'inline-flex', alignItems: 'center', padding: '4px 10px', borderRadius: 16,
    background: '#fff', fontSize: 11,
  },
  drawerBackdrop: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 900,
  },
  drawer: {
    position: 'fixed', top: 0, right: 0, width: 420, height: '100vh', background: '#fff',
    zIndex: 901, display: 'flex', flexDirection: 'column',
    boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
    animation: 'slideInRight 0.25s ease-out',
  },
  drawerHeader: {
    background: '#1A1A1A', padding: '12px 16px',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  remarkBubble: {
    background: '#FAFAFA', padding: '8px 12px', borderRadius: 8, fontSize: 13,
    lineHeight: 1.5, border: '1px solid #E5E7EB',
  },
};
