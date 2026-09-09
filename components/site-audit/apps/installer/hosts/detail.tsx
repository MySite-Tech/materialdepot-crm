'use client';

import { Job } from '../types';
import { JobDetailScreen } from '../screens/job-detail';
import { Dispatch, SetStateAction } from 'react';

export function InstallerDetailHost({ SLOTS, activeJob, advBusy, advanceStatus, handleDownloadPdf, openJobCard, pdfBusy, rescheduleFollowUp, rescheduleOpen, rescheduleReason, setArrivalOpen, setAuditOpen, setCommentSheet, setRescheduleFollowUp, setRescheduleOpen, setRescheduleReason, setScreen, submitReschedule }: {
  SLOTS: Record<string, { label: string; start: number; }>;
  activeJob: Job;
  advBusy: boolean;
  advanceStatus: (job: Job, st: string, msg: string, logOverride?: string | null | undefined, extraLog?: Record<string, any> | undefined) => Promise<void>;
  handleDownloadPdf: (job: Job) => Promise<void>;
  openJobCard: (job: Job) => void;
  pdfBusy: boolean;
  rescheduleFollowUp: string;
  rescheduleOpen: boolean;
  rescheduleReason: string;
  setArrivalOpen: Dispatch<SetStateAction<boolean>>;
  setAuditOpen: Dispatch<SetStateAction<boolean>>;
  setCommentSheet: Dispatch<SetStateAction<{ title: string; onConfirm: (c: string) => void; } | null>>;
  setRescheduleFollowUp: Dispatch<SetStateAction<string>>;
  setRescheduleOpen: Dispatch<SetStateAction<boolean>>;
  setRescheduleReason: Dispatch<SetStateAction<string>>;
  setScreen: Dispatch<SetStateAction<"list" | "detail">>;
  submitReschedule: () => void;
}) {
  return (
    <JobDetailScreen
      job={activeJob}
      slots={SLOTS}
      advBusy={advBusy}
      pdfBusy={pdfBusy}
      rescheduleOpen={rescheduleOpen}
      rescheduleReason={rescheduleReason}
      rescheduleFollowUp={rescheduleFollowUp}
      onBack={() => { setScreen('list'); setRescheduleOpen(false); setRescheduleReason(''); setRescheduleFollowUp(''); }}
      onToCall={() => setCommentSheet({ title: 'Starting pre-install call', onConfirm: (c) => { setCommentSheet(null); advanceStatus(activeJob, 'callpending', 'Pre-install call started' + (c ? ' — ' + c : '')); } })}
      onYes={() => setCommentSheet({ title: 'Confirming on the way', onConfirm: (c) => { setCommentSheet(null); advanceStatus(activeJob, 'onway', "Installer on the way · customer confirmed" + (c ? ' — ' + c : '')); } })}
      onReached={() => setArrivalOpen(true)}
      onOpenJobCard={() => openJobCard(activeJob)}
      onTriggerReschedule={() => { setRescheduleReason(''); setRescheduleFollowUp(''); setRescheduleOpen(true); }}
      onCancelReschedule={() => { setRescheduleOpen(false); setRescheduleReason(''); setRescheduleFollowUp(''); }}
      onReasonChange={setRescheduleReason}
      onFollowUpChange={setRescheduleFollowUp}
      onSubmitReschedule={submitReschedule}
      onViewAudit={() => setAuditOpen(true)}
      onDownloadPdf={() => handleDownloadPdf(activeJob)}
    />
  );
}
