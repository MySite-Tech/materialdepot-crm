export type BannerTone = 'brand' | 'good' | 'warn' | 'info' | 'ink';

export type LaunchKind = 'product' | 'design' | 'initiative' | 'offer' | 'event' | 'tool';

export interface PartnerBanner {
  id?: string;
  md_ref: string;
  title: string;
  body: string | null;
  image_url: string | null;
  cta_label: string | null;
  cta_href: string | null;
  tone: BannerTone;
  starts_on: string | null;
  ends_on: string | null;
  priority: number;
  is_published: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface PartnerLaunch {
  id?: string;
  md_ref: string;
  kind: LaunchKind;
  title: string;
  subtitle: string | null;
  body: string | null;
  image_url: string | null;
  href: string | null;
  cta_label: string | null;
  badge: string | null;
  category: string | null;
  launched_on: string | null;
  ends_on: string | null;
  is_featured: boolean;
  priority: number;
  is_published: boolean;
  created_at?: string;
  updated_at?: string;
}

export type ContentRow = PartnerBanner | PartnerLaunch;

export type ContentState = 'live' | 'draft' | 'scheduled' | 'ended';

export interface ContentSet {
  banners: PartnerBanner[];
  launches: PartnerLaunch[];
}

export interface PushOutcome {
  banners: { received: number; written: number; removed: number };
  launches: { received: number; written: number; removed: number };
  skipped: { md_ref: string; reason: string }[];
}

export interface DraftImage {
  data: string;
  name: string;
}
