'use client';

import { WizardSetupPhase } from './wizard-setup';

import { archiveAuditTicked } from '../data';
import { genPDF } from '../utils/pdf';
import { ActingAs, LogEntry, Order, Room, RoomPatch, SignData, WizardPhase } from '../../types/auditor';
import { Spinner } from '../ui';
import { draftPayload, dstr, initialCategory, makeRoom, normalizeRestoredRoom, saveStatusDisplay, serializeRoom, todayMidnight } from '../utils';
import { LocationTracker, SignaturePadHandle } from '@/components/site-audit/apps/field-app-shared';
import { adjMissingPhoto, adjMissingReason, categoryFor } from '@/components/site-audit/data/audit-registry';
import { confirmServicePerformed } from '@/components/site-audit/data/oms-service';
import { sbGet, sbPatch, sbPatchLong, uploadPhoto } from '@/components/site-audit/shared';
import { cn } from '@/lib/utils';
import { useCallback, useEffect, useRef, useState } from 'react';

export function JobCardWizard({
  order,
  actingAs,
  onBack,
  onCompleted,
  onDone,
  showToast,
  locationTracker,
}: {
  order: Order;
  actingAs: ActingAs;
  onBack: (draftRooms: Room[]) => void;
  onCompleted: (updatedOrder: Order) => void;
  onDone: () => void;
  showToast: (m: string) => void;
  locationTracker: LocationTracker;
}) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [phase, setPhase] = useState<WizardPhase>('rooms');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'local'>('idle');
  const [tcAgree, setTcAgree] = useState(false);
  const [signName, setSignName] = useState(order.name);
  const [completing, setCompleting] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  const seqRef = useRef(0);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autosaveSeqRef = useRef(0);
  const completionWriteRef = useRef<{ audit_ticked: any } | null>(null);
  const skipNextAutosave = useRef(true);

  const hadSignRef = useRef(false);
  const [hadSign, setHadSign] = useState(false);
  const signPadRef = useRef<SignaturePadHandle>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      let restoredRooms: any[] | null = null;

      let signedTicked: any = null;
      if (order.id) {
        try {
          const r = await sbGet('audit_orders?id=eq.' + order.id + '&select=audit_ticked');
          if (Array.isArray(r) && r[0]?.audit_ticked && !Array.isArray(r[0].audit_ticked)) {
            const ticked = r[0].audit_ticked;
            if (ticked.sign && !ticked.draft && ticked.rooms?.length) signedTicked = ticked;
            else if (ticked.rooms?.length && !order.jobcard) restoredRooms = ticked.rooms;
          }
        } catch {}
      }
      if (signedTicked) {
        hadSignRef.current = true;
        restoredRooms = signedTicked.rooms;
        void archiveAuditTicked(order.id, signedTicked, 'backfill-on-reopen');
      } else {
        try {
          const raw = localStorage.getItem('md_audit_' + order.pi);
          if (raw) {
            const d = JSON.parse(raw);
            if (d?.rooms?.length) restoredRooms = d.rooms;
          }
        } catch {}
      }
      if (!restoredRooms && order.jobcard?.rooms?.length) restoredRooms = order.jobcard.rooms;
      if (!alive) return;
      setHadSign(hadSignRef.current);
      if (restoredRooms && restoredRooms.length) {
        const withIds = restoredRooms.map((r) => normalizeRestoredRoom(r, ++seqRef.current));
        setRooms(withIds);
      } else {
        setRooms([makeRoom(++seqRef.current, initialCategory(order))]);
      }
      skipNextAutosave.current = true;
      setInitialized(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.pi]);

  useEffect(() => {
    if (!initialized) return;
    if (skipNextAutosave.current) {
      skipNextAutosave.current = false;
      return;
    }
    try {
      localStorage.setItem('md_audit_' + order.pi, JSON.stringify({ rooms: rooms.map(serializeRoom), ts: Date.now() }));
    } catch {}
    setSaveStatus('saving');
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    const mySeq = ++autosaveSeqRef.current;
    autosaveTimerRef.current = setTimeout(async () => {
      if (autosaveSeqRef.current !== mySeq) return;
      if (completionWriteRef.current) {
        setSaveStatus('saved');
        return;
      }
      if (!order.id) {
        setSaveStatus('local');
        return;
      }

      if (hadSignRef.current) {
        setSaveStatus('local');
        return;
      }
      try {
        const draftRooms = draftPayload(rooms);
        if (autosaveSeqRef.current !== mySeq || completionWriteRef.current) return;
        await sbPatch('audit_orders', order.id, { audit_ticked: { draft: true, rooms: draftRooms } });
        if (completionWriteRef.current) {
          try {
            await sbPatchLong('audit_orders', order.id, completionWriteRef.current);
          } catch {}
        } else if (autosaveSeqRef.current === mySeq) {
          setSaveStatus('saved');
        }
      } catch {
        setSaveStatus('local');
      }
    }, 3000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms, initialized]);

  useEffect(
    () => () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    },
    [],
  );

  const flushAutosave = useCallback(async () => {
    if (!autosaveTimerRef.current) return;
    clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = null;
    if (completionWriteRef.current || !order.id || hadSignRef.current) return;
    try {
      const draftRooms = draftPayload(rooms);
      await sbPatch('audit_orders', order.id, { audit_ticked: { draft: true, rooms: draftRooms } });
    } catch { /* best-effort — localStorage draft still covers this device */ }
  }, [rooms, order.id]);

  const addRoom = useCallback(() => {
    setRooms((prev) => [...prev, makeRoom(++seqRef.current, initialCategory(order))]);
  }, [order]);

  const removeRoom = useCallback((id: number) => {
    setRooms((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const updateRoom = useCallback((id: number, patch: RoomPatch) => {
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)));
  }, []);

  const saveStatusInfo = saveStatusDisplay(saveStatus);

  const handleFinish = useCallback(async () => {
    if (!signPadRef.current || signPadRef.current.isEmpty()) {
      showToast("Please capture the client's signature");
      return;
    }

    const noReason = rooms.some((r) => {
      const cat = categoryFor(r.category);
      return r.segments.some((s) => adjMissingReason(cat, r, s.adjust));
    });
    const noAdjPhoto = rooms.some((r) => {
      const cat = categoryFor(r.category);
      return r.segments.some((s) => adjMissingPhoto(cat, r, s.adjust));
    });
    const noCustomPhoto = rooms.some((r) =>
      r.segments.some((s) => s.fields?.areaMode === 'Custom' && !(s.photos && s.photos.length)),
    );
    if (noReason || noAdjPhoto || noCustomPhoto) {
      const issues: string[] = [];
      if (noReason) issues.push('a reason for an area adjustment');
      if (noAdjPhoto) issues.push('a photo for an area adjustment');
      if (noCustomPhoto) issues.push('a photo for a custom-measured wall/floor');
      if (
        !window.confirm(
          `Missing: ${issues.join(', ')}.\n\nThese help the office understand what was measured/adjusted and why. Continue without them?`,
        )
      ) {
        return;
      }
    }
    setCompleting(true);
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    autosaveSeqRef.current++;

    const rawSignImg = signPadRef.current.export();
    let signImg = rawSignImg;
    try { signImg = await uploadPhoto(rawSignImg); } catch { /* keep raw captured data URL */ }
    const signData: SignData = { img: signImg, name: signName, tcCategories: [...new Set(rooms.map((r) => r.category))] };
    const finishedRooms = rooms.map(serializeRoom);
    const newLogEntry: LogEntry = {
      t: 'Site audit completed · JobCard signed',
      d: new Date().toISOString(),
      by: 'auto',
      who: actingAs.name,
    };
    const newLog = [...order.log, newLogEntry];
    const updatedOrder: Order = { ...order, status: 'completed', log: newLog, jobcard: { rooms: finishedRooms, sign: signData } };

    if (order.id) {
      try {
        await sbPatch('audit_orders', order.id, { status: 'completed', log: newLog });
        try {
          localStorage.removeItem('md_audit_ps_' + order.pi);
        } catch {}

        try {
          await confirmServicePerformed(order.po, 'Site audit completed by ' + actingAs.name);
        } catch {}
      } catch {
        showToast('Status not saved — will retry automatically');
        try {
          localStorage.setItem('md_audit_ps_' + order.pi, JSON.stringify({ id: order.id, log: newLog, po: order.po }));
        } catch {}
      }

      const ticked = {
        auditor: actingAs.name,
        date: dstr(todayMidnight()),
        sign: signData,
        rooms: finishedRooms,
      };
      completionWriteRef.current = { audit_ticked: ticked };
      try {
        await sbPatchLong('audit_orders', order.id, { audit_ticked: ticked });

        void archiveAuditTicked(order.id, ticked, 'completed');
        hadSignRef.current = true;
        setHadSign(true);
        try {
          localStorage.removeItem('md_audit_' + order.pi);
        } catch {}
        try {
          localStorage.removeItem('md_audit_pjc_' + order.pi);
        } catch {}
      } catch {
        showToast('Job card save failed — will retry automatically on next open');
        try {
          localStorage.setItem('md_audit_pjc_' + order.pi, JSON.stringify({ id: order.id, ticked }));
        } catch {}
      }

    }

    locationTracker.stop();

    let url: string | null = null;
    try {
      url = await genPDF(updatedOrder, actingAs.name);
    } catch (e) {
      console.error('PDF error:', e);
    }
    setPdfUrl(url);
    setCompleting(false);
    setPhase('done');
    onCompleted(updatedOrder);
  }, [order, actingAs, rooms, signName, locationTracker, onCompleted, showToast]);

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => { flushAutosave(); onBack(rooms); }}
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm font-bold text-gray-700 hover:bg-gray-50"
        >
          ←
        </button>
        <div>
          <div className="text-[15px] font-bold text-gray-900">Site Audit Job Card</div>
          <div className="text-[13px] text-gray-500">
            {order.pi} · {order.name}
          </div>
        </div>
        <div className={cn('ml-auto whitespace-nowrap text-[11px] font-bold', saveStatusInfo.className)}>{saveStatusInfo.text}</div>
      </div>

      {hadSign && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] font-semibold text-amber-800">
          This job card was already signed &amp; completed. Your edits are saved on this device only — the signed record
          on file, including its photos, is kept safe until you finish and capture a new signature below.
        </div>
      )}

      {!initialized ? (
        <Spinner />
      ) : (
        <WizardSetupPhase
        actingAs={actingAs}
        completing={completing}
        handleFinish={handleFinish}
        onDone={onDone}
        order={order}
        pdfUrl={pdfUrl}
        phase={phase}
        removeRoom={removeRoom}
        rooms={rooms}
        setPhase={setPhase}
        setSignName={setSignName}
        setTcAgree={setTcAgree}
        signName={signName}
        signPadRef={signPadRef}
        tcAgree={tcAgree}
        updateRoom={updateRoom}
      />
      )}

      {initialized && phase === 'rooms' && (
        <div className="sticky bottom-0 mt-4 flex gap-2.5 border-t border-gray-200 bg-white/95 py-3 backdrop-blur">
          <button
            type="button"
            onClick={addRoom}
            className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            + Add room
          </button>
          <button
            type="button"
            onClick={() => {
              if (rooms.length === 0) {
                showToast('Add at least one room');
                return;
              }
              setPhase('review');
            }}
            className="flex-1 rounded-xl bg-[#1F3A5F] py-3 text-sm font-bold text-white hover:opacity-90"
          >
            Review &amp; sign
          </button>
        </div>
      )}
    </div>
  );
}
