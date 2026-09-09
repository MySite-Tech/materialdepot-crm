import { unitFor } from './categories';
import { UNIT_DIV } from '../../constants/audit-registry';
import { AdjustDisplayRow, AdjustRow, CategoryDef, RoomLike } from '../../types/audit-registry';
import { n, r2 } from '../../utils/audit-registry';
export function adjArea(a: AdjustRow | null | undefined, div: number): number {
  if (!a) return 0;
  if (String(a.area ?? '') !== '') return n(a.area);
  if (a.shape === 'Other') return 0;
  const mult = a.shape === 'Triangle' ? 0.5 : 1;
  const raw = n(a.h) * n(a.w) * mult;
  return raw ? r2(raw / div) : 0;
}

export function adjRows(cat: CategoryDef, room: RoomLike, adjust?: AdjustRow[] | null): AdjustDisplayRow[] {
  const u = unitFor(cat, room);
  const div = UNIT_DIV[u] || 1;
  return (adjust || [])
    .map((a) => (a ? { a, ar: adjArea(a, div) } : null))
    .filter((x): x is { a: AdjustRow; ar: number } => !!x && !!x.ar)
    .map(({ a, ar }) => {
      const shape = a.shape || 'Rectangle';
      const neg = a.sign === '-';
      const hasDims = String(a.h ?? '') !== '' && String(a.w ?? '') !== '';
      const size =
        shape === 'Other' || !hasDims
          ? 'manual entry'
          : `${n(a.h)} × ${n(a.w)} ${u}${shape === 'Triangle' ? ' (triangle)' : ''}`;
      return {
        label: neg ? 'Subtract' : 'Add',
        shape,
        size,
        area: `${neg ? '-' : '+'}${ar}`,
        reason: (a.reason || '').trim(),
        photos: (a.photos || []).slice(),
        neg,
      };
    });
}

export function adjMissingReason(cat: CategoryDef, room: RoomLike, adjust?: AdjustRow[] | null): boolean {
  return adjRows(cat, room, adjust).some((r) => !r.reason);
}

export function adjMissingPhoto(cat: CategoryDef, room: RoomLike, adjust?: AdjustRow[] | null): boolean {
  return adjRows(cat, room, adjust).some((r) => !r.photos || !r.photos.length);
}
