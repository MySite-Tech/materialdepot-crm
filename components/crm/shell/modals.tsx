'use client';

import { fetchLead, upsertLead } from '../../../lib/api/crm/lead-details';
import { AppUser, Lead, Remark } from '../../../types/crm';
import { CsvErrorsModal } from '../leads/csv/errors';
import { CsvPreviewModal } from '../leads/csv/preview';
import { KylasSyncModal } from '../leads/kylas-modal';
import { LeadDrawer } from '../leads/drawer';
import { DateEditPopup } from '../ui/prompts';
import { CsvRow, DateEditState } from '../types/crm';
import { Dispatch, SetStateAction } from 'react';

export function CrmModals({ addRemark, availableBMs, branches, csvErrors, csvPreview, csvSelected, currentUser, dateEditPopup, drawerLead, handleDateEditSave, handleKylasModalSync, importCsvLeads, kylasModalInput, kylasModalResult, leads, saveLead, setCsvErrors, setCsvPreview, setCsvSelected, setDateEditPopup, setDrawerLead, setKylasModalInput, setKylasModalResult, setLeads, setShowAddDrawer, setShowKylasModal, showAddDrawer, showKylasModal, showSaveError, visitsLoading }: {
  addRemark: (leadId: string, ticketId: number, remark: Remark) => void;
  availableBMs: string[];
  branches: string[];
  csvErrors: string[] | null;
  csvPreview: CsvRow[] | null;
  csvSelected: Set<number>;
  currentUser: AppUser;
  dateEditPopup: DateEditState | null;
  drawerLead: Lead | null;
  handleDateEditSave: (newDate: string, remarkText: string) => void;
  handleKylasModalSync: () => Promise<void>;
  importCsvLeads: () => void;
  kylasModalInput: string;
  kylasModalResult: { loading?: boolean | undefined; ok?: boolean | undefined; msg?: string | undefined; link?: string | undefined; } | null;
  leads: Lead[];
  saveLead: (formData: Lead) => void;
  setCsvErrors: Dispatch<SetStateAction<string[] | null>>;
  setCsvPreview: Dispatch<SetStateAction<CsvRow[] | null>>;
  setCsvSelected: Dispatch<SetStateAction<Set<number>>>;
  setDateEditPopup: Dispatch<SetStateAction<DateEditState | null>>;
  setDrawerLead: Dispatch<SetStateAction<Lead | null>>;
  setKylasModalInput: Dispatch<SetStateAction<string>>;
  setKylasModalResult: Dispatch<SetStateAction<{ loading?: boolean | undefined; ok?: boolean | undefined; msg?: string | undefined; link?: string | undefined; } | null>>;
  setLeads: Dispatch<SetStateAction<Lead[]>>;
  setShowAddDrawer: Dispatch<SetStateAction<boolean>>;
  setShowKylasModal: Dispatch<SetStateAction<boolean>>;
  showAddDrawer: boolean;
  showKylasModal: boolean;
  showSaveError: (msg?: string) => void;
  visitsLoading: boolean;
}) {
  return (
    <>
          {(showAddDrawer || drawerLead) && (
      <LeadDrawer
        lead={drawerLead ? (leads.find((l) => l.id === drawerLead.id) || drawerLead) : null}
        currentUser={currentUser}
        branches={branches}
        users={availableBMs.map(name => ({ id: name, name }))}
        onSave={saveLead}
        onClose={() => { setDrawerLead(null); setShowAddDrawer(false); }}
        onAddRemark={drawerLead ? (remark: Remark) => addRemark(drawerLead.id, drawerLead.ticketId!, remark) : undefined}
        visitsLoading={visitsLoading}
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
    
    {showKylasModal && (
      <KylasSyncModal
      handleKylasModalSync={handleKylasModalSync}
      kylasModalInput={kylasModalInput}
      kylasModalResult={kylasModalResult}
      setKylasModalInput={setKylasModalInput}
      setKylasModalResult={setKylasModalResult}
      setShowKylasModal={setShowKylasModal}
    />
    )}
    
    {csvErrors && (
      <CsvErrorsModal
      csvErrors={csvErrors}
      setCsvErrors={setCsvErrors}
    />
    )}
    
    {csvPreview && (
      <CsvPreviewModal
      csvPreview={csvPreview}
      csvSelected={csvSelected}
      importCsvLeads={importCsvLeads}
      setCsvPreview={setCsvPreview}
      setCsvSelected={setCsvSelected}
    />
    )}
    </>
  );
}
