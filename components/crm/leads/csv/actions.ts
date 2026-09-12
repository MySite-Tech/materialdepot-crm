'use client';

import { fetchCRMLeads } from '../../../../lib/api/crm/leads';
import { upsertLeads } from '../../../../lib/api/crm/lead-details';
import { AppUser, CartItem, Lead, Remark, Visit } from '../../../../types/crm';
import { BACKEND_SORTABLE_COLS, CLIENT_TYPES, LEAD_PRIORITIES, LEGACY_PROPERTY_TYPES, ORDER_LOST_REASONS, PROJECT_PHASES, PROPERTY_TYPES, STATUSES, VISIT_CHANNELS } from '../../constants';
import { CsvRow } from '../../types';
import { csvEscape, leadToExportRow, mergeLead, todayStr, triggerDownload } from '../../utils';
import { ChangeEvent, Dispatch, RefObject, SetStateAction } from 'react';

export function makeLeadsCsv({ CSV_HEADERS, bmNameToPhone, branchFilter, branches, categoryFilter, priorityFilter, closureDateFrom, closureDateTo, createdDateFrom, createdDateTo, csvFileRef, csvPreview, csvSelected, currentUser, debouncedCartValueGt, debouncedSearch, exporting, followUpDateFrom, followUpDateTo, leads, personFilter, setCsvErrors, setCsvImportCount, setCsvPreview, setCsvSelected, setExportMenuOpen, setExporting, setLeads, sortCol, sortDir, statusFilter, taskFilter, userAllowedBranches, userAllowedBranchesLower }: {
  CSV_HEADERS: string[];
  bmNameToPhone: Record<string, string>;
  branchFilter: string[];
  branches: string[];
  categoryFilter: string[];
  priorityFilter: string[];
  closureDateFrom: string;
  closureDateTo: string;
  createdDateFrom: string;
  createdDateTo: string;
  csvFileRef: RefObject<HTMLInputElement | null>;
  csvPreview: CsvRow[] | null;
  csvSelected: Set<number>;
  currentUser: AppUser | null;
  debouncedCartValueGt: string;
  debouncedSearch: string;
  exporting: boolean;
  followUpDateFrom: string;
  followUpDateTo: string;
  leads: Lead[];
  personFilter: string[];
  setCsvErrors: Dispatch<SetStateAction<string[] | null>>;
  setCsvImportCount: Dispatch<SetStateAction<number | null>>;
  setCsvPreview: Dispatch<SetStateAction<CsvRow[] | null>>;
  setCsvSelected: Dispatch<SetStateAction<Set<number>>>;
  setExportMenuOpen: Dispatch<SetStateAction<boolean>>;
  setExporting: Dispatch<SetStateAction<boolean>>;
  setLeads: Dispatch<SetStateAction<Lead[]>>;
  sortCol: string;
  sortDir: "asc" | "desc";
  statusFilter: string[];
  taskFilter: string;
  userAllowedBranches: string[];
  userAllowedBranchesLower: Set<string>;
}) {
const buildLeadsExportQuery = () => {
  const effectiveBranches = userAllowedBranches.length > 0
    ? (branchFilter.length > 0 ? branchFilter.filter((b) => userAllowedBranchesLower.has(b.toLowerCase())) : userAllowedBranches)
    : branchFilter;
  return {
    branch: effectiveBranches.join(',') || undefined,
    bm: personFilter.map((name) => bmNameToPhone[name] || name).join(',') || undefined,
    q: debouncedSearch || undefined,
    status: statusFilter.join(',') || undefined,
    createdFrom: createdDateFrom || undefined,
    createdTo: createdDateTo || undefined,
    followupFrom: followUpDateFrom || undefined,
    followupTo: followUpDateTo || undefined,
    closureFrom: closureDateFrom || undefined,
    closureTo: closureDateTo || undefined,
    cartValueGt: debouncedCartValueGt ? Number(debouncedCartValueGt) : undefined,
    ownerUserOrgId: currentUser && currentUser.role === 'sales' ? currentUser.id : undefined,
    sortBy: (BACKEND_SORTABLE_COLS.has(sortCol) ? sortCol : 'createdAt'),
    sortDir: BACKEND_SORTABLE_COLS.has(sortCol) ? sortDir : 'desc',
    taskFilter: taskFilter || undefined,
    category: categoryFilter.length ? categoryFilter.join(',') : undefined,
    priority: priorityFilter.length ? priorityFilter.join(',') : undefined,
  };
};

const fetchAllFilteredLeads = async (): Promise<Lead[]> => {
  const base = buildLeadsExportQuery();
  const all: Lead[] = [];
  let pageNum = 1;
  let totalPages = 1;
  do {
    const res = await fetchCRMLeads({ ...base, page: pageNum, pageSize: 100 } as any);
    all.push(...(res.results as Lead[]));
    totalPages = res.totalPages || 1;
    pageNum++;
  } while (pageNum <= totalPages);
  return all;
};

const exportLeadsCsv = (list: Lead[], filename: string) => {
  const rows = [CSV_HEADERS, ...list.map(leadToExportRow)];
  const csv = '﻿' + rows.map((r) => r.map(csvEscape).join(',')).join('\n');
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename + '.csv');
};

const exportLeadsExcel = async (list: Lead[], filename: string) => {
  const XLSX = await import('xlsx');
  const rows = [CSV_HEADERS, ...list.map(leadToExportRow)];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = CSV_HEADERS.map(() => ({ wch: 18 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Leads');
  XLSX.writeFile(wb, filename + '.xlsx');
};

const exportLeadsPdf = async (list: Lead[], filename: string) => {
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a2' });
  doc.setFontSize(12);
  doc.text(`MaterialDepot — Leads (${list.length})`, 40, 30);
  autoTable(doc, {
    head: [CSV_HEADERS],
    body: list.map(leadToExportRow),
    startY: 44,
    styles: { fontSize: 6, cellPadding: 2, overflow: 'linebreak' },
    headStyles: { fillColor: [234, 179, 8], textColor: [255, 255, 255], fontSize: 6 },
    margin: { left: 20, right: 20 },
  });
  doc.save(filename + '.pdf');
};

const runLeadsExport = async (format: 'csv' | 'excel' | 'pdf', scope: 'all' | 'page') => {
  setExportMenuOpen(false);
  if (exporting) return;
  setExporting(true);
  try {
    const list = scope === 'all' ? await fetchAllFilteredLeads() : leads;
    if (!list.length) { alert('No leads to export.'); return; }
    const name = `materialdepot_leads_${scope === 'all' ? 'all' : 'page'}_${todayStr()}`;
    if (format === 'csv') exportLeadsCsv(list, name);
    else if (format === 'excel') await exportLeadsExcel(list, name);
    else await exportLeadsPdf(list, name);
  } catch (e: any) {
    console.error('Lead export failed:', e);
    alert('Export failed: ' + (e?.message || e));
  } finally {
    setExporting(false);
  }
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

      const [leadId, clientName, clientPhone, createdDate, assignedTo, branch, status, lostReason, cartItemsStr, cartValueStr, followUpDate, closureDate, remarksStr, visitsStr, clientTypeStr, propertyTypeStr, architectInvolvedStr, projectPhaseStr, leadPriorityStr] = fields;

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
      const projectPhase = (projectPhaseStr || '').trim();
      const leadPriority = (leadPriorityStr || '').trim().toLowerCase();
      const architectInvolvedRaw = (architectInvolvedStr || '').trim().toLowerCase();
      if (clientType && !CLIENT_TYPES.includes(clientType)) errors.push('Row ' + rowNum + ': Client Type "' + clientType + '" is not valid. Must be one of: ' + CLIENT_TYPES.join(', '));
      if (propertyType && !PROPERTY_TYPES.includes(propertyType) && !LEGACY_PROPERTY_TYPES.includes(propertyType)) errors.push('Row ' + rowNum + ': Property Type "' + propertyType + '" is not valid. Must be one of: ' + PROPERTY_TYPES.join(', '));
      if (projectPhase && !PROJECT_PHASES.includes(projectPhase)) errors.push('Row ' + rowNum + ': Project Phase "' + projectPhase + '" is not valid. Must be one of: ' + PROJECT_PHASES.join(', '));
      if (leadPriority && !LEAD_PRIORITIES.includes(leadPriority as typeof LEAD_PRIORITIES[number])) errors.push('Row ' + rowNum + ': Priority "' + leadPriorityStr + '" is not valid. Must be one of: ' + LEAD_PRIORITIES.join(', '));
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

      parsed.push({ leadId: leadId.trim(), clientName: clientName || '', clientPhone, createdAt: (createdDate ? parseDDMMYYYY(createdDate) : null) || todayStr(), assignedTo: assignedTo || '', branch: branch || (branches[0] || ''), status: status || STATUSES[0], lostReason: lostReason || '', cartItems, cartValue, followUpDate: followUpDate ? (parseDDMMYYYY(followUpDate) || '') : '', closureDate: closureDate ? (parseDDMMYYYY(closureDate) || '') : '', remarks, visits, clientType, propertyType, architectInvolved, projectPhase, leadPriority: (leadPriority as 'hot' | 'warm' | 'cold' | undefined) || undefined });
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
    projectPhase: row.projectPhase || '',
    leadPriority: (row.leadPriority as 'hot' | 'warm' | 'cold' | undefined) || undefined,
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
  setCsvImportCount(newLeads.length);
  setCsvPreview(null);
  setCsvSelected(new Set());
  setTimeout(() => setCsvImportCount(null), 3000);
};

const today = todayStr();


  return { handleCsvFile, importCsvLeads, runLeadsExport, today };
}
