import { CategoryDef, CategoryField, JourneyStage } from './types';
import { skipDim } from './utils';
const MM2_PER_SQFT = 92903.04;

export const UNIT_DIV: Record<string, number> = { ft: 1, in: 144, mm: MM2_PER_SQFT };

export const ROOM_V = 3;

const AREA_MODE_FIELD = (): CategoryField => ({
  k: 'areaMode',
  group: 'Measurements',
  label: 'Record length x height for this wall/floor?',
  input: 'select',
  opts: ['Normal', 'Custom'],
});

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

const WALL_FIELDS = (u: string, opts: { wastage?: boolean; rolls?: boolean; extra?: CategoryField[] } = {}): CategoryField[] => {
  let f: CategoryField[] = [
    AREA_MODE_FIELD(),
    { k: 'height', group: 'Measurements', label: `Wall height (${u})`, input: 'decimal', showIf: (v) => !skipDim(v) },
    { k: 'width', group: 'Measurements', label: `Wall width (${u})`, input: 'decimal', showIf: (v) => !skipDim(v) },

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

    installTerms: [],
  },
};

export const CATEGORY_LIST: CategoryDef[] = Object.values(MD_CATEGORIES);

export const MD_JOURNEY_STAGES: JourneyStage[] = [
  { k: 'order_placed', label: 'Order Placed', icon: '🧾', hasRef: true, refLabel: 'Order-placement enquiry ID' },
  { k: 'render_generated', label: 'Render Generated', icon: '🖼️', hasRound: true },
  { k: 'sent_for_approval', label: 'Sent for Client Approval', icon: '📤', hasRound: true },
  { k: 'client_feedback', label: 'Client Feedback', icon: '💬', hasRound: true, hasDecision: true },
  { k: 'printing', label: 'Printing', icon: '🖨️' },
  { k: 'delivery_scheduled', label: 'Delivery Scheduled', icon: '🚚', hasRef: true, refLabel: 'Delivery date / tracking no.' },
  { k: 'installed', label: 'Installed', icon: '✅' },
];
