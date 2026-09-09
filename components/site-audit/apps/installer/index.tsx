'use client';

import { useDetailActions } from './use-detail-actions';
import { useJobCardState } from './use-jobcard-state';

import { InstallerDetailHost } from './detail-host';
import { InstallerJobCardHost } from './jobcard-host';
import { InstallerListHost } from './list-host';
import { useInstallerFlow } from './use-installer-flow';

import { DEFAULT_LOG_MESSAGES, INSTALL_STATUS } from '../../constants/installer';
import { AuditReportOverlay } from './job-detail';
import { genAuditReportPDF } from './pdf';
import { ActingAs, Job, JobCard, LogEntry, Room } from '../../types/installer';
import { CommentSheet } from './ui';
import { addDays, buildSlots, dstr, itemQtyDisplay, rollupStatus, statusForInstaller, today } from '../../utils/installer';
import { ArrivalCameraModal, DocScannerModal, SignaturePadHandle, useLocationTracking } from '@/components/site-audit/apps/fieldAppShared';
import { typeLabel } from '@/components/site-audit/data/auditRegistry';
import { confirmServicePerformed, retryQueuedServiceConfirms } from '@/components/site-audit/data/omsService';
import { sbGet, sbPatch } from '@/components/site-audit/siteAuditShared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

export default function SiteInstallerApp({ actingAs }: { actingAs: ActingAs }) {
  const SLOTS = useMemo(() => buildSlots(), []);
  const days = useMemo(() => Array.from({ length: 37 }, (_, i) => addDays(today, i - 30)), []);
  const todayStr = dstr(today);

  const [installerType, setInstallerType] = useState<string>('flooring');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selDay, setSelDay] = useState(todayStr);
  const [screen, setScreen] = useState<'list' | 'detail'>('list');
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [jobCardOpen, setJobCardOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [rescheduleFollowUp, setRescheduleFollowUp] = useState('');
  const [advBusy, setAdvBusy] = useState(false);
  const advBusyRef = useRef(false);
  const [arrivalOpen, setArrivalOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [commentSheet, setCommentSheet] = useState<{ title: string; onConfirm: (c: string) => void } | null>(null);
  const [locDenied, setLocDenied] = useState(false);

  const [toastMsg, setToastMsg] = useState('');
  const [toastShow, setToastShow] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    setToastShow(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastShow(false), 2200);
  }, []);

  const location = useLocationTracking(actingAs.email);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await sbGet('profiles?email=eq.' + encodeURIComponent(actingAs.email) + '&select=installer_type&limit=1');
        if (!alive) return;
        if (Array.isArray(rows) && rows[0] && rows[0].installer_type) setInstallerType(rows[0].installer_type);
      } catch {
        /* keep default */
      }
    })();
    return () => { alive = false; };
  }, [actingAs.email]);

  const loadJobs = useCallback(async () => {
    try {
      const rows = await sbGet('install_orders_slim?select=*&status=not.in.(pending,deliv_ontime,deliv_delayed,deleted)&order=created_at.desc');
      if (!Array.isArray(rows)) return;
      setJobs((prevJobs) => {
        const existing: Record<string, JobCard> = {};
        prevJobs.forEach((j) => { if (j.jobcard) existing[j.pi + '|' + j.sjId] = j.jobcard; });
        const newJobs: Job[] = [];
        rows.forEach((r: any) => {
          (r.subjobs || []).forEach((sj: any) => {
            const myAssign = (sj.assignments || []).find((a: any) => a.installer_email === actingAs.email);
            const legacyMatch = !(sj.assignments && sj.assignments.length) && sj.installer_email === actingAs.email;
            if (myAssign || legacyMatch) {
              const aDate: string | null = myAssign ? (myAssign.mode === 'custom' ? (myAssign.dates && myAssign.dates[0]) || null : myAssign.date || null) : sj.date || null;
              const aSlots: string[] = myAssign ? myAssign.slots || [] : sj.slot ? [sj.slot] : [];
              const isPrimary: boolean = myAssign
                ? myAssign.primary === true || (!sj.assignments.some((a: any) => a.primary) && sj.assignments.indexOf(myAssign) === 0)
                : true;

              const myStatus = statusForInstaller(sj, actingAs.email);
              newJobs.push({
                id: r.id,
                sjId: sj.id,
                pi: r.pi || '',
                name: r.customer_name || '',
                phone: r.phone || '',
                addr: r.addr || '',
                bm: r.bm || '',
                type: sj.type || 'flooring',
                date: aDate,
                slot: aSlots[0] || null,
                slots: aSlots,
                status: myStatus,
                storedStatus: myStatus,
                sku: (sj.items || []).map((it: any) => ({ code: it.sku || '', skuName: it.name || it.num || '', link: it.link || '', qty: itemQtyDisplay(it, sj.type === 'wallpaper') })),
                auditBy: (r.service && r.service.audit_by) || null,
                jobcard: existing[r.pi + '|' + sj.id] || sj.jobcard || null,
                parentLog: r.log || [],
                isPrimary,
              });
            }
          });
        });
        return newJobs;
      });
    } catch (e) {
      console.error('loadJobs', e);
    }
  }, [actingAs.email]);

  const displayJobs = useMemo<Job[]>(() => {
    const now = new Date();
    return jobs.map((o) => {
      if (o.status === 'scheduled' && o.date === todayStr) {
        let startH: number | undefined;
        const slotDef = o.slot ? SLOTS[o.slot] : undefined;
        if (slotDef) startH = slotDef.start;
        else if (o.slot && /^\d{1,2}:\d{2}$/.test(o.slot)) {
          const [h, m] = o.slot.split(':').map(Number);
          startH = h + m / 60;
        } else return o;
        const start = new Date(today);
        start.setHours(Math.floor(startH), Math.round((startH % 1) * 60), 0, 0);

        if (now >= new Date(start.getTime() - 3 * 3600 * 1000)) return { ...o, status: 'callpending' };
      }
      return o;
    });
  }, [jobs, SLOTS, todayStr]);

  const activeJob = useMemo<Job | null>(() => {
    if (!activeKey) return null;
    return displayJobs.find((j) => j.pi + '|' + j.sjId === activeKey) || null;
  }, [activeKey, displayJobs]);

  useEffect(() => {
    loadJobs();

    retryQueuedServiceConfirms();
    location.start(null);
    const pollId = setInterval(() => { if (!document.hidden) loadJobs(); }, 30000);
    const onVis = () => { if (!document.hidden) loadJobs(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(pollId);
      document.removeEventListener('visibilitychange', onVis);
      location.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadJobs]);

  useEffect(() => {
    if (!navigator.permissions) return;
    let sub: PermissionStatus | null = null;
    navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((r) => {
      sub = r;
      const upd = () => setLocDenied(r.state === 'denied');
      upd();
      r.onchange = upd;
    }).catch(() => {});
    return () => { if (sub) sub.onchange = null; };
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const dayStripRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const strip = dayStripRef.current;
    if (!strip) return;
    const sel = strip.querySelector('[data-selected="true"]') as HTMLElement | null;
    if (sel) strip.scrollLeft = Math.max(0, sel.offsetLeft - strip.clientWidth / 2 + sel.offsetWidth / 2);
  }, [selDay]);

  const advanceStatus = useCallback(async (job: Job, st: string, msg: string, logOverride?: string | null, extraLog?: Record<string, any>) => {

    if (advBusyRef.current) return;
    advBusyRef.current = true;
    setAdvBusy(true);
    const logMsg = logOverride || DEFAULT_LOG_MESSAGES[st] || st;
    try {
      if (job.id && job.sjId) {
        const parentRows = await sbGet('install_orders?id=eq.' + job.id + '&select=subjobs,log,status,po');
        if (!Array.isArray(parentRows) || !parentRows[0]) { toast('Job not found — please refresh'); return; }
        const parent = parentRows[0];
        const subjobs = parent.subjobs || [];
        const sj = subjobs.find((s: any) => s.id === job.sjId);
        if (!sj) { toast('Job not found — please refresh'); return; }

        const curStatus = statusForInstaller(sj, actingAs.email);
        if (curStatus !== job.storedStatus) {
          const label = (INSTALL_STATUS[curStatus] || { label: curStatus }).label;
          toast('The office moved this job to "' + label + '" — showing the latest now');
          await loadJobs();
          return;
        }
        const dbSt = st === 'scheduled' ? 'assigned' : st;
        if (sj.assignments && sj.assignments.length) {
          const myA = sj.assignments.find((a: any) => a.installer_email === actingAs.email);
          if (myA) myA.status = dbSt; else sj.status = dbSt;
          const amPrimary = myA && (myA.primary === true || (!sj.assignments.some((a: any) => a.primary) && sj.assignments.indexOf(myA) === 0));
          if (amPrimary) sj.status = dbSt;
        } else {
          sj.status = dbSt;
        }
        const freshLog: LogEntry[] = Array.isArray(parent.log) ? [...parent.log] : [];
        freshLog.push({ t: logMsg, d: new Date().toISOString(), by: 'auto', who: actingAs.name, ...(extraLog || {}) });
        const parentStatus = rollupStatus(subjobs, parent.status || 'scheduled');
        await sbPatch('install_orders', job.id, { subjobs, status: parentStatus, log: freshLog });

        if (parentStatus === 'completed') {
          try {
            await confirmServicePerformed(parent.po, 'Installation completed by ' + actingAs.name);
          } catch {}
        }
      }
      if (st === 'atsite') location.start(job.pi);
      else if (st === 'completed' || st === 'reschedule') location.stop();
      await loadJobs();
      toast(msg);
    } catch {
      toast('Network error — try again');
    } finally {
      advBusyRef.current = false;
      setAdvBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actingAs.email, actingAs.name, loadJobs, location, toast]);

  const jcJobRef = useRef<Job | null>(null);
  const jcSeqRef = useRef(0);
  const jcRoomsRef = useRef<Room[]>([]);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveSeqRef = useRef(0);
  const completionWriteRef = useRef<{ subjobs: any[] } | null>(null);

  const hadSignRef = useRef(false);
  const [hadSign, setHadSign] = useState(false);

  const [jcRooms, setJcRooms] = useState<Room[]>([]);
  const [jcStage, setJcStage] = useState<'rooms' | 'review' | 'handoff' | 'tcs' | 'signature' | 'installerSignoff'>('rooms');
  const [signName, setSignName] = useState('');

  const [customerSignImg, setCustomerSignImg] = useState<string | null>(null);
  const [installerSignName, setInstallerSignName] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'local'>('idle');
  const [scanTargetRoomId, setScanTargetRoomId] = useState<number | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [finishBusy, setFinishBusy] = useState(false);
  const signPadRef = useRef<SignaturePadHandle | null>(null);

  const { addPhotoToRoom, finishCard, handleAddRoom, handleFilesForRoom, handleJcBack, openJobCard, removePhotoFromRoom, removeRoom, updateRoomCategory, updateRoomField, updateRoomInstallField } = useJobCardState({ autosaveSeqRef, autosaveTimerRef, completionWriteRef, hadSignRef, jcJobRef, jcRooms, jcRoomsRef, jcSeqRef, setHadSign, setJcRooms, setJcStage, setJobCardOpen, setJobs, setSaveStatus, setScreen, toast });
  const { finishInstallation, markAdditionalComplete, onSignNext } = useInstallerFlow({ actingAs, autosaveSeqRef, autosaveTimerRef, completionWriteRef, customerSignImg, hadSignRef, installerSignName, jcJobRef, jcRoomsRef, loadJobs, setActiveKey, setCustomerSignImg, setFinishBusy, setHadSign, setInstallerSignName, setJcStage, setJobCardOpen, setScreen, signName, signPadRef, toast });

  const [auditState, setAuditState] = useState<{ loading: boolean; error: 'none' | 'network' | null; ticked: any; auditorName: string | null; date: string | null }>({ loading: true, error: null, ticked: null, auditorName: null, date: null });

  useEffect(() => {
    if (!auditOpen || !activeJob) return;
    let alive = true;
    setAuditState({ loading: true, error: null, ticked: null, auditorName: null, date: null });
    (async () => {
      try {
        const rows = await sbGet('audit_orders?phone=eq.' + encodeURIComponent(activeJob.phone) + '&status=eq.completed&order=created_at.desc&limit=1&select=audit_ticked,auditor_name,date');
        if (!alive) return;
        const row = Array.isArray(rows) ? rows[0] : null;
        const a = row && row.audit_ticked ? row.audit_ticked : null;
        if (!a || !a.rooms || !a.rooms.length) { setAuditState({ loading: false, error: 'none', ticked: null, auditorName: null, date: null }); return; }
        setAuditState({ loading: false, error: null, ticked: a, auditorName: row.auditor_name || null, date: row.date || null });
      } catch {
        if (alive) setAuditState({ loading: false, error: 'network', ticked: null, auditorName: null, date: null });
      }
    })();
    return () => { alive = false; };
  }, [auditOpen, activeJob]);

  const { handleDownloadPdf, openDetail, submitReschedule } = useDetailActions({ actingAs, activeJob, advanceStatus, rescheduleFollowUp, rescheduleReason, setActiveKey, setPdfBusy, setRescheduleFollowUp, setRescheduleOpen, setRescheduleReason, setScreen, toast });

  const list = useMemo(() => displayJobs.filter((j) => j.date === selDay).sort((a, b) => (a.slot || '').localeCompare(b.slot || '')), [displayJobs, selDay]);
  const todo = useMemo(() => list.filter((j) => j.status !== 'completed'), [list]);
  const done = useMemo(() => list.filter((j) => j.status === 'completed'), [list]);
  const unscheduled = useMemo(() => displayJobs.filter((j) => !j.date && !['completed', 'reschedule'].includes(j.status)), [displayJobs]);
  const overdue = useMemo(() => (selDay === todayStr ? displayJobs.filter((j) => j.date && j.date < todayStr && !['completed', 'reschedule'].includes(j.status)) : []), [displayJobs, selDay, todayStr]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-black">My Installations</h1>
          <p className="text-[13px] text-gray-500">{actingAs.name} · {typeLabel(installerType)} Installer</p>
        </div>
      </div>

      {locDenied && (
        <div className="mb-4 rounded-md bg-red-700 px-4 py-2.5 text-center text-[13px] font-semibold text-white">
          ⚠ Location access is blocked. Enable location permission so the office can track you at site.
        </div>
      )}

      {screen === 'list' && (
        <InstallerListHost
        SLOTS={SLOTS}
        dayStripRef={dayStripRef}
        days={days}
        displayJobs={displayJobs}
        done={done}
        openDetail={openDetail}
        overdue={overdue}
        selDay={selDay}
        setSelDay={setSelDay}
        todayStr={todayStr}
        todo={todo}
        unscheduled={unscheduled}
      />
      )}

      {screen === 'detail' && activeJob && (
        <InstallerDetailHost
        SLOTS={SLOTS}
        activeJob={activeJob}
        advBusy={advBusy}
        advanceStatus={advanceStatus}
        handleDownloadPdf={handleDownloadPdf}
        openJobCard={openJobCard}
        pdfBusy={pdfBusy}
        rescheduleFollowUp={rescheduleFollowUp}
        rescheduleOpen={rescheduleOpen}
        rescheduleReason={rescheduleReason}
        setArrivalOpen={setArrivalOpen}
        setAuditOpen={setAuditOpen}
        setCommentSheet={setCommentSheet}
        setRescheduleFollowUp={setRescheduleFollowUp}
        setRescheduleOpen={setRescheduleOpen}
        setRescheduleReason={setRescheduleReason}
        setScreen={setScreen}
        submitReschedule={submitReschedule}
      />
      )}

      {auditOpen && activeJob && (
        <AuditReportOverlay
          job={activeJob}
          state={auditState}
          onClose={() => setAuditOpen(false)}
          onDownload={() => {
            if (!auditState.ticked) return;
            genAuditReportPDF({ pi: activeJob.pi, name: activeJob.name, phone: activeJob.phone, addr: activeJob.addr, bm: activeJob.bm, date: auditState.date }, auditState.ticked);
          }}
        />
      )}

      {jobCardOpen && jcJobRef.current && (
        <InstallerJobCardHost
        actingAs={actingAs}
        finishBusy={finishBusy}
        finishCard={finishCard}
        finishInstallation={finishInstallation}
        hadSign={hadSign}
        handleAddRoom={handleAddRoom}
        handleFilesForRoom={handleFilesForRoom}
        handleJcBack={handleJcBack}
        installerSignName={installerSignName}
        jcJobRef={jcJobRef}
        jcRooms={jcRooms}
        jcStage={jcStage}
        markAdditionalComplete={markAdditionalComplete}
        onSignNext={onSignNext}
        removePhotoFromRoom={removePhotoFromRoom}
        removeRoom={removeRoom}
        saveStatus={saveStatus}
        setInstallerSignName={setInstallerSignName}
        setJcStage={setJcStage}
        setLightboxSrc={setLightboxSrc}
        setScanTargetRoomId={setScanTargetRoomId}
        setSignName={setSignName}
        signName={signName}
        signPadRef={signPadRef}
        updateRoomCategory={updateRoomCategory}
        updateRoomField={updateRoomField}
        updateRoomInstallField={updateRoomInstallField}
      />
      )}

      <ArrivalCameraModal
        open={arrivalOpen}
        onClose={() => setArrivalOpen(false)}
        onConfirm={({ photo, lat, lng }) => {
          setArrivalOpen(false);
          if (!activeJob) return;
          const extra: Record<string, any> = {};
          if (photo) extra.arrivalPhoto = photo;
          const haveFix = lat != null && lng != null;
          if (haveFix) { extra.lat = lat; extra.lng = lng; }
          /* House style is soft-gate-and-surface: a dead GPS must never stop a
             worker who is standing at the site, but the office has to be able to
             see that the arrival wasn't verified rather than assume it was. */
          else extra.locOverride = true;
          advanceStatus(
            activeJob, 'atsite', 'You are at the site',
            haveFix ? null : 'Installer arrived at site ⚠ (no location captured)',
            extra,
          );
        }}
      />

      <DocScannerModal
        open={scanTargetRoomId !== null}
        onClose={() => setScanTargetRoomId(null)}
        onScanned={(url) => {
          if (scanTargetRoomId !== null) addPhotoToRoom(scanTargetRoomId, url);
          setScanTargetRoomId(null);
        }}
      />

      <CommentSheet
        open={commentSheet !== null}
        title={commentSheet?.title || ''}
        onCancel={() => setCommentSheet(null)}
        onConfirm={(c) => commentSheet?.onConfirm(c)}
      />

      {lightboxSrc && (
        <div className="fixed inset-0 z-[950] flex cursor-pointer items-center justify-center bg-black/90" onClick={() => setLightboxSrc(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightboxSrc} alt="" className="max-h-[94vh] max-w-[94vw] rounded-lg object-contain" />
        </div>
      )}

      <div className={`fixed bottom-6 left-1/2 z-[1000] -translate-x-1/2 rounded-md bg-gray-900 px-4 py-2.5 text-[13px] font-medium text-white shadow-lg transition-opacity duration-300 ${toastShow ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
        {toastMsg}
      </div>
    </div>
  );
}
