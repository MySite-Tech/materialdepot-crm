'use client';

import { getKylasDealUrl } from '../../lib/api/b2bInbound';
import { markLeadLost } from '../../lib/api/dashboards';
import { syncEstimate } from '../../lib/api/kylasSync';
import { appendRemarkToLead, createLead, fetchLead, upsertLead } from '../../lib/api/leadDetails';
import { assignBMToClient } from '../../lib/api/storeVisit';
import { AppUser, Lead, Remark } from '../../types/crm';
import { MIN_LOST_AGE_DAYS } from './constants/crm';
import { DateEditState } from './types/crm';
import { canBypassLostAge, canMarkLostByAge, fmtDate, mergeLead } from './utils/crm';
import { Dispatch, SetStateAction } from 'react';

export function makeLeadActions({ bmNameToPhone, currentUser, dateEditPopup, filtered, kylasModalInput, leads, setDateEditPopup, setDrawerLead, setKylasModalResult, setKylasSync, setLeads, setShowAddDrawer, showSaveError, showToast }: {
  bmNameToPhone: Record<string, string>;
  currentUser: AppUser | null;
  dateEditPopup: DateEditState | null;
  filtered: Lead[];
  kylasModalInput: string;
  leads: Lead[];
  setDateEditPopup: Dispatch<SetStateAction<DateEditState | null>>;
  setDeleteLeadState: Dispatch<SetStateAction<Lead | null>>;
  setDrawerLead: Dispatch<SetStateAction<Lead | null>>;
  setKylasModalResult: Dispatch<SetStateAction<{ loading?: boolean | undefined; ok?: boolean | undefined; msg?: string | undefined; link?: string | undefined; } | null>>;
  setKylasSync: Dispatch<SetStateAction<Record<string, { loading?: boolean | undefined; ok?: boolean | undefined; msg?: string | undefined; }>>>;
  setLeads: Dispatch<SetStateAction<Lead[]>>;
  setShowAddDrawer: Dispatch<SetStateAction<boolean>>;
  showSaveError: (msg?: string) => void;
  showToast: (msg: string, ok: boolean, link?: string | undefined) => void;
}) {
const filteredTotal = filtered.reduce((sum, l) => sum + (l.cartValue || 0), 0);

const saveLead = (formData: Lead) => {
  const existing = leads.find((l) => l.id === formData.id && l.clientPhone === formData.clientPhone) || leads.find((l) => l.id === formData.id);
  const isNew = !existing;
  if (formData.status === 'Order Lost' && existing?.status !== 'Order Lost' && !canMarkLostByAge(existing?.createdAt ?? formData.createdAt, canBypassLostAge(currentUser))) {
    alert(`Only admins and managers can mark a lead as lost within ${MIN_LOST_AGE_DAYS} days of cart creation.`);
    return;
  }
  const finalData = existing ? mergeLead(existing, formData) : formData;
  setLeads((prev) => {
    const idx = prev.findIndex((l) => l.id === finalData.id && l.clientPhone === finalData.clientPhone);
    if (idx >= 0) { const next = [...prev]; next[idx] = finalData; return next; }
    return [...prev, finalData];
  });
  if (isNew && finalData.clientPhone && currentUser?.phone) {
    createLead(finalData, currentUser.phone)
      .catch((e) => { console.error('Create lead failed:', e); showSaveError(); });
  } else {
    upsertLead(finalData).catch((e) => { console.error('Save failed:', e); showSaveError(); });
  }
  if (!isNew && finalData.clientPhone && finalData.assignedTo && finalData.assignedTo !== existing?.assignedTo) {
    const bmPhone = bmNameToPhone[finalData.assignedTo];
    if (bmPhone) {
      assignBMToClient(finalData.clientPhone, bmPhone).catch((e) => { console.error('Reassign BM failed:', e); showSaveError(); });
    } else {
      console.error('Could not resolve BM phone for assignedTo:', finalData.assignedTo);
      showSaveError();
    }
  }
  if (!isNew && finalData.status === 'Order Lost' && existing?.status !== 'Order Lost') {
    markLeadLost(finalData.id, finalData.lostReason || '', finalData.ticketId).catch((e) => console.error('Estimate lost sync failed:', e));
  }
  setDrawerLead(null);
  setShowAddDrawer(false);
};

const handleKylasSync = async (leadId: string) => {
  setKylasSync((p) => ({ ...p, [leadId]: { loading: true } }));
  try {
    const res = await syncEstimate(leadId);
    showToast(
      res.success ? (res.message || 'Synced to Kylas') : (res.error || res.message || 'Sync failed'),
      res.success,
      res.success && res.deal_id ? getKylasDealUrl(res.deal_id) : undefined,
    );
  } catch (e) {
    showToast(e instanceof Error ? e.message : 'Sync failed', false);
  } finally {
    setKylasSync((p) => { const n = { ...p }; delete n[leadId]; return n; });
  }
};

const handleKylasModalSync = async () => {
  const value = kylasModalInput.trim();
  if (!value) return;
  setKylasModalResult({ loading: true });
  try {
    const res = await syncEstimate(value);
    setKylasModalResult({
      ok: res.success,
      msg: res.success ? (res.message || 'Synced to Kylas') : (res.error || res.message || 'Sync failed'),
      link: res.success && res.deal_id ? getKylasDealUrl(res.deal_id) : undefined,
    });
  } catch (e) {
    setKylasModalResult({ ok: false, msg: e instanceof Error ? e.message : 'Sync failed' });
  }
};

const addRemark = (leadId: string, ticketId: number, remark: Remark) => {
  setLeads((prev) => prev.map((l) => (l.id === leadId && l.ticketId === ticketId) ? { ...l, remarks: [...(l.remarks || []), remark] } : l));
  appendRemarkToLead(ticketId, remark, currentUser?.phone).then((latestRemarks: Remark[]) => {
    setLeads((prev) => prev.map((l) => (l.id === leadId && l.ticketId === ticketId) ? { ...l, remarks: latestRemarks } : l));
  }).catch((e) => console.error('Remark save failed:', e));
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
  setDateEditPopup(null);
};


  return { addRemark, filteredTotal, handleDateEditSave, handleKylasModalSync, handleKylasSync, saveLead };
}
