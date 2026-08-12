/* Product-category registry for the site-audit / installation job-card system.
   TypeScript port of material-depot-site's /md-audit-registry.js — SINGLE SOURCE OF TRUTH for
   measurement fields, derived formulas, the segment model, prerequisites and legacy label maps.

   TO ADD A NEW PRODUCT CATEGORY: add one entry to MD_CATEGORIES below. Every form, PDF generator
   and on-screen renderer iterates this object, so a new category needs no other code change (the
   only coupling: the upstream order SKU `type` string must equal the key for auto-selection). */

const n = (x: unknown): number => {
  const v = parseFloat(String(x));
  return isFinite(v) ? v : 0;
};
const r2 = (x: number): number => Math.round(x * 100) / 100;
// 304.8mm (1ft) squared — converts a height(mm)*width(mm) area straight to sq.ft
const MM2_PER_SQFT = 92903.04;

export type FieldValues = Record<string, string | number>;

export type CategoryField = {
  k: string;
  group: string;
  label: string;
  input?: 'decimal' | 'text' | 'select';
  opts?: string[];
  derived?: boolean;
  compute?: (v: FieldValues, cat?: CategoryDef) => number;
  showIf?: (v: FieldValues) => boolean;
  default?: string;
};

export type CategoryDef = {
  id: string;
  label: string;
  pdfLabel: string;
  segment: {
    model: 'single' | 'multi';
    segLabel: string;
    facing: boolean;
    facingOpts: string[] | null;
    addLabel: string | null;
  };
  variants: string[] | null;
  rollCoverage: number | null;
  fields: CategoryField[];
  prerequisites: { k: string; label: string }[];
  legacyFields: [string, string][];
  installFields: CategoryField[];
};

const FACING_OPTS = ['North', 'South', 'East', 'West', 'North-East', 'North-West', 'South-East', 'South-West'];
const WALL_SEGMENT = {
  model: 'multi' as const,
  segLabel: 'Wall',
  facing: true,
  facingOpts: FACING_OPTS,
  addLabel: 'Add wall',
};

export const MD_CATEGORIES: Record<string, CategoryDef> = {
  flooring: {
    id: 'flooring',
    label: 'Wooden Flooring',
    pdfLabel: 'Wooden Flooring',
    segment: { model: 'single', segLabel: 'Floor', facing: false, facingOpts: null, addLabel: null },
    variants: null,
    rollCoverage: null,
    fields: [
      { k: 'length', group: 'Measurements', label: 'Room length (ft)', input: 'decimal' },
      { k: 'width', group: 'Measurements', label: 'Room width (ft)', input: 'decimal' },
      { k: 'area', group: 'Measurements', label: 'Total area (sq.ft)', derived: true, compute: (v) => r2(n(v.length) * n(v.width)) },
      { k: 'wastagePct', group: 'Measurements', label: 'Wastage to add (%)', input: 'decimal' },
      { k: 'areaW', group: 'Measurements', label: 'Area incl. wastage (sq.ft)', derived: true, compute: (v) => r2(n(v.area) * (1 + n(v.wastagePct) / 100)) },
      { k: 'skirtKind', group: 'Skirting', label: 'Skirting type', input: 'select', opts: ['None', 'Normal', 'Step'] },
      { k: 'skirtH', group: 'Skirting', label: 'Normal skirting — height (mm)', input: 'decimal', showIf: (v) => v.skirtKind === 'Normal' },
      { k: 'skirtRft', group: 'Skirting', label: 'Normal skirting — qty (running ft)', input: 'decimal', showIf: (v) => v.skirtKind === 'Normal' },
      { k: 'stepTileH', group: 'Skirting', label: 'Step skirting — tile height (mm)', input: 'decimal', showIf: (v) => v.skirtKind === 'Step' },
      { k: 'stepTileT', group: 'Skirting', label: 'Step skirting — tile thickness (mm)', input: 'decimal', showIf: (v) => v.skirtKind === 'Step' },
      { k: 'stepRft', group: 'Skirting', label: 'Step skirting — qty (running ft)', input: 'decimal', showIf: (v) => v.skirtKind === 'Step' },
      { k: 'cornerRft', group: 'Profiles', label: 'Corner beading (running ft)', input: 'decimal' },
      { k: 'reducerRft', group: 'Profiles', label: 'Reducer profile (running ft)', input: 'decimal' },
      { k: 'tprofRft', group: 'Profiles', label: 'T-profile (running ft)', input: 'decimal' },
      { k: 'lprofRft', group: 'Profiles', label: 'L-profile (running ft)', input: 'decimal' },
    ],
    prerequisites: [
      { k: 'moisture', label: 'Subfloor moisture within threshold' },
      { k: 'level', label: 'Subfloor level / evenness within tolerance' },
      { k: 'clean', label: 'Subfloor clean (no debris, dust, adhesive)' },
      { k: 'climate', label: 'Room temperature & humidity stable' },
      { k: 'noWet', label: 'No active wet-trade work nearby' },
      { k: 'acclim', label: 'Material acclimatization confirmed' },
    ],
    legacyFields: [
      ['area', 'Area (sq.ft)'],
      ['boxes', 'Boxes'],
      ['skirt', 'Skirting (nos)'],
      ['skirtH', 'Skirting height (mm)'],
      ['lprof', 'L-profile'],
      ['rprof', 'Reducer profile'],
      ['tprof', 'T-profile'],
      ['corner', 'Corner beading'],
    ],
    installFields: [
      { k: 'installedArea', group: 'Installed', label: 'Area installed (sq.ft)', input: 'decimal' },
      { k: 'batch', group: 'Installed', label: 'Batch / lot no.', input: 'text' },
    ],
  },
  wallpaper: {
    id: 'wallpaper',
    label: 'Wallpaper',
    pdfLabel: 'Wallpaper',
    segment: WALL_SEGMENT,
    variants: ['Standard', 'Customized'],
    rollCoverage: 57,
    fields: [
      { k: 'height', group: 'Measurements', label: 'Wall height (mm)', input: 'decimal' },
      { k: 'width', group: 'Measurements', label: 'Wall width (mm)', input: 'decimal' },
      { k: 'area', group: 'Measurements', label: 'Area (sq.ft)', derived: true, compute: (v) => r2((n(v.height) * n(v.width)) / MM2_PER_SQFT) },
      { k: 'wastagePct', group: 'Measurements', label: 'Wastage to add (%)', input: 'decimal' },
      { k: 'areaW', group: 'Measurements', label: 'Area incl. wastage (sq.ft)', derived: true, compute: (v) => r2(n(v.area) * (1 + n(v.wastagePct) / 100)) },
      { k: 'rolls', group: 'Measurements', label: 'Rolls required', derived: true, compute: (v, cat) => Math.ceil(n(v.areaW) / ((cat && cat.rollCoverage) || 57)) || 0 },
    ],
    prerequisites: [
      { k: 'moisture', label: 'Wall moisture within threshold' },
      { k: 'even', label: 'Wall surface even' },
      { k: 'clean', label: 'Wall cleanliness (no dust / flaking paint)' },
      { k: 'primer', label: 'Primer / base-coat confirmed' },
      { k: 'noSeep', label: 'No active seepage / dampness' },
      { k: 'ready', label: 'Room ready (no ongoing wet-trade work)' },
    ],
    legacyFields: [
      ['warea', 'Wall area (sq.ft)'],
      ['rolls', 'No. of rolls'],
      ['repeat', 'Pattern repeat (mm)'],
      ['match', 'Match type'],
      ['adh', 'Adhesive (packs)'],
      ['primer', 'Primer needed'],
    ],
    installFields: [
      { k: 'installedRolls', group: 'Installed', label: 'Rolls used', input: 'decimal' },
      { k: 'batch', group: 'Installed', label: 'Batch / lot no.', input: 'text' },
    ],
  },
  cnc: {
    id: 'cnc',
    label: 'CNC',
    pdfLabel: 'CNC',
    segment: WALL_SEGMENT,
    variants: null,
    rollCoverage: null,
    fields: [
      { k: 'height', group: 'Measurements', label: 'Wall height (mm)', input: 'decimal' },
      { k: 'width', group: 'Measurements', label: 'Wall width (mm)', input: 'decimal' },
      { k: 'area', group: 'Measurements', label: 'Area (sq.ft)', derived: true, compute: (v) => r2((n(v.height) * n(v.width)) / MM2_PER_SQFT) },
    ],
    prerequisites: [
      { k: 'moisture', label: 'Wall moisture within threshold' },
      { k: 'even', label: 'Wall surface even' },
      { k: 'clean', label: 'Wall cleanliness (no dust / debris)' },
      { k: 'structural', label: 'Wall structurally sound for CNC panel fixing' },
      { k: 'noSeep', label: 'No active seepage / dampness' },
      { k: 'ready', label: 'Room ready (no ongoing wet-trade work)' },
    ],
    legacyFields: [],
    installFields: [],
  },
  wallpanel: {
    id: 'wallpanel',
    label: 'Wall Panels',
    pdfLabel: 'Wall Panels',
    segment: WALL_SEGMENT,
    variants: null,
    rollCoverage: null,
    fields: [
      { k: 'height', group: 'Measurements', label: 'Wall height (in)', input: 'decimal' },
      { k: 'width', group: 'Measurements', label: 'Wall width (in)', input: 'decimal' },
      { k: 'area', group: 'Measurements', label: 'Area (sq.ft)', derived: true, compute: (v) => r2((n(v.height) * n(v.width)) / 144) },
      { k: 'wastagePct', group: 'Measurements', label: 'Wastage to add (%)', input: 'decimal' },
      { k: 'areaW', group: 'Measurements', label: 'Area incl. wastage (sq.ft)', derived: true, compute: (v) => r2(n(v.area) * (1 + n(v.wastagePct) / 100)) },
      { k: 'cornerRft', group: 'Profiles', label: 'Corner beading (running ft)', input: 'decimal' },
      { k: 'reducerRft', group: 'Profiles', label: 'Reducer profile (running ft)', input: 'decimal' },
      { k: 'tprofRft', group: 'Profiles', label: 'T-profile (running ft)', input: 'decimal' },
      { k: 'lprofRft', group: 'Profiles', label: 'L-profile (running ft)', input: 'decimal' },
    ],
    prerequisites: [
      { k: 'moisture', label: 'Wall moisture within threshold' },
      { k: 'even', label: 'Wall surface even' },
      { k: 'clean', label: 'Wall cleanliness (no dust / flaking paint)' },
      { k: 'structural', label: 'Wall structurally sound to bear panel weight' },
      { k: 'noSeep', label: 'No active seepage / dampness' },
      { k: 'ready', label: 'Room ready (no ongoing wet-trade work)' },
    ],
    legacyFields: [],
    installFields: [
      { k: 'installedArea', group: 'Installed', label: 'Area installed (sq.ft)', input: 'decimal' },
      { k: 'batch', group: 'Installed', label: 'Batch / lot no.', input: 'text' },
    ],
  },
};

export const CATEGORY_LIST: CategoryDef[] = Object.values(MD_CATEGORIES);

export type PrereqEntry = { status: string; note: string };

export type AuditSegment = {
  id?: number;
  facing: string | null;
  fields: FieldValues;
  photos: string[];
  prereq: Record<string, PrereqEntry>;
  flagged?: boolean;
  /* BM material selection (set from BM_Dashboard on the depot-site app) — read-only here. */
  material?: { sku?: string; productName?: string; url?: string; image?: string } | null;
};

export type AuditRoomV2 = {
  v: number;
  category: string;
  name: string;
  sku: string;
  variant: string | null;
  notes: string;
  sketchStrokes: unknown[];
  segments: AuditSegment[];
};

export type InstallRoomV2 = {
  v: 2;
  category: string;
  name: string;
  sku: string;
  fields: FieldValues;
  photos: string[];
  comments: string;
};

/* Category template for a category key / legacy `type` string. Falls back to flooring for display. */
export function categoryFor(type?: string | null): CategoryDef {
  return (type && MD_CATEGORIES[type]) || MD_CATEGORIES.flooring;
}

/* Compute every derived field top-down (later derived read earlier). Mutates + returns `values`. */
export function computeDerived(cat: CategoryDef | undefined, values: FieldValues): FieldValues {
  if (!cat || !cat.fields || !values) return values;
  cat.fields.forEach((f) => {
    if (f.derived && typeof f.compute === 'function') {
      try {
        values[f.k] = f.compute(values, cat);
      } catch {
        /* a bad partial value must never break typing */
      }
    }
  });
  return values;
}

/* Any 'Not OK' prerequisite in a segment flags it (soft flag, informational only). */
export function prereqFlagged(seg: { prereq?: Record<string, PrereqEntry> } | null | undefined): boolean {
  const p = seg && seg.prereq;
  if (!p) return false;
  return Object.keys(p).some((k) => p[k] && p[k].status === 'Not OK');
}

/* Normalize a legacy {type,calc,photos} audit room into a single-segment v:0 shape (passthrough
   when v>=2), so every read-only consumer (PDF + on-screen) has one shape to render. */
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

/* Values present on a segment for this category, in registry order. `isV2` picks the v2 field set
   vs the legacy label map. */
export function segmentRows(cat: CategoryDef, seg: AuditSegment, isV2: boolean): [string, string][] {
  if (isV2) {
    return cat.fields
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

/* Prerequisite rows recorded on a segment: [label, status, note]. */
export function segmentPrereqRows(cat: CategoryDef, seg: AuditSegment): [string, string, string][] {
  if (!seg.prereq) return [];
  return (cat.prerequisites || [])
    .filter((p) => seg.prereq[p.k] && seg.prereq[p.k].status)
    .map((p) => [p.label, seg.prereq[p.k].status, seg.prereq[p.k].note || ''] as [string, string, string]);
}

/* Installed-detail rows for one installation room (flat v2 shape or legacy {sku,qty,height,width}). */
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

/* Short per-type label/tag used by list, calendar and log strings across the install surfaces. */
export function typeLabel(t?: string | null): string {
  return t === 'wallpaper' ? 'Wallpaper' : t === 'wallpanel' ? 'Wall Panels' : 'Flooring';
}
export function typeTag(t?: string | null): string {
  return t === 'wallpaper' ? 'WP' : t === 'wallpanel' ? 'WPL' : 'FL';
}

/* ── BM customer journey ──────────────────────────────────────────────────
   The downstream stages after a site audit completes: order placement →
   render generation → client approval (may loop) → printing → delivery →
   install. None of it is derived from any system — entries are appended
   manually by the BM/SM and stored as a flat, append-only array in
   `audit_orders.bm_journey`. A `round` number lets the timeline group
   repeated render/approval cycles without a nested state machine. */
export type JourneyStage = {
  k: string;
  label: string;
  icon: string;
  hasRound?: boolean;
  hasDecision?: boolean;
  hasRef?: boolean;
  refLabel?: string;
};

export const MD_JOURNEY_STAGES: JourneyStage[] = [
  { k: 'order_placed', label: 'Order Placed', icon: '🧾', hasRef: true, refLabel: 'Order-placement enquiry ID' },
  { k: 'render_generated', label: 'Render Generated', icon: '🖼️', hasRound: true },
  { k: 'sent_for_approval', label: 'Sent for Client Approval', icon: '📤', hasRound: true },
  { k: 'client_feedback', label: 'Client Feedback', icon: '💬', hasRound: true, hasDecision: true },
  { k: 'printing', label: 'Printing', icon: '🖨️' },
  { k: 'delivery_scheduled', label: 'Delivery Scheduled', icon: '🚚', hasRef: true, refLabel: 'Delivery date / tracking no.' },
  { k: 'installed', label: 'Installed', icon: '✅' },
];

export type JourneyEntry = {
  id: string;
  ts: string;
  stage: string;
  round?: number | null;
  decision?: 'approved' | 'changes_requested' | null;
  note?: string;
  refId?: string;
  by?: { email?: string; name?: string; role?: string };
};

export function journeyStage(k: string): JourneyStage {
  return MD_JOURNEY_STAGES.find((s) => s.k === k) || { k, label: k, icon: '•' };
}

/* Per-segment material selection the BM records against a completed v2 job
   card (rides `audit_ticked.rooms[].segments[].material`). */
export type SegmentMaterial = {
  sku?: string;
  productName?: string;
  url?: string;
  image?: string | null;
  by?: { email?: string; name?: string };
  at?: string;
};
