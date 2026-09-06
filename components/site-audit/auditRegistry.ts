/* Product-category registry for the site-audit / installation job-card system.
   TypeScript port of material-depot-site's /md-audit-registry.js — SINGLE SOURCE OF TRUTH for
   measurement fields, the segment model, prerequisites and legacy label maps. Every measured
   value on a job card is typed by the site auditor or BM — this file declares NO formulas (see
   MANUAL ENTRY below).

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
// Every category captures its linear dimensions in ONE unit, declared as `unit` below, and states
// its areas in sq.ft (which the auditor types). A category whose unit depends on the room-level
// variant (Standard vs Customized wallpaper) declares `variantUnits`/`variantFields` instead,
// resolved per room by unitFor/fieldsFor. UNIT_DIV survives only to read areas off pre-2026-09-06
// adjustment rows that stored dimensions alone — see adjArea().
const UNIT_DIV: Record<string, number> = { ft: 1, in: 144, mm: MM2_PER_SQFT };

export type FieldValues = Record<string, string | number>;

export type CategoryField = {
  k: string;
  group: string;
  label: string;
  input?: 'decimal' | 'text' | 'select';
  opts?: string[];
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
  /* sq.ft one roll of this category covers. Reference data only — it used to divide the area
     into a roll count, and nothing reads it now that the auditor types Rolls required. */
  rollCoverage: number | null;
  /* Label for the FIRST dimension of a rectangular area adjustment, in this
     category's own vocabulary. A wall has a height; a FLOOR does not — the
     adjustments auditors actually raise on a floor are furniture footprints
     ("Bed", "Cupboard"), which are length x width, the same pair the floor's own
     measurement fields already use. Defaults to 'Height', which is right for
     every wall category. (The Triangle branch keeps Base x Height: there `h` is
     the perpendicular altitude in `½ · base · height`, a geometry term rather
     than an architectural one, and it reads correctly on a floor plan.) */
  adjDim1?: string;
  // Base (pre-per-variant-unit) unit + field list — also what a pre-v3 room keeps resolving to.
  unit?: string;
  variantUnits?: Record<string, string>;
  variantFields?: Record<string, CategoryField[]>;
  // Registry-driven UI copy for the capture form's unit banner/variant gate — kept here (rather
  // than hardcoded per-category in the form) so it stays in sync with the unit it's describing.
  unitNote?: string;
  variantNote?: Record<string, string>;
  variantPrompt?: string;
  fields: CategoryField[];
  prerequisites: { k: string; label: string }[];
  legacyFields: [string, string][];
  installFields: CategoryField[];
  // Installation terms & conditions bullet clauses shown at both audit and install completion
  // (mdInstallTermsBlock). Categories with none yet contribute nothing — no branching needed
  // elsewhere. Mirrors material-depot-site's md-audit-registry.js verbatim.
  installTerms?: string[];
};

// Schema marker for a room written by the capture form. Bumped 2 -> 3 alongside per-variant units
// (material-depot-site's note 109): a v2 wallpaper room captured its height/width in mm whatever
// its variant, so v2 rooms MUST keep resolving to the base (mm) field list — see fieldsFor/unitFor.
// Both this repo and material-depot-site read/write the SAME audit_orders rows (same Supabase
// project), so this gate must stay in lockstep with the original's MD_ROOM_V — do not diverge it.
export const ROOM_V = 3;

type RoomLike = { v?: number; variant?: string | null } | null | undefined;
const roomV = (room: RoomLike): number => {
  const v = room && room.v;
  return v === undefined || v === null ? ROOM_V : v;
};

/* ---- AREA MODE (irregular walls/floors) --------------------------------------------------
   EVERY area on a job card is typed by the auditor/BM — nothing on this form is ever computed
   (see MANUAL ENTRY below). `fields.areaMode` therefore no longer picks "computed vs typed"; it
   only says whether this wall/floor HAS a sensible length x height to record alongside the area.
   'Normal' asks for the two dimensions, 'Custom' (an irregular wall/floor that can't be
   generalised as one length x height) hides them. Stored values stay 'Normal'/'Custom' so rooms
   captured before this change keep reading correctly. `showIf` is the only hook needed: every
   read-only renderer already renders fields generically from "does this field have a non-blank
   value", so a hidden height/width just stays blank. */
const AREA_MODE_FIELD = (): CategoryField => ({
  k: 'areaMode',
  group: 'Measurements',
  label: 'Record length x height for this wall/floor?',
  input: 'select',
  opts: ['Normal', 'Custom'],
});
const skipDim = (v: FieldValues): boolean => v.areaMode === 'Custom';

/* ---- AREA ADJUSTMENTS -------------------------------------------------------------------
   A segment may carry `adjust: AdjustRow[]` — small add/subtract areas that belong to THIS
   wall/floor rather than to a room of their own (a door to deduct, a niche to add), each with a
   shape (Rectangle/Triangle also record the two dimensions; Other records no dimensions), a
   typed area in sq.ft, a reason and a photo. h/w are in the segment's own unit and are a record
   of what was measured — the row's area is typed, not derived from them, and the segment's
   `fields.adjArea` total is typed too (see MANUAL ENTRY below). The measurement fields still read
   in the order gross area -> ± adjustments -> net area -> + wastage -> rolls; the auditor fills
   each one in. */
export type AdjustRow = {
  sign?: '+' | '-';
  shape?: 'Rectangle' | 'Triangle' | 'Other';
  h?: string | number;
  w?: string | number;
  area?: string | number;
  reason?: string;
  photos?: string[];
};

export type AdjustDisplayRow = {
  label: string;
  shape: string;
  size: string;
  area: string;
  reason: string;
  photos: string[];
  neg: boolean;
};

/* ---- MANUAL ENTRY -------------------------------------------------------------------------
   NOTHING in the Measurements group is calculated by the app. Area, adjustments, net area, area
   including wastage and rolls are all typed by the site auditor or BM and are never written,
   pre-filled or overwritten by a formula — the numbers on a job card are the numbers the person
   on site put there. Dimensions (height/width/length) and wastage % are still captured next to
   them as the record of HOW the area was arrived at; they no longer feed anything.

   This is deliberate and load-bearing: do not reintroduce a `compute` here. Job cards captured
   before 2026-09-06 hold formula-produced values in exactly these keys, so they keep rendering
   unchanged — only new entry is manual. */
const ADJ_FIELD = (): CategoryField => ({
  k: 'adjArea',
  group: 'Measurements',
  label: 'Adjustments (± sq.ft)',
  input: 'decimal',
});
const NET_FIELD = (): CategoryField => ({
  k: 'netArea',
  group: 'Measurements',
  label: 'Net area (sq.ft)',
  input: 'decimal',
});
const WASTAGE_FIELDS = (): CategoryField[] => [
  { k: 'wastagePct', group: 'Measurements', label: 'Wastage to add (%)', input: 'decimal' },
  { k: 'areaW', group: 'Measurements', label: 'Area incl. wastage (sq.ft)', input: 'decimal' },
];
const ROLLS_FIELD = (): CategoryField => ({
  k: 'rolls',
  group: 'Measurements',
  label: 'Rolls required',
  input: 'decimal',
});
// Wall-style measurement block (wallpaper / CNC / panels) in unit `u`.
const WALL_FIELDS = (u: string, opts: { wastage?: boolean; rolls?: boolean; extra?: CategoryField[] } = {}): CategoryField[] => {
  let f: CategoryField[] = [
    AREA_MODE_FIELD(),
    { k: 'height', group: 'Measurements', label: `Wall height (${u})`, input: 'decimal', showIf: (v) => !skipDim(v) },
    { k: 'width', group: 'Measurements', label: `Wall width (${u})`, input: 'decimal', showIf: (v) => !skipDim(v) },
    // Typed by the auditor/BM, never derived from height x width — see MANUAL ENTRY above.
    { k: 'area', group: 'Measurements', label: 'Area (sq.ft)', input: 'decimal' },
    ADJ_FIELD(),
    NET_FIELD(),
  ];
  if (opts.wastage) f = f.concat(WASTAGE_FIELDS());
  if (opts.rolls) f = f.concat([ROLLS_FIELD()]);
  if (opts.extra) f = f.concat(opts.extra);
  return f;
};
const PROFILE_FIELDS = (): CategoryField[] => [
  { k: 'cornerRft', group: 'Profiles', label: 'Corner beading (running ft)', input: 'decimal' },
  { k: 'reducerRft', group: 'Profiles', label: 'Reducer profile (running ft)', input: 'decimal' },
  { k: 'tprofRft', group: 'Profiles', label: 'T-profile (running ft)', input: 'decimal' },
  { k: 'lprofRft', group: 'Profiles', label: 'L-profile (running ft)', input: 'decimal' },
];

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
    adjDim1: 'Length',
    unit: 'ft',
    unitNote: 'Room length & width are entered in FEET (ft). Area is entered in sq.ft.',
    fields: (
      [
        AREA_MODE_FIELD(),
        { k: 'length', group: 'Measurements', label: 'Room length (ft)', input: 'decimal', showIf: (v) => !skipDim(v) },
        { k: 'width', group: 'Measurements', label: 'Room width (ft)', input: 'decimal', showIf: (v) => !skipDim(v) },
        // Typed by the auditor/BM, never derived from length x width — see MANUAL ENTRY above.
        { k: 'area', group: 'Measurements', label: 'Total area (sq.ft)', input: 'decimal' },
        ADJ_FIELD(),
        NET_FIELD(),
      ] as CategoryField[]
    )
      .concat(WASTAGE_FIELDS())
      .concat([
        { k: 'skirtKind', group: 'Skirting', label: 'Skirting type', input: 'select', opts: ['None', 'Normal', 'Step'] },
        { k: 'skirtH', group: 'Skirting', label: 'Normal skirting — height (mm)', input: 'decimal', showIf: (v) => v.skirtKind === 'Normal' },
        { k: 'skirtRft', group: 'Skirting', label: 'Normal skirting — qty (running ft)', input: 'decimal', showIf: (v) => v.skirtKind === 'Normal' },
        { k: 'stepTileH', group: 'Skirting', label: 'Step skirting — tile height (mm)', input: 'decimal', showIf: (v) => v.skirtKind === 'Step' },
        { k: 'stepTileT', group: 'Skirting', label: 'Step skirting — tile thickness (mm)', input: 'decimal', showIf: (v) => v.skirtKind === 'Step' },
        { k: 'stepRft', group: 'Skirting', label: 'Step skirting — qty (running ft)', input: 'decimal', showIf: (v) => v.skirtKind === 'Step' },
      ])
      .concat(PROFILE_FIELDS()),
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
    installTerms: [
      'Floor must be clean, dry, level & free from dust/seepage.',
      "Any levelling, repair, waterproofing or moisture treatment is customer's scope.",
      'Flooring should be acclimatised for 24–48 hours before installation.',
      "Door trimming, skirting removal/reinstallation and major carpentry work are customer's scope unless included.",
      'Site must be ready and furniture cleared before installation.',
      '1-year installation warranty applies to workmanship, subject to all site requirements being fulfilled.',
    ],
  },
  wallpaper: {
    id: 'wallpaper',
    label: 'Wallpaper',
    pdfLabel: 'Wallpaper',
    segment: WALL_SEGMENT,
    variants: ['Standard', 'Customized'],
    rollCoverage: 57,
    // Unit depends on the room-level variant: Standard is measured in feet, Customized in
    // millimetres. `unit`/`fields` are the pre-per-variant-unit (v2) baseline — mm for both
    // variants — and stay here so historical v2 rooms keep rendering in the unit they were
    // captured in (see fieldsFor/unitFor's room.v>=3 gate).
    unit: 'mm',
    variantUnits: { Standard: 'ft', Customized: 'mm' },
    variantFields: {
      Standard: WALL_FIELDS('ft', { wastage: true, rolls: true }),
      Customized: WALL_FIELDS('mm', { wastage: true, rolls: true }),
    },
    variantNote: {
      Standard: 'Standard wallpaper — wall height & width are entered in FEET (ft). Area is entered in sq.ft.',
      Customized: 'Customized wallpaper — wall height & width are entered in MILLIMETRES (mm). Area is entered in sq.ft.',
    },
    variantPrompt: 'Pick Standard or Customized above — measurements are in feet for Standard and millimetres for Customized.',
    // Baseline note for a pre-v3 room, which was captured in mm whatever its variant.
    unitNote: 'Wall height & width are entered in MILLIMETRES (mm). Area is entered in sq.ft.',
    fields: WALL_FIELDS('mm', { wastage: true, rolls: true }),
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
    installTerms: [
      "Oil-based primer is mandatory for the 1-year installation warranty; primer & application are customer's scope.",
      '2 coats of oil primer compulsory on MDF/HDHMR/Plywood.',
      "Ladder/scaffolding for higher heights is customer's scope.",
      'Surface must be smooth, dry, clean & dust-free, with no seepage/dampness.',
      "Existing wallpaper removal & surface repairs are customer's scope unless specifically booked.",
      'Installation may be rescheduled if the site is not ready.',
    ],
  },
  cnc: {
    id: 'cnc',
    label: 'CNC',
    pdfLabel: 'CNC',
    segment: WALL_SEGMENT,
    variants: null,
    rollCoverage: null,
    unit: 'mm',
    unitNote: 'CNC — wall height & width are entered in MILLIMETRES (mm). Area is entered in sq.ft.',
    fields: WALL_FIELDS('mm'),
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
    // Pending — to be supplied. Contributes nothing to mdInstallTermsBlock until filled in.
    installTerms: [],
  },
  wallpanel: {
    id: 'wallpanel',
    label: 'Wall Panels',
    pdfLabel: 'Wall Panels',
    segment: WALL_SEGMENT,
    variants: null,
    rollCoverage: null,
    unit: 'in',
    unitNote: 'Wall Panels — wall height & width are entered in INCHES (in). Area is entered in sq.ft.',
    fields: WALL_FIELDS('in', { wastage: true, extra: PROFILE_FIELDS() }),
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
    // Pending — to be supplied. Contributes nothing to mdInstallTermsBlock until filled in.
    installTerms: [],
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
  adjust?: AdjustRow[];
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

/* Formatted installation-terms block for the category keys actually involved (audit: every
   distinct room category in the job card; install: the single subjob category). Categories with
   no installTerms yet (cnc/wallpanel) are silently skipped — no branching needed elsewhere.
   Shared by both apps' on-screen T&C screens and the branded PDF consent page. */
export function mdInstallTermsBlock(categoryKeys: (string | null | undefined)[]): string {
  const seen = new Set<string>();
  const blocks = categoryKeys
    .filter((k): k is string => !!k && !seen.has(k) && (seen.add(k), true))
    .map((k) => MD_CATEGORIES[k])
    .filter((cat): cat is CategoryDef => !!cat && !!cat.installTerms && cat.installTerms.length > 0)
    .map((cat) => cat.label + ':\n' + cat.installTerms!.map((t) => '• ' + t).join('\n'));
  return blocks.join('\n\n');
}

/* ---- PER-ROOM UNIT / FIELD RESOLUTION ------------------------------------------------------
   A room's measurement field list is no longer just `cat.fields` — for a category with
   per-variant units it depends on the room's `variant`, and on the room's schema version (v2
   rooms predate per-variant units and were all captured in the base unit). ALWAYS go through
   fieldsFor/unitFor rather than reading cat.fields directly. */
export function needsVariant(cat: CategoryDef, room?: RoomLike): boolean {
  return !!(cat && cat.variantFields && roomV(room) >= 3 && !(room && room.variant));
}
export function unitFor(cat: CategoryDef, room?: RoomLike): string {
  if (cat.variantUnits && room && room.variant && roomV(room) >= 3) {
    return cat.variantUnits[room.variant] || cat.unit || 'ft';
  }
  return cat.unit || 'ft';
}
export function fieldsFor(cat: CategoryDef, room?: RoomLike): CategoryField[] {
  if (cat.variantFields && room && room.variant && roomV(room) >= 3) {
    return cat.variantFields[room.variant] || cat.fields;
  }
  return cat.fields;
}
/* Unit banner for the capture form — per-variant where the variant decides the unit. Blank while
   the variant is still unpicked, since the variant prompt already states both units. */
export function unitNoteFor(cat: CategoryDef, room?: RoomLike): string {
  if (!cat) return '';
  if (needsVariant(cat, room)) return '';
  if (cat.variantNote && room && room.variant && roomV(room) >= 3) return cat.variantNote[room.variant] || '';
  return cat.unitNote || '';
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
   vs the legacy label map. `room` is needed to resolve a per-variant-unit category's field list. */
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

/* Prerequisite rows recorded on a segment: [label, status, note]. */
export function segmentPrereqRows(cat: CategoryDef, seg: AuditSegment): [string, string, string][] {
  if (!seg.prereq) return [];
  return (cat.prerequisites || [])
    .filter((p) => seg.prereq[p.k] && seg.prereq[p.k].status)
    .map((p) => [p.label, seg.prereq[p.k].status, seg.prereq[p.k].note || ''] as [string, string, string]);
}

/* Unsigned sq.ft magnitude of one adjustment row.

   The auditor now types every adjustment's area in sq.ft, whatever its shape — nothing here is
   calculated during capture (see MANUAL ENTRY above), and `a.area` is the value the capture form
   writes for Rectangle, Triangle and Other alike.

   The h*w fallback below is READ-ONLY BACKWARD COMPATIBILITY, not a calculation the form still
   performs: rows captured before 2026-09-06 stored only `h`/`w` (+ an implicit 'Rectangle', which
   is why absent `shape` is treated as one) and would otherwise render as 0 — i.e. drop off their
   own job card and out of the missing-reason/photo gates. Keep it for those rows; a row with a
   typed `area` always wins. */
function adjArea(a: AdjustRow | null | undefined, div: number): number {
  if (!a) return 0;
  if (String(a.area ?? '') !== '') return n(a.area);
  if (a.shape === 'Other') return 0;
  const mult = a.shape === 'Triangle' ? 0.5 : 1;
  const raw = n(a.h) * n(a.w) * mult;
  return raw ? r2(raw / div) : 0;
}
/* Display rows for a segment's adjustments. Empty rows (no area) are dropped so a half-typed
   adjustment never reaches a job card. */
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
/* Any adjustment carrying an area but no stated reason — the capture form soft-gates on this. */
export function adjMissingReason(cat: CategoryDef, room: RoomLike, adjust?: AdjustRow[] | null): boolean {
  return adjRows(cat, room, adjust).some((r) => !r.reason);
}
/* Any adjustment carrying an area but no photo — the capture form soft-gates on this too. */
export function adjMissingPhoto(cat: CategoryDef, room: RoomLike, adjust?: AdjustRow[] | null): boolean {
  return adjRows(cat, room, adjust).some((r) => !r.photos || !r.photos.length);
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
