import { newB2BId } from '@/components/b2b/models/ids';
import type {
  BannerTone, ContentState, LaunchKind, PartnerBanner, PartnerLaunch,
} from './types';

export const TONES: { value: BannerTone; label: string }[] = [
  { value: 'brand', label: 'Material Depot orange' },
  { value: 'good', label: 'Green — good news' },
  { value: 'warn', label: 'Amber — time-limited' },
  { value: 'info', label: 'Blue — informational' },
  { value: 'ink', label: 'Ink — neutral' },
];

export const KINDS: { value: LaunchKind; label: string }[] = [
  { value: 'product', label: 'New product' },
  { value: 'design', label: 'New design' },
  { value: 'initiative', label: 'Initiative' },
  { value: 'offer', label: 'Offer' },
  { value: 'event', label: 'Event' },
  { value: 'tool', label: 'Tool' },
];

export const STATE_LABEL: Record<ContentState, string> = {
  live: 'On partner dashboards now',
  draft: 'Not published',
  scheduled: 'Scheduled',
  ended: 'Run has ended',
};

export const STATE_PENDING: Record<ContentState, string> = {
  live: 'Not pushed — will go live',
  draft: 'Not pushed — stays unpublished',
  scheduled: 'Not pushed — will be scheduled',
  ended: 'Not pushed — already past its end date',
};

export const STATE_CLASS: Record<ContentState, string> = {
  live: 'bg-green-50 text-green-700 border-green-200',
  draft: 'bg-gray-50 text-gray-500 border-gray-200',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  ended: 'bg-gray-50 text-gray-400 border-gray-200',
};

export function istToday(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

export function bannerState(b: PartnerBanner, today = istToday()): ContentState {
  if (!b.is_published) return 'draft';
  if (b.starts_on && b.starts_on > today) return 'scheduled';
  if (b.ends_on && b.ends_on < today) return 'ended';
  return 'live';
}

export function launchState(l: PartnerLaunch, today = istToday()): ContentState {
  if (!l.is_published) return 'draft';
  if (l.ends_on && l.ends_on < today) return 'ended';
  return 'live';
}

export function blankBanner(): PartnerBanner {
  return {
    md_ref: newB2BId('BAN'),
    title: '',
    body: null,
    image_url: null,
    cta_label: null,
    cta_href: null,
    tone: 'brand',
    starts_on: istToday(),
    ends_on: null,
    priority: 0,
    is_published: false,
  };
}

export function blankLaunch(): PartnerLaunch {
  return {
    md_ref: newB2BId('LAU'),
    kind: 'product',
    title: '',
    subtitle: null,
    body: null,
    image_url: null,
    href: null,
    cta_label: null,
    badge: null,
    category: null,
    launched_on: istToday(),
    ends_on: null,
    is_featured: false,
    priority: 0,
    is_published: false,
  };
}

export function orderBanners(rows: PartnerBanner[]): PartnerBanner[] {
  return [...rows].sort(
    (a, b) =>
      b.priority - a.priority ||
      (b.created_at ?? '').localeCompare(a.created_at ?? '') ||
      a.md_ref.localeCompare(b.md_ref),
  );
}

export function orderLaunches(rows: PartnerLaunch[]): PartnerLaunch[] {
  return [...rows].sort(
    (a, b) =>
      Number(b.is_featured) - Number(a.is_featured) ||
      b.priority - a.priority ||
      (b.launched_on ?? '').localeCompare(a.launched_on ?? '') ||
      a.md_ref.localeCompare(b.md_ref),
  );
}

export function problemWith(row: PartnerBanner | PartnerLaunch): string | null {
  if (!row.title.trim()) return 'A title is required';
  if (row.title.trim().length > 120) return 'The title is over 120 characters';
  const href = 'cta_href' in row ? row.cta_href : row.href;
  if (href && !/^(https?:\/\/|\/)/.test(href)) {
    return 'The link must start with https:// or be a path beginning with /';
  }
  const from = 'starts_on' in row ? row.starts_on : null;
  if (from && row.ends_on && row.ends_on < from) return 'The end date is before the start date';
  return null;
}

export async function readImage(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${file.type};base64,${btoa(binary)}`;
}
