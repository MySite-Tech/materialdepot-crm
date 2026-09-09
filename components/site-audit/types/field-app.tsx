'use client';

export type SketchPoint = { x: number; y: number };

export type SketchStroke = SketchPoint[];

export interface SketchCanvasHandle {
  undo(): void;
  clear(): void;
  export(): string;
}

export interface SketchCanvasProps {
  value?: SketchStroke[];
  onChange?: (strokes: SketchStroke[]) => void;
  className?: string;
}

export interface SignaturePadHandle {
  clear(): void;
  isEmpty(): boolean;
  export(): string;
}

export interface SignaturePadProps {
  className?: string;
}

export interface LocationTracker {
  start(orderPi: string | null): void;
  stop(): void;
}

export interface ArrivalCaptureResult {
  photo: string | null;
  lat: number | null;
  lng: number | null;
}

export interface ArrivalCameraModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (result: ArrivalCaptureResult) => void;
}

export interface DocScannerModalProps {
  open: boolean;
  onClose: () => void;
  onScanned: (url: string) => void;
}
