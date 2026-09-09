'use client';

import { readCapturedPhoto, uploadPhoto } from '../../shared/photos';
import { PersistedRoom, Room } from '../../types/installer';
import { useCallback } from 'react';

export function useRoomActions({ updateRooms }: {
  updateRooms: (updater: (prev: Room[]) => Room[]) => void;
}) {
const swapRoomPhoto = useCallback((roomId: number, from: string, to: string) => {
  updateRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, photos: r.photos.map((p) => (p === from ? to : p)) } : r)));
}, [updateRooms]);
const addPhotoToRoom = useCallback((roomId: number, url: string) => {
  updateRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, photos: [...r.photos, url] } : r)));
}, [updateRooms]);
const removePhotoFromRoom = useCallback((roomId: number, idx: number) => {
  updateRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, photos: r.photos.filter((_p, i) => i !== idx) } : r)));
}, [updateRooms]);
const removeRoom = useCallback((roomId: number) => {
  updateRooms((prev) => prev.filter((r) => r.id !== roomId));
}, [updateRooms]);
const updateRoomField = useCallback((roomId: number, field: keyof PersistedRoom, value: string) => {
  updateRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, [field]: value } : r)));
}, [updateRooms]);

const updateRoomCategory = useCallback((roomId: number, category: string) => {
  updateRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, category, fields: {} } : r)));
}, [updateRooms]);
const updateRoomInstallField = useCallback((roomId: number, k: string, value: string) => {
  updateRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, fields: { ...(r.fields || {}), [k]: value } } : r)));
}, [updateRooms]);

const handleFilesForRoom = useCallback(async (roomId: number, files: FileList | null): Promise<string | null> => {
  if (!files || !files.length) return null;
  let err: string | null = null;
  for (const file of Array.from(files)) {
    const got = await readCapturedPhoto(file, 1600, 0.88);
    if (!got.ok) { err = got.error; continue; }
    const resized = got.dataUrl;
    addPhotoToRoom(roomId, resized);
    uploadPhoto(resized)
      .then((url) => swapRoomPhoto(roomId, resized, url))
      .catch(() => { /* keep the inline base64 — the draft/job card still carries the photo */ });
  }
  return err;
}, [addPhotoToRoom, swapRoomPhoto]);


  return { addPhotoToRoom, handleFilesForRoom, removePhotoFromRoom, removeRoom, updateRoomCategory, updateRoomField, updateRoomInstallField };
}
