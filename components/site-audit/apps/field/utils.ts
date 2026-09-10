'use client';

import { SketchPoint, SketchStroke } from '../types/field-app';

export function cloneStrokes(strokes: SketchStroke[]): SketchStroke[] {
  return strokes.map((s) => s.map((p) => ({ x: p.x, y: p.y })));
}

function dsHomography(fromPts: SketchPoint[], toPts: SketchPoint[]): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const { x: fx, y: fy } = fromPts[i];
    const { x: tx, y: ty } = toPts[i];
    A.push([fx, fy, 1, 0, 0, 0, -fx * tx, -fy * tx]);
    b.push(tx);
    A.push([0, 0, 0, fx, fy, 1, -fx * ty, -fy * ty]);
    b.push(ty);
  }
  const n = 8;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let mx = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[mx][c])) mx = r;
    [M[c], M[mx]] = [M[mx], M[c]];
    for (let r = c + 1; r < n; r++) {
      if (Math.abs(M[c][c]) < 1e-12) continue;
      const f = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= f * M[c][j];
    }
  }
  const h = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    h[i] = M[i][n];
    for (let j = i + 1; j < n; j++) h[i] -= M[i][j] * h[j];
    h[i] = Math.abs(M[i][i]) < 1e-12 ? 0 : h[i] / M[i][i];
  }
  return [...h, 1];
}

export function dsWarp(srcCv: HTMLCanvasElement, srcPts: SketchPoint[], outW: number, outH: number): HTMLCanvasElement {
  const dst: SketchPoint[] = [
    { x: 0, y: 0 },
    { x: outW, y: 0 },
    { x: outW, y: outH },
    { x: 0, y: outH },
  ];
  const H = dsHomography(dst, srcPts);
  const oc = document.createElement('canvas');
  oc.width = outW;
  oc.height = outH;
  const octx = oc.getContext('2d')!;
  const sctx = srcCv.getContext('2d')!;
  const sd = sctx.getImageData(0, 0, srcCv.width, srcCv.height);
  const od = octx.createImageData(outW, outH);
  const sw = srcCv.width, sh = srcCv.height, src = sd.data, out = od.data;
  for (let oy = 0; oy < outH; oy++) {
    let nx = H[1] * oy + H[2], ny = H[4] * oy + H[5], d = H[7] * oy + H[8];
    for (let ox = 0; ox < outW; ox++, nx += H[0], ny += H[3], d += H[6]) {
      const sx = nx / d, sy = ny / d, oi = (oy * outW + ox) * 4;
      if (sx < 0 || sy < 0 || sx >= sw - 1 || sy >= sh - 1) {
        out[oi] = out[oi + 1] = out[oi + 2] = 255;
        out[oi + 3] = 255;
        continue;
      }
      const x0 = sx | 0, y0 = sy | 0, fx = sx - x0, fy = sy - y0;
      for (let c = 0; c < 3; c++) {
        const p00 = src[(y0 * sw + x0) * 4 + c];
        const p10 = src[(y0 * sw + x0 + 1) * 4 + c];
        const p01 = src[(y0 * sw + x0 + sw) * 4 + c];
        const p11 = src[(y0 * sw + x0 + 1 + sw) * 4 + c];
        out[oi + c] = p00 * (1 - fx) * (1 - fy) + p10 * fx * (1 - fy) + p01 * (1 - fx) * fy + p11 * fx * fy;
      }
      out[oi + 3] = 255;
    }
  }
  octx.putImageData(od, 0, 0);
  return oc;
}

export function dsEnhanceCanvas(cv: HTMLCanvasElement): void {
  const ctx = cv.getContext('2d')!;
  const d = ctx.getImageData(0, 0, cv.width, cv.height);
  for (let i = 0; i < d.data.length; i += 4) {
    const g = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
    const e = Math.min(255, Math.max(0, (g - 128) * 1.6 + 128));
    d.data[i] = d.data[i + 1] = d.data[i + 2] = e;
  }
  ctx.putImageData(d, 0, 0);
}
