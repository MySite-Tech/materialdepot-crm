'use client';

import { SLOTS } from '../constants/auditor';
import { Order, Room, Segment } from '../types/auditor';
import { SketchStroke } from '@/components/site-audit/apps/fieldAppShared';
import { AdjustRow, FieldValues, MD_CATEGORIES, ROOM_V, fieldsFor, normalizeRoom, prereqFlagged } from '@/components/site-audit/data/auditRegistry';

const isUploaded = (p: string) => /^https?:/i.test(p);

export function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function dstr(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function addDays(base: Date, n: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

export function slotLabel(id: string | null): string {
  if (!id) return '—';
  if (SLOTS[id]) return SLOTS[id].label;
  if (/^\d{1,2}:\d{2}$/.test(id)) {
    const [h, m] = id.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  }
  return '—';
}

export function mapUrl(a: string): string {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a);
}

export function normalizeAuditStatus(s: string | null | undefined): string {
  return s === 'assigned' ? 'scheduled' : s || '';
}

export function computeDisplayStatus(o: Order, now: Date, today: Date): string {
  if (o.status === 'scheduled' && o.date === dstr(today)) {
    let startH: number | undefined;
    if (o.slot && SLOTS[o.slot]) startH = SLOTS[o.slot].start;
    else if (o.slot && /^\d{1,2}:\d{2}$/.test(o.slot)) {
      const [h, m] = o.slot.split(':').map(Number);
      startH = h + m / 60;
    } else {
      return o.status;
    }
    const start = new Date(today);
    start.setHours(Math.floor(startH), Math.round((startH % 1) * 60), 0, 0);
    if (now.getTime() >= start.getTime() - 3 * 3600 * 1000) return 'callpending';
  }
  return o.status;
}

export function pdfFileName(order: Order): string {
  return ('SiteAudit_' + (order.name || 'client') + '_' + (order.pi || '') + '.pdf').replace(/[^a-z0-9_\-.]/gi, '_');
}

export function blankSegment(catKey: string, sid: number, room?: { v?: number; variant?: string | null } | null): Segment {
  const cat = MD_CATEGORIES[catKey] || MD_CATEGORIES.flooring;
  const roomCtx = room || { v: ROOM_V, variant: null };
  const fields: FieldValues = {};
  fieldsFor(cat, roomCtx).forEach((f) => {
    if (f.default !== undefined) fields[f.k] = f.default;
  });

  return { sid, facing: null, photos: [], fields, prereq: {}, adjust: [] };
}

export function fieldValue(seg: Segment, f: { k: string; input?: string; opts?: string[] }): string {
  const v = seg.fields[f.k];
  if (v !== undefined && v !== null && v !== '') return String(v);
  if (f.input === 'select') return (f.opts && f.opts[0]) || '';
  return '';
}

export function initialCategory(order: Order): string {
  const t = order.skus[0]?.type;
  return t && MD_CATEGORIES[t] ? t : 'flooring';
}

export function makeRoom(id: number, category: string): Room {
  return {
    id,
    v: ROOM_V,
    category,
    name: '',
    sku: '',
    variant: null,
    notes: '',
    segments: [blankSegment(category, 1, { v: ROOM_V, variant: null })],
    nextSid: 1,
    sketchStrokes: [],
  };
}

export function normalizeRestoredRoom(r: any, id: number): Room {
  const nr = normalizeRoom(r);
  const category = MD_CATEGORIES[nr.category] ? nr.category : 'flooring';
  const v = nr.v >= 2 ? nr.v : ROOM_V;
  let sid = 0;
  const segments: Segment[] = (nr.segments || []).map((s) => ({
    sid: ++sid,
    facing: s.facing || null,
    photos: (s.photos || []).slice(),
    fields: { ...(s.fields || {}) },
    prereq: { ...(s.prereq || {}) },
    adjust: ((s as any).adjust || []).map((a: AdjustRow) => ({ ...a, photos: (a.photos || []).slice() })),
  }));
  return {
    id,
    v,
    category,
    name: nr.name || '',
    sku: nr.sku || '',
    variant: nr.variant || null,
    notes: nr.notes || '',
    segments: segments.length ? segments : [blankSegment(category, 1, { v, variant: nr.variant || null })],
    nextSid: Math.max(sid, 1),
    sketchStrokes: (nr.sketchStrokes as SketchStroke[]) || [],
  };
}

export function saveStatusDisplay(status: 'idle' | 'saving' | 'saved' | 'local'): { text: string; className: string } {
  if (status === 'saving') return { text: 'Saving…', className: 'text-amber-600' };
  if (status === 'saved') return { text: '✓ Saved', className: 'text-green-600' };
  if (status === 'local') return { text: '✓ Saved locally', className: 'text-gray-400' };
  return { text: '', className: 'text-gray-400' };
}

export function serializeRoom(r: Room) {
  return {
    v: r.v || ROOM_V,
    category: r.category,
    name: r.name,
    sku: r.sku,
    variant: r.variant || null,
    notes: r.notes,
    sketchStrokes: r.sketchStrokes || [],
    segments: (r.segments || []).map((s) => ({
      id: s.sid,
      facing: s.facing || null,
      fields: { ...s.fields },
      photos: (s.photos || []).slice(),
      prereq: { ...s.prereq },
      adjust: (s.adjust || []).map((a) => ({ ...a, photos: (a.photos || []).slice() })),
      flagged: prereqFlagged(s),
    })),
  };
}

export function draftPayload(rooms: Room[]) {
  return rooms.map((r) => {
    const { segments, ...rest } = serializeRoom(r);
    return {
      ...rest,
      segments: segments.map((s) => ({
        ...s,
        photos: (s.photos || []).filter(isUploaded),
        adjust: s.adjust.map((a) => ({ ...a, photos: (a.photos || []).filter(isUploaded) })),
      })),
    };
  });
}

export function buildAuditTC(termsBlock: string): string {
  return `Material Depot — Client Acknowledgement

By ticking the box and signing below, I confirm that:

• The site visit described in this job card was carried out to my satisfaction.
• The details, measurements and room information recorded are accurate and correct.
• I am satisfied with the service provided by the Material Depot team.
• I consent to being contacted for quality feedback purposes if required.
• I have read, understood and agree to the installation terms & conditions below, which explain what needs to be in place before installation can proceed.

${termsBlock || '[Full terms and conditions will be provided by Material Depot]'}`;
}
