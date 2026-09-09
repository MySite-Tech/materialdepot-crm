'use client';


import { sbGet, sbPatch, sbPatchLong } from '../../shared/sbClient';
import { Job, PersistedRoom, Room } from '../../types/installer';
import { appendRoomState, collectRooms } from '../../utils/installer';
import { useRoomActions } from './use-room-actions';
import { Dispatch, RefObject, SetStateAction, useCallback } from 'react';

export function useJobCardState({ autosaveSeqRef, autosaveTimerRef, completionWriteRef, hadSignRef, jcJobRef, jcRooms, jcRoomsRef, jcSeqRef, setHadSign, setJcRooms, setJcStage, setJobCardOpen, setJobs, setSaveStatus, setScreen, toast }: {
  autosaveSeqRef: RefObject<number>;
  autosaveTimerRef: RefObject<ReturnType<typeof setTimeout> | null>;
  completionWriteRef: RefObject<{ subjobs: any[]; } | null>;
  hadSignRef: RefObject<boolean>;
  jcJobRef: RefObject<Job | null>;
  jcRooms: Room[];
  jcRoomsRef: RefObject<Room[]>;
  jcSeqRef: RefObject<number>;
  setHadSign: Dispatch<SetStateAction<boolean>>;
  setJcRooms: Dispatch<SetStateAction<Room[]>>;
  setJcStage: Dispatch<SetStateAction<"rooms" | "review" | "handoff" | "tcs" | "signature" | "installerSignoff">>;
  setJobCardOpen: Dispatch<SetStateAction<boolean>>;
  setJobs: Dispatch<SetStateAction<Job[]>>;
  setSaveStatus: Dispatch<SetStateAction<"idle" | "saving" | "saved" | "local">>;
  setScreen: Dispatch<SetStateAction<"list" | "detail">>;
  toast: (msg: string) => void;
}) {
const triggerAutosave = useCallback(() => {
  const job = jcJobRef.current;
  if (!job) return;
  try {
    localStorage.setItem('md_install_' + job.pi + '_' + job.sjId, JSON.stringify({ rooms: collectRooms(jcRoomsRef.current), ts: Date.now() }));
  } catch { /* local persistence best-effort */ }
  setSaveStatus('saving');
  if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
  const mySeq = ++autosaveSeqRef.current;
  autosaveTimerRef.current = setTimeout(async () => {
    if (autosaveSeqRef.current !== mySeq) return;
    if (completionWriteRef.current) { setSaveStatus('saved'); return; }
    const curJob = jcJobRef.current;
    if (!curJob || !curJob.id || !curJob.sjId) { setSaveStatus('local'); return; }

    if (hadSignRef.current) { setSaveStatus('local'); return; }
    try {
      const parentRows = await sbGet('install_orders?id=eq.' + curJob.id + '&select=subjobs');
      if (autosaveSeqRef.current !== mySeq || completionWriteRef.current) return;
      if (Array.isArray(parentRows) && parentRows[0]) {
        const subjobs = parentRows[0].subjobs || [];
        const sj = subjobs.find((s: any) => s.id === curJob.sjId);

        const draftRooms = collectRooms(jcRoomsRef.current).map((r) => ({
          ...r,
          photos: (r.photos || []).filter((ph: string) => /^https?:/i.test(ph)),
        }));
        if (sj) sj.jobcard = { draft: true, rooms: draftRooms };
        if (autosaveSeqRef.current !== mySeq || completionWriteRef.current) return;
        await sbPatch('install_orders', curJob.id, { subjobs });
        if (completionWriteRef.current) {
          try { await sbPatchLong('install_orders', curJob.id, completionWriteRef.current); } catch { /* best-effort */ }
        } else if (autosaveSeqRef.current === mySeq) {
          setSaveStatus('saved');
        }
      }
    } catch {
      setSaveStatus('local');
    }
  }, 3000);
}, []);

const updateRooms = useCallback((updater: (prev: Room[]) => Room[]) => {
  setJcRooms((prev) => {
    const next = updater(prev);
    jcRoomsRef.current = next;
    return next;
  });
  triggerAutosave();
}, [triggerAutosave]);

const openJobCard = useCallback((job: Job) => {
  jcJobRef.current = job;
  jcSeqRef.current = 0;
  completionWriteRef.current = null;
  setSaveStatus('idle');
  setJcStage('rooms');

  const signed = !!(job.jobcard && job.jobcard.sign && !(job.jobcard as any).draft && job.jobcard.rooms?.length);
  hadSignRef.current = signed;
  setHadSign(signed);
  let restoreList: PersistedRoom[] | null = signed ? (job.jobcard!.rooms as PersistedRoom[]) : null;
  if (!restoreList) {
    try {
      const raw = localStorage.getItem('md_install_' + job.pi + '_' + job.sjId);
      const d = raw ? JSON.parse(raw) : null;
      if (d && Array.isArray(d.rooms) && d.rooms.length) restoreList = d.rooms;
    } catch { /* ignore malformed draft */ }
  }
  if (!restoreList && job.jobcard && Array.isArray(job.jobcard.rooms) && job.jobcard.rooms.length) restoreList = job.jobcard.rooms;
  const seeded = restoreList && restoreList.length
    ? restoreList.reduce<Room[]>((acc, r) => appendRoomState(acc, jcSeqRef, job, r), [])
    : appendRoomState([], jcSeqRef, job);
  setJcRooms(seeded);
  jcRoomsRef.current = seeded;
  setJobCardOpen(true);
}, []);

const handleAddRoom = useCallback(() => {
  updateRooms((prev) => appendRoomState(prev, jcSeqRef, jcJobRef.current));
}, [updateRooms]);

const handleJcBack = useCallback(() => {
  const job = jcJobRef.current;
  if (job) {
    const rooms = collectRooms(jcRoomsRef.current);
    setJobs((prev) => prev.map((j) => (j.pi === job.pi && j.sjId === job.sjId ? { ...j, jobcard: { rooms } } : j)));
    triggerAutosave();
  }
  setJobCardOpen(false);
  setScreen('detail');
}, [triggerAutosave]);

function validateRooms(rooms: Room[]): string | null {
  if (rooms.length === 0) return 'Add at least one room';
  for (const r of rooms) {
    if (!r.name.trim()) return 'Enter a room name';
    if (!r.sku.trim()) return 'Enter the SKU code';
    if (!r.photos || !r.photos.length) return 'Add at least one photo for ' + (r.name || 'each room');
  }
  return null;
}

const finishCard = useCallback(() => {
  const err = validateRooms(jcRooms);
  if (err) { toast(err); return; }
  setJcStage('review');
}, [jcRooms, toast]);


const { addPhotoToRoom, handleFilesForRoom, removePhotoFromRoom, removeRoom, updateRoomCategory, updateRoomField, updateRoomInstallField } = useRoomActions({ updateRooms });


  return { addPhotoToRoom, finishCard, handleAddRoom, handleFilesForRoom, handleJcBack, openJobCard, removePhotoFromRoom, removeRoom, updateRoomCategory, updateRoomField, updateRoomInstallField };
}
