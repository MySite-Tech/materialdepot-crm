'use client';

import { typeLabel } from '../../data/auditRegistry';
import { confirmServicePerformed } from '../../data/omsService';
import { uploadPhoto } from '../../shared/photos';
import { sbGet, sbPatch, sbPatchLong } from '../../shared/sbClient';
import { Job, JobCard, LogEntry, Room } from '../../types/installer';
import { collectRooms, rollupStatus, subjobEffectiveStatus } from '../../utils/installer';
import { ActingAs } from '../SiteAuditorApp';
import { SignaturePadHandle } from '../fieldAppShared';
import { genInstallerPDF } from './pdf';
import { Dispatch, RefObject, SetStateAction, useCallback } from 'react';

export function useInstallerFlow({ actingAs, autosaveSeqRef, autosaveTimerRef, completionWriteRef, customerSignImg, hadSignRef, installerSignName, jcJobRef, jcRoomsRef, loadJobs, setActiveKey, setCustomerSignImg, setFinishBusy, setHadSign, setInstallerSignName, setJcStage, setJobCardOpen, setScreen, signName, signPadRef, toast }: {
  actingAs: ActingAs;
  autosaveSeqRef: RefObject<number>;
  autosaveTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  completionWriteRef: RefObject<{ subjobs: any[]; } | null>;
  customerSignImg: string | null;
  hadSignRef: RefObject<boolean>;
  installerSignName: string;
  jcJobRef: RefObject<Job | null>;
  jcRoomsRef: RefObject<Room[]>;
  loadJobs: () => Promise<void>;
  setActiveKey: Dispatch<SetStateAction<string | null>>;
  setCustomerSignImg: Dispatch<SetStateAction<string | null>>;
  setFinishBusy: Dispatch<SetStateAction<boolean>>;
  setHadSign: Dispatch<SetStateAction<boolean>>;
  setInstallerSignName: Dispatch<SetStateAction<string>>;
  setJcStage: Dispatch<SetStateAction<"rooms" | "review" | "handoff" | "tcs" | "signature" | "installerSignoff">>;
  setJobCardOpen: Dispatch<SetStateAction<boolean>>;
  setScreen: Dispatch<SetStateAction<"list" | "detail">>;
  signName: string;
  signPadRef: RefObject<SignaturePadHandle | null>;
  toast: (msg: string) => void;
}) {
const markAdditionalComplete = useCallback(async () => {
  const job = jcJobRef.current;
  if (!job) return;
  if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null; }
  autosaveSeqRef.current++;
  const rooms = collectRooms(jcRoomsRef.current);
  const newJobcard: JobCard = { rooms };
  setFinishBusy(true);
  toast('Saving...');
  try {
    const parentRows = await sbGet('install_orders?id=eq.' + job.id + '&select=subjobs,log,status,po');
    if (Array.isArray(parentRows) && parentRows[0]) {
      const subjobs = parentRows[0].subjobs || [];
      const sj = subjobs.find((s: any) => s.id === job.sjId);
      if (sj) {
        if (sj.assignments && sj.assignments.length) {
          const myA = sj.assignments.find((a: any) => a.installer_email === actingAs.email);
          if (myA) myA.status = 'completed';
          sj.jobcard = newJobcard;

          sj.status = subjobEffectiveStatus(sj);
        } else {
          sj.status = 'completed';
          sj.jobcard = newJobcard;
        }
      }
      const freshLog: LogEntry[] = Array.isArray(parentRows[0].log) ? [...parentRows[0].log] : [];
      freshLog.push({ t: typeLabel(job.type) + ' installation done (additional installer: ' + actingAs.name + ')', d: new Date().toISOString(), by: 'auto' });
      const parentStatus = rollupStatus(subjobs, parentRows[0].status || 'completed');
      await sbPatch('install_orders', job.id, { subjobs, status: parentStatus, log: freshLog });
      try { localStorage.removeItem('md_install_' + job.pi + '_' + job.sjId); } catch { /* ignore */ }

      if (parentStatus === 'completed') {
        try {
          await confirmServicePerformed(parentRows[0].po, 'Installation completed by ' + actingAs.name);
        } catch {}
      }
    }
  } catch {
    toast("Network error — couldn't save. Try again");
    setFinishBusy(false);
    return;
  }
  await loadJobs();
  setJobCardOpen(false);
  setScreen('detail');
  setActiveKey(job.pi + '|' + job.sjId);
  toast('Your part marked complete');
  setFinishBusy(false);
}, [actingAs.email, actingAs.name, loadJobs, toast]);

const onSignNext = useCallback(async () => {
  if (signPadRef.current!.isEmpty()) { toast("Please take the customer's signature"); return; }
  const rawSig = signPadRef.current!.export();
  let sigImg = rawSig;
  try { sigImg = await uploadPhoto(rawSig); } catch { /* keep raw captured data URL */ }
  setCustomerSignImg(sigImg);
  signPadRef.current!.clear();
  setInstallerSignName(actingAs.name);
  setJcStage('installerSignoff');
}, [actingAs.name, toast]);

const finishInstallation = useCallback(async () => {
  const job = jcJobRef.current;
  if (!job) return;
  if (signPadRef.current!.isEmpty()) { toast('Please add the installer signature'); return; }
  if (autosaveTimerRef.current) { clearTimeout(autosaveTimerRef.current); autosaveTimerRef.current = null; }
  autosaveSeqRef.current++;
  const rooms = collectRooms(jcRoomsRef.current);
  const rawInstallerSig = signPadRef.current!.export();
  let installerSigImg = rawInstallerSig;
  try { installerSigImg = await uploadPhoto(rawInstallerSig); } catch { /* keep raw captured data URL */ }
  const newJobcard: JobCard = {
    rooms,
    sign: { img: customerSignImg || '', name: signName, tcCategories: [job.type] },
    installerSign: { img: installerSigImg, name: installerSignName },
  };
  job.jobcard = newJobcard;
  const newParentLog = [...(job.parentLog || []), { t: typeLabel(job.type) + ' installation completed', d: new Date().toISOString(), by: 'auto', who: actingAs.name }];
  setFinishBusy(true);
  toast('Saving...');
  try {
    const parentRows = await sbGet('install_orders?id=eq.' + job.id + '&select=subjobs,log,status,po');
    if (Array.isArray(parentRows) && parentRows[0]) {
      const subjobs = parentRows[0].subjobs || [];
      const sj = subjobs.find((s: any) => s.id === job.sjId);
      if (sj) {
        if (sj.assignments && sj.assignments.length) {
          const myA = sj.assignments.find((a: any) => a.installer_email === actingAs.email);
          if (myA) myA.status = 'completed';
          sj.status = 'completed';
        } else {
          sj.status = 'completed';
        }
        sj.jobcard = newJobcard;
      }
      const parentStatus = rollupStatus(subjobs, parentRows[0].status || 'completed');
      await sbPatch('install_orders', job.id, { status: parentStatus, log: newParentLog });

      if (parentStatus === 'completed') {
        try {
          await confirmServicePerformed(parentRows[0].po, 'Installation completed by ' + actingAs.name);
        } catch {}
      }
      const completionPatch = { subjobs };
      completionWriteRef.current = completionPatch;
      await sbPatchLong('install_orders', job.id, completionPatch);
      hadSignRef.current = true;
      setHadSign(true);
      job.parentLog = newParentLog;
      try { localStorage.removeItem('md_install_' + job.pi + '_' + job.sjId); } catch { /* ignore */ }
    }
  } catch {
    toast("Network error — couldn't save. Try again");
    setFinishBusy(false);
    return;
  }

  try { await genInstallerPDF(job, actingAs.name); } catch (e) { console.error('PDF:', e); }
  await loadJobs();
  setJobCardOpen(false);
  setScreen('detail');
  setActiveKey(job.pi + '|' + job.sjId);
  toast('Job finished & sent to office');
  setFinishBusy(false);
}, [actingAs.email, actingAs.name, signName, customerSignImg, installerSignName, loadJobs, toast]);


  return { finishInstallation, markAdditionalComplete, onSignNext };
}
