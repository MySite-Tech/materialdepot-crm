'use client';

import { SketchPoint } from '../types/field-app';

export const SKETCH_DOT_SPACING = 22;

export const SKETCH_STROKE_COLOR = '#1F3A5F';

export const SKETCH_LINE_WIDTH = 2.2;

export const SKETCH_EXPORT_WIDTH = 1000;

export const SKETCH_EXPORT_LINE_WIDTH = 3.2;

export const SKETCH_EXPORT_QUALITY = 0.85;

export const SIGN_STROKE_COLOR = '#13294a';

export const SIGN_LINE_WIDTH = 2.4;

export const SIGN_EXPORT_WIDTH = 900;

export const SIGN_EXPORT_LINE_WIDTH = 3;

export const SIGN_EXPORT_QUALITY = 0.9;

export const SIGN_EXPORT_RATIO_FALLBACK = 0.3;

export const LOCATION_PATCH_INTERVAL_MS = 300000;

export const LOCATION_WATCH_MIN_GAP_MS = 300000;

export const LOCATION_INTERVAL_MIN_GAP_MS = 299000;

export const DS_DEFAULT_CORNERS: SketchPoint[] = [
  { x: 0.08, y: 0.08 },
  { x: 0.92, y: 0.08 },
  { x: 0.92, y: 0.92 },
  { x: 0.08, y: 0.92 },
];

export const DS_MAX_OUTPUT_DIM = 900;

export const DS_HANDLE_INDICES = [0, 1, 2, 3] as const;
