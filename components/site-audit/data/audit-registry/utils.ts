import { ROOM_V } from './constants';
import { FieldValues, RoomLike } from './types';
export const n = (x: unknown): number => {
  const v = parseFloat(String(x));
  return isFinite(v) ? v : 0;
};

export const r2 = (x: number): number => Math.round(x * 100) / 100;

export const roomV = (room: RoomLike): number => {
  const v = room && room.v;
  return v === undefined || v === null ? ROOM_V : v;
};

export const skipDim = (v: FieldValues): boolean => v.areaMode === 'Custom';

export function typeLabel(t?: string | null): string {
  return t === 'wallpaper' ? 'Wallpaper' : t === 'wallpanel' ? 'Wall Panels' : 'Flooring';
}

export function typeTag(t?: string | null): string {
  return t === 'wallpaper' ? 'WP' : t === 'wallpanel' ? 'WPL' : 'FL';
}
