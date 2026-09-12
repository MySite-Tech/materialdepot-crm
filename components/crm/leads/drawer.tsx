'use client';

import { CartItem, Lead, Remark, Visit } from '../../../types/crm';
import { KeyboardEvent, useEffect, useRef, useState } from 'react';

import { CLIENT_TYPES, MARK_LOST_ELIGIBLE, MIN_LOST_AGE_DAYS, ORDER_LOST_REASONS, PROJECT_PHASES, PROPERTY_TYPES, STATUSES, VISIT_CHANNELS, LEAD_PRIORITIES } from '../constants';
import { DateEditPopup } from '../ui/prompts';
import { LeadDrawerProps } from '../types';
import { Avatar, Field } from '../ui';
import { canBypassLostAge, canMarkLostByAge, fmtDate, fmtTimestamp, todayStr } from '../utils';

export function LeadDrawer({ lead, currentUser, branches, users = [], onSave, onClose, onAddRemark, onImmediateSave, visitsLoading = false }: LeadDrawerProps) {
  const isEdit = !!lead;
  const currentUserName = currentUser ? currentUser.name : '';
  const isAdmin = canBypassLostAge(currentUser);
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
    leadPriority: lead.leadPriority,
  } : {
    id: '', createdAt: todayStr(), assignedTo: currentUserName, branch: (branches[0] || ''), status: STATUSES[0],
    cartValue: 0, cartItems: '', followUpDate: '', closureDate: '', lostReason: '', remarks: [],
    clientName: '', clientPhone: '', visits: [],
    clientType: '', propertyType: '', architectInvolved: false, projectPhase: '', leadPriority: undefined,
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
                <input className={`px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full ${isEdit ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`} type="date" value={form.createdAt} readOnly={isEdit} onKeyDown={isEdit ? (e) => e.preventDefault() : undefined} onChange={isEdit ? undefined : (e) => set('createdAt', e.target.value)} />
              </Field>
              <Field label="CLIENT NAME">
                <input className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={form.clientName || ''} placeholder="Client name" onChange={(e) => set('clientName', e.target.value)} />
              </Field>
              <Field label="CLIENT PHONE">
                <input className={`px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full font-mono ${isEdit ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`} value={form.clientPhone || ''} placeholder="10-digit phone" maxLength={10} inputMode="numeric" readOnly={isEdit} onChange={isEdit ? undefined : (e) => set('clientPhone', e.target.value.replace(/[^0-9]/g, ''))} />
              </Field>
              <Field label="ASSIGNED TO">
                <select className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={form.assignedTo} onChange={(e) => set('assignedTo', e.target.value)}>
                  {form.assignedTo && !users.some((u) => u.name === form.assignedTo) && (
                    <option value={form.assignedTo}>{form.assignedTo}</option>
                  )}
                  {users.map((u, i) => <option key={i} value={u.name}>{u.name}</option>)}
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
                  {!!form.propertyType && !PROPERTY_TYPES.includes(form.propertyType) && (
                    <option value={form.propertyType}>{form.propertyType}</option>
                  )}
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
              <Field label="PRIORITY">
                <select className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={form.leadPriority || ''} onChange={(e) => set('leadPriority', (e.target.value || undefined) as 'hot' | 'warm' | 'cold' | undefined)}>
                  <option value="">Select...</option>
                  {LEAD_PRIORITIES.map((lp) => <option key={lp} value={lp}>{lp.charAt(0).toUpperCase() + lp.slice(1)}</option>)}
                </select>
              </Field>
              <Field label="STATUS">
                {MARK_LOST_ELIGIBLE.has(form.status) && canMarkLostByAge(form.createdAt, isAdmin) ? (
                  <select className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={form.status} onChange={(e) => { set('status', e.target.value); if (e.target.value !== 'Order Lost') set('lostReason', ''); }}>
                    <option value={form.status}>{form.status}</option>
                    <option value="Order Lost">Order Lost</option>
                  </select>
                ) : (
                  <div className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md bg-gray-50 text-gray-500 w-full">
                    {form.status}
                    {MARK_LOST_ELIGIBLE.has(form.status) && !canMarkLostByAge(form.createdAt, isAdmin) && (
                      <span className="block text-[10px] text-gray-400 mt-0.5">Only admins and managers can mark lost within {MIN_LOST_AGE_DAYS} days of cart creation</span>
                    )}
                  </div>
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
            {isEdit && (() => {
              const sorted = [...visits].sort((a, b) => a.date.localeCompare(b.date));
              const firstVisit = visits.length > 0 ? fmtDate(sorted[0]?.date) : '—';
              const latestVisit = visits.length > 0 ? fmtDate(sorted[sorted.length - 1]?.date) : '—';
              return (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {[
                    { label: 'FIRST VISIT', value: firstVisit },
                    { label: 'LATEST VISIT', value: latestVisit },
                    { label: 'TOTAL VISITS', value: String(visits.length) },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">{label}</p>
                      {visitsLoading
                        ? <div className="h-[34px] bg-gray-100 rounded-md animate-pulse" />
                        : <div className="px-2.5 py-2 text-[13px] bg-gray-50 border border-gray-100 rounded-md text-gray-600 font-mono">{value}</div>}
                    </div>
                  ))}
                </div>
              );
            })()}
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
