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

  rollCoverage: number | null;

  adjDim1?: string;

  unit?: string;
  variantUnits?: Record<string, string>;
  variantFields?: Record<string, CategoryField[]>;

  unitNote?: string;
  variantNote?: Record<string, string>;
  variantPrompt?: string;
  fields: CategoryField[];
  prerequisites: { k: string; label: string }[];
  legacyFields: [string, string][];
  installFields: CategoryField[];

  installTerms?: string[];
};

export type RoomLike = { v?: number; variant?: string | null } | null | undefined;

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

export type PrereqEntry = { status: string; note: string };

export type AuditSegment = {
  id?: number;
  facing: string | null;
  fields: FieldValues;
  photos: string[];
  prereq: Record<string, PrereqEntry>;
  adjust?: AdjustRow[];
  flagged?: boolean;

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

export type JourneyStage = {
  k: string;
  label: string;
  icon: string;
  hasRound?: boolean;
  hasDecision?: boolean;
  hasRef?: boolean;
  refLabel?: string;
};

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
