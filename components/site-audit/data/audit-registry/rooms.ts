import { categoryFor, fieldsFor } from './categories';
import { MD_JOURNEY_STAGES } from '../../constants/audit-registry';
import { AuditRoomV2, AuditSegment, CategoryDef, JourneyStage, PrereqEntry, RoomLike } from '../../types/audit-registry';
export function prereqFlagged(seg: { prereq?: Record<string, PrereqEntry> } | null | undefined): boolean {
  const p = seg && seg.prereq;
  if (!p) return false;
  return Object.keys(p).some((k) => p[k] && p[k].status === 'Not OK');
}

export function normalizeRoom(room: any): AuditRoomV2 {
  if (room && room.v >= 2) return room as AuditRoomV2;
  const r = room || {};
  return {
    v: 0,
    category: r.type || 'flooring',
    name: r.name || '',
    sku: r.sku || '',
    variant: null,
    notes: r.notes || '',
    sketchStrokes: r.sketchStrokes || [],
    segments: [
      {
        id: 1,
        facing: null,
        fields: { ...(r.calc || {}) },
        photos: r.photos || (r.photo ? [r.photo] : []),
        prereq: {},
        flagged: false,
      },
    ],
  };
}

export function segmentRows(cat: CategoryDef, seg: AuditSegment, isV2: boolean, room?: RoomLike): [string, string][] {
  if (isV2) {
    return fieldsFor(cat, room)
      .filter((f) => {
        const v = seg.fields && seg.fields[f.k];
        return v !== undefined && v !== null && String(v) !== '';
      })
      .map((f) => [f.label, String(seg.fields[f.k])] as [string, string]);
  }
  return (cat.legacyFields || [])
    .filter((p) => {
      const v = seg.fields && seg.fields[p[0]];
      return v !== undefined && v !== null && String(v) !== '';
    })
    .map((p) => [p[1], String(seg.fields[p[0]])] as [string, string]);
}

export function segmentPrereqRows(cat: CategoryDef, seg: AuditSegment): [string, string, string][] {
  if (!seg.prereq) return [];
  return (cat.prerequisites || [])
    .filter((p) => seg.prereq[p.k] && seg.prereq[p.k].status)
    .map((p) => [p.label, seg.prereq[p.k].status, seg.prereq[p.k].note || ''] as [string, string, string]);
}

export function installRoomRows(room: any): [string, string][] {
  if (room && room.v >= 2) {
    const cat = categoryFor(room.category);
    return (cat.installFields || [])
      .filter((f) => {
        const v = room.fields && room.fields[f.k];
        return v !== undefined && v !== null && String(v) !== '';
      })
      .map((f) => [f.label, String(room.fields[f.k])] as [string, string]);
  }
  return ([
    ['SKU', room?.sku],
    ['Quantity', room?.qty],
    ['Height x Width', [room?.height, room?.width].filter(Boolean).join(' x ')],
  ] as [string, unknown][])
    .filter((p) => p[1] !== undefined && p[1] !== null && String(p[1]) !== '')
    .map((p) => [p[0], String(p[1])] as [string, string]);
}

export function installRoomPhotos(room: any): string[] {
  const photos = room?.photos && room.photos.length ? room.photos : room?.photo ? [room.photo] : [];
  return (photos as string[]).filter(Boolean);
}

export function journeyStage(k: string): JourneyStage {
  return MD_JOURNEY_STAGES.find((s) => s.k === k) || { k, label: k, icon: '•' };
}
