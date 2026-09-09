'use client';

import { Job, PersistedRoom, Room } from '../types/installer';
import { MD_CATEGORIES } from '@/components/site-audit/data/auditRegistry';
import { SQFT_PER_ROLL } from '@/components/site-audit/siteAuditShared';

export function dstr(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export const today = (() => {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
})();

export function addDays(base: Date, n: number) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

export function itemQtyDisplay(it: any, isWallpaper: boolean): string {
  if (it.sqft) return it.sqft + ' sq.ft' + (isWallpaper ? ' (~' + Math.ceil((parseFloat(it.sqft) || 0) / SQFT_PER_ROLL) + ' rolls)' : '');
  if (isWallpaper && it.rolls) return it.rolls + ' rolls';
  return it.qty || '';
}

export function buildSlots(): Record<string, { label: string; start: number }> {
  const m: Record<string, { label: string; start: number }> = {
    s1: { label: '9 AM – 12 PM', start: 9 },
    s2: { label: '12 PM – 3 PM', start: 12 },
    s3: { label: '3 PM – 6 PM', start: 15 },
  };
  if (typeof window === 'undefined') return m;
  const defFL = [{ id: 'sf1', label: '9 AM – 12 PM' }, { id: 'sf2', label: '12 PM – 3 PM' }, { id: 'sf3', label: '3 PM – 6 PM' }];
  const defWP = [{ id: 'sw1', label: '9 AM – 12 PM' }, { id: 'sw2', label: '12 PM – 3 PM' }, { id: 'sw3', label: '3 PM – 6 PM' }];
  let fl: any[] = defFL, wp: any[] = defWP;
  try {
    const sf = localStorage.getItem('md_install_slots_fl');
    const sw = localStorage.getItem('md_install_slots_wp');
    if (sf) fl = JSON.parse(sf);
    if (sw) wp = JSON.parse(sw);
  } catch {
    /* ignore malformed local overrides */
  }
  const st = [9, 12, 15];
  fl.forEach((s: any, i: number) => { m[s.id] = { label: s.label, start: st[i] || 9 }; });
  wp.forEach((s: any, i: number) => { m[s.id] = { label: s.label, start: st[i] || 9 }; });
  return m;
}

export function subjobEffectiveStatus(sj: any): string {
  const asgns = Array.isArray(sj && sj.assignments) ? sj.assignments : [];
  if (!asgns.length) return sj.status;
  if (sj.status === 'partial' || sj.status === 'completed') return sj.status;
  return asgns.every((a: any) => a.status === 'completed') ? 'completed' : sj.status;
}

export function rollupStatus(subjobs: any[], fallback: string): string {
  if (!subjobs || !subjobs.length) return fallback;
  const sts = subjobs.map(subjobEffectiveStatus);
  if (sts.every((s) => s === 'completed')) return 'completed';
  if (sts.some((s) => s === 'completed') && sts.some((s) => s !== 'completed')) return 'partial';
  if (sts.some((s) => ['onway', 'atsite'].includes(s))) return sts.find((s) => ['onway', 'atsite'].includes(s))!;
  if (sts.some((s) => s === 'reschedule')) return 'reschedule';
  if (sts.some((s) => s === 'callpending')) return 'callpending';
  if (sts.some((s) => s === 'assigned')) return 'assigned';
  if (sts.some((s) => s === 'scheduled')) return 'scheduled';
  return fallback;
}

export function statusForInstaller(sj: any, email: string): string {
  const assignments = Array.isArray(sj && sj.assignments) ? sj.assignments : [];
  const mine = assignments.find((a: any) => a && a.installer_email === email);
  const raw = (mine && mine.status) || (sj && sj.status) || '';
  return raw === 'assigned' ? 'scheduled' : raw;
}

export function mapUrl(a: string) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(a);
}

function slotLabel(id: string | null, slots: Record<string, { label: string; start: number }>): string {
  if (!id) return '—';
  if (slots[id]) return slots[id].label;
  if (/^\d{1,2}:\d{2}$/.test(id)) {
    const [h, m] = id.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return h12 + ':' + (m < 10 ? '0' : '') + m + ' ' + ap;
  }
  return '—';
}

export function slotsLabel(j: Job, slots: Record<string, { label: string; start: number }>): string {
  if (j.slots && j.slots.length) {
    const lbls = j.slots.map((s) => slotLabel(s, slots)).filter((l) => l && l !== '—');
    if (lbls.length) return lbls.join(' · ');
  }
  return slotLabel(j.slot, slots) || '—';
}

function categoryForJob(job: Job | null, restore?: Partial<PersistedRoom>): string {
  const t = (restore && (restore.category || (restore as any).type)) || job?.type;
  return t && MD_CATEGORIES[t] ? t : 'flooring';
}

export function appendRoomState(rooms: Room[], seqRef: { current: number }, job: Job | null, restore?: Partial<PersistedRoom>): Room[] {
  const id = ++seqRef.current;
  const firstSku = job?.sku[0];
  const category = categoryForJob(job, restore);
  const room: Room = restore
    ? {
        id,
        v: 2,
        category,
        name: restore.name || '',
        sku: restore.sku || '',
        fields: { ...(restore.fields || {}) },
        photos: restore.photos || (restore.photo ? [restore.photo] : []),
        comments: restore.comments || (restore as any).notes || '',
      }
    : {
        id,
        v: 2,
        category,
        name: '',
        sku: firstSku ? firstSku.code : '',
        fields: {},
        photos: [],
        comments: '',
      };
  return [...rooms, room];
}

export function collectRooms(rooms: Room[]): PersistedRoom[] {
  return rooms.map(({ id: _id, ...rest }) => ({
    ...rest,
    v: 2,
    category: rest.category || 'flooring',
    fields: { ...(rest.fields || {}) },
    photos: rest.photos || [],
    comments: rest.comments || '',
  }));
}

export function buildInstallTC(termsBlock: string): string {
  return `Material Depot — Customer Acknowledgement

By ticking the box and signing below, I confirm that:

• The installation described in this job card has been carried out to my satisfaction.
• The rooms, materials and details recorded are accurate and correct.
• I am satisfied with the service provided by the Material Depot team.
• I consent to being contacted for quality feedback purposes if required.
• I have read, understood and agree to the installation terms & conditions below.

${termsBlock || '[Full terms and conditions will be provided by Material Depot]'}`;
}
