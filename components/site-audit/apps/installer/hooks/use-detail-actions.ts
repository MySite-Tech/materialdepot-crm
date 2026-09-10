'use client';

import { sbGet } from '../../../shared/sb-client';
import { Job } from '../types';
import { ActingAs } from '../../types/auditor';
import { genInstallerPDF } from '../utils/pdf';
import { Dispatch, SetStateAction, useCallback } from 'react';

export function useDetailActions({ actingAs, activeJob, advanceStatus, rescheduleFollowUp, rescheduleReason, setActiveKey, setPdfBusy, setRescheduleFollowUp, setRescheduleOpen, setRescheduleReason, setScreen, toast }: {
  actingAs: ActingAs;
  activeJob: Job | null;
  advanceStatus: (job: Job, st: string, msg: string, logOverride?: string | null | undefined, extraLog?: Record<string, any> | undefined) => Promise<void>;
  rescheduleFollowUp: string;
  rescheduleReason: string;
  setActiveKey: Dispatch<SetStateAction<string | null>>;
  setPdfBusy: Dispatch<SetStateAction<boolean>>;
  setRescheduleFollowUp: Dispatch<SetStateAction<string>>;
  setRescheduleOpen: Dispatch<SetStateAction<boolean>>;
  setRescheduleReason: Dispatch<SetStateAction<string>>;
  setScreen: Dispatch<SetStateAction<"list" | "detail">>;
  toast: (msg: string) => void;
}) {
const openDetail = useCallback((key: string) => {
  setActiveKey(key);
  setScreen('detail');
  setRescheduleOpen(false);
  setRescheduleReason('');
  setRescheduleFollowUp('');
}, []);

const handleDownloadPdf = useCallback(async (job: Job) => {
  setPdfBusy(true);
  try {
    const rows = await sbGet('install_orders?id=eq.' + job.id + '&select=subjobs');
    let jobcard = job.jobcard;
    if (Array.isArray(rows) && rows[0]) {
      const sj = (rows[0].subjobs || []).find((s: any) => s.id === job.sjId);
      if (sj && sj.jobcard) jobcard = sj.jobcard;
    }
    if (!jobcard) toast('Job card not available');
    else {
      try { await genInstallerPDF({ ...job, jobcard }, actingAs.name); }
      catch (e) { console.error('PDF:', e); toast('PDF generation failed — try again'); }
    }
  } finally {
    setPdfBusy(false);
  }
}, [actingAs.name, toast]);

const submitReschedule = useCallback(() => {
  const reason = rescheduleReason.trim();
  const followUp = rescheduleFollowUp.trim();
  if (!reason) { toast('Please enter a reason for rescheduling'); return; }
  if (!activeJob) return;
  setRescheduleOpen(false);
  setRescheduleReason('');
  setRescheduleFollowUp('');
  advanceStatus(activeJob, 'reschedule', 'Sent to office to reschedule', 'Reschedule requested: ' + reason + (followUp ? ' · Follow-up: ' + followUp : ''));
}, [activeJob, advanceStatus, rescheduleFollowUp, rescheduleReason, toast]);


  return { handleDownloadPdf, openDetail, submitReschedule };
}
