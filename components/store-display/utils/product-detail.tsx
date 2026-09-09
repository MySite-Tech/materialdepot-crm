'use client';

export function changeRequestKey(handle: string) { return `sd_change_${handle}`; }

export function removalStateKey(handle: string) { return `sd_removal_${handle}`; }

export function loadStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
