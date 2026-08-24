/* Shared job-card PDF branding + registry-driven room renderers.
   TypeScript port of material-depot-site's /md-pdf.js — brand palette is black / white / yellow,
   and every job-card PDF in this app (auditor, installer, SM audit, SM install) renders the same
   logo header, section titles and table styling through these helpers. */

import { jsPDF } from 'jspdf';
import { applyPlugin } from 'jspdf-autotable';
import { MD_LOGO_H, MD_LOGO_W, brandLogoPng, loadBrandLogo } from './mdLogo';
import {
  adjRows,
  categoryFor,
  installRoomPhotos,
  installRoomRows,
  normalizeRoom,
  segmentPrereqRows,
  segmentRows,
} from './auditRegistry';

/* jspdf-autotable v5 only patches `doc.autoTable` when jsPDF is present as a UMD global on
   `window` — which it never is in a bundled app, so the plugin's bare side-effect import silently
   does nothing and every `doc.autoTable(...)` call throws "not a function". Apply it explicitly,
   once, here: every PDF generator in this tab imports this module, so the prototype is patched
   before any of them build a document. */
applyPlugin(jsPDF as any);

export type RGB = [number, number, number];

export const MD_INK: RGB = [26, 28, 36];
export const MD_YELLOW: RGB = [244, 194, 13];
export const MD_MUTED: RGB = [110, 116, 130];
export const MD_LINE: RGB = [214, 214, 220];
export const MD_LABELFILL: RGB = [246, 246, 243];

/* Shared image downscale/compress. Resolves a JPEG dataURL, or null on any failure so a caller's
   addImage try/catch is a harmless no-op. */
export function mdCompress(dataUrl?: string | null, maxW = 1600, maxH = 1200, q = 0.88): Promise<string | null> {
  return new Promise((resolve) => {
    if (!dataUrl) {
      resolve(null);
      return;
    }
    const im = new Image();
    if (String(dataUrl).indexOf('http') === 0) im.crossOrigin = 'anonymous';
    im.onload = () => {
      try {
        const s = Math.min(1, maxW / im.width, maxH / im.height);
        const w = Math.round(im.width * s), h = Math.round(im.height * s);
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        cv.getContext('2d')!.drawImage(im, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', q));
      } catch {
        resolve(null);
      }
    };
    im.onerror = () => resolve(null);
    im.src = dataUrl;
  });
}

/* Rasterises the brand logo so the (synchronous) header below can place it. Call once before
   generating a PDF; the result is cached for the rest of the session. */
export { loadBrandLogo };

/* Branded page header: logo top-left, title + optional right-side ref on the right, and a yellow
   accent rule. Returns the new y so callers can do `y = mdPdfHeader(doc, {...})`. */
export function mdPdfHeader(doc: any, opts: { title?: string; right?: string; M?: number } = {}): number {
  const M = opts.M ?? 40;
  const W = doc.internal.pageSize.getWidth();
  let y = M;
  const logoW = 150, logoH = (logoW * MD_LOGO_H) / MD_LOGO_W;
  const logo = brandLogoPng();
  try {
    if (!logo) throw new Error('logo not rasterised');
    doc.addImage(logo, 'PNG', M, y, logoW, logoH);
  } catch {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(...MD_INK);
    doc.text('MATERIAL DEPOT', M, y + 18);
  }
  if (opts.title) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...MD_INK);
    doc.text(String(opts.title).toUpperCase(), W - M, y + 15, { align: 'right' });
  }
  if (opts.right) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MD_MUTED);
    doc.text(String(opts.right), W - M, y + 29, { align: 'right' });
  }
  y += logoH + 9;
  doc.setDrawColor(...MD_YELLOW);
  doc.setLineWidth(2.6);
  doc.line(M, y, W - M, y);
  return y + 17;
}

/* Yellow left-bar + bold ink section title. Returns the new y. */
export function mdSectionTitle(doc: any, text: string, y: number, M = 40): number {
  doc.setFillColor(...MD_YELLOW);
  doc.rect(M, y - 8, 4, 13, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...MD_INK);
  doc.text(String(text), M + 10, y + 2);
  return y + 12;
}

/* Brand-styled autoTable options (ink header, off-white label column, grey grid). */
export function mdBrandGrid(extra: Record<string, any> = {}): Record<string, any> {
  return {
    theme: 'grid',
    headStyles: { fillColor: MD_INK, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
    styles: { fontSize: 9, cellPadding: 5, lineColor: MD_LINE, textColor: [30, 30, 30] },
    ...extra,
  };
}

/* Label-column body table used for the order/job header block on page 1. */
export function mdInfoTable(doc: any, y: number, body: (string | number)[][], M = 40): number {
  doc.autoTable(
    mdBrandGrid({
      startY: y,
      margin: { left: M, right: M },
      body,
      columnStyles: { 0: { cellWidth: 130, fontStyle: 'bold', textColor: MD_INK, fillColor: MD_LABELFILL } },
    }),
  );
  return doc.lastAutoTable.finalY + 10;
}

export type RoomPdfOpts = {
  M?: number;
  W?: number;
  H?: number;
  compress?: (d?: string | null) => Promise<string | null>;
  sketchImg?: string | null;
  header?: () => number;
};

/* Renders ONE audit room's full body — measurement tables + prerequisites + per-segment photos +
   room sketch + notes — page-break aware. `room` may be a legacy {type,calc} shape or a v2
   {v:2,segments:[…]} shape; it is normalized internally. Returns the new y. */
export async function mdPdfAuditRoom(doc: any, room: any, yStart: number, opts: RoomPdfOpts = {}): Promise<number> {
  const M = opts.M ?? 40;
  const W = opts.W ?? doc.internal.pageSize.getWidth();
  const H = opts.H ?? doc.internal.pageSize.getHeight();
  const compress = opts.compress || ((d?: string | null) => mdCompress(d));
  const nroom = normalizeRoom(room);
  const cat = categoryFor(nroom.category);
  const isV2 = nroom.v >= 2;
  const multi = isV2 && cat.segment && cat.segment.model === 'multi';
  let y = yStart;
  const ensure = (space: number) => {
    if (y + space > H - M) {
      doc.addPage();
      y = opts.header ? opts.header() : M;
    }
  };

  if (opts.sketchImg) {
    ensure(160);
    doc.setFontSize(8.5);
    doc.setTextColor(...MD_MUTED);
    doc.text('2D Diagram', M, y);
    const sw = (W - 2 * M) * 0.6, sh = sw * 0.7;
    try {
      doc.addImage(opts.sketchImg, 'JPEG', M, y + 6, sw, sh);
    } catch {
      /* unrenderable sketch — skip */
    }
    y += sh + 16;
  }

  const segs = nroom.segments || [];
  for (let si = 0; si < segs.length; si++) {
    const seg = segs[si];
    if (multi) {
      ensure(24);
      let st = (cat.segment.segLabel || 'Segment') + ' ' + (si + 1) + (seg.facing ? ' — ' + seg.facing : '');
      if (nroom.variant) st += '   ·   ' + nroom.variant;
      y = mdSectionTitle(doc, st, y + 8, M) + 4;
    }
    const rows = segmentRows(cat, seg, isV2, nroom);
    if (rows.length) {
      ensure(34 + rows.length * 20);
      doc.autoTable(
        mdBrandGrid({
          startY: y,
          margin: { left: M, right: M },
          head: [['Measurement', 'Value']],
          body: rows,
          columnStyles: { 0: { cellWidth: 250, fontStyle: 'bold', textColor: MD_INK, fillColor: MD_LABELFILL } },
        }),
      );
      y = doc.lastAutoTable.finalY + 8;
    }
    const adj = isV2 ? adjRows(cat, nroom, seg.adjust) : [];
    if (adj.length) {
      ensure(34 + adj.length * 20);
      doc.autoTable(
        mdBrandGrid({
          startY: y,
          margin: { left: M, right: M },
          head: [['Area adjustment', 'Shape', 'Size', 'sq.ft', 'Reason']],
          body: adj.map((a) => [a.label, a.shape, a.size, a.area, a.reason || '—']),
          columnStyles: {
            0: { cellWidth: 78, fontStyle: 'bold', textColor: MD_INK, fillColor: MD_LABELFILL },
            1: { cellWidth: 64 },
            2: { cellWidth: 96 },
            3: { cellWidth: 48 },
          },
        }),
      );
      y = doc.lastAutoTable.finalY + 8;
    }
    if (isV2) {
      const prows = segmentPrereqRows(cat, seg);
      if (prows.length) {
        ensure(34 + prows.length * 20);
        doc.autoTable(
          mdBrandGrid({
            startY: y,
            margin: { left: M, right: M },
            head: [['Site readiness check', 'Status', 'Note']],
            body: prows,
            columnStyles: {
              0: { cellWidth: 250, fontStyle: 'bold', textColor: MD_INK, fillColor: MD_LABELFILL },
              1: { cellWidth: 74 },
            },
          }),
        );
        y = doc.lastAutoTable.finalY + 8;
      }
    }
    const photos = (seg.photos || []).filter(Boolean);
    for (let ph = 0; ph < photos.length; ph++) {
      const img = await compress(photos[ph]);
      if (!img) continue;
      const pw = W - 2 * M, phh = pw * 0.56;
      ensure(phh + 22);
      doc.setFontSize(8.5);
      doc.setTextColor(...MD_MUTED);
      doc.text((multi && seg.facing ? seg.facing + ' — ' : '') + 'Photo ' + (ph + 1), M, y);
      try {
        doc.addImage(img, 'JPEG', M, y + 6, pw, phh);
      } catch {
        /* unrenderable photo — skip */
      }
      y += phh + 16;
    }
  }

  if (nroom.notes) {
    ensure(46);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...MD_INK);
    doc.text('Notes', M, y);
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40, 40, 40);
    const ls = doc.splitTextToSize(nroom.notes, W - 2 * M);
    doc.text(ls, M, y);
    y += ls.length * 12 + 6;
  }
  return y;
}

/* Renders ONE installation room's body — installed-detail table + photos + comments, page-break
   aware. Handles flat v2 install rooms and legacy {sku,qty,height,width} rooms. */
export async function mdPdfInstallRoom(doc: any, room: any, yStart: number, opts: RoomPdfOpts = {}): Promise<number> {
  const M = opts.M ?? 40;
  const W = opts.W ?? doc.internal.pageSize.getWidth();
  const H = opts.H ?? doc.internal.pageSize.getHeight();
  const compress = opts.compress || ((d?: string | null) => mdCompress(d));
  let y = yStart;
  const ensure = (space: number) => {
    if (y + space > H - M) {
      doc.addPage();
      y = opts.header ? opts.header() : M;
    }
  };

  const rows = installRoomRows(room);
  const photos = installRoomPhotos(room);
  const comments = room?.comments || room?.notes || '';

  if (rows.length) {
    ensure(34 + rows.length * 20);
    doc.autoTable(
      mdBrandGrid({
        startY: y,
        margin: { left: M, right: M },
        head: [['Detail', 'Value']],
        body: rows,
        columnStyles: { 0: { cellWidth: 210, fontStyle: 'bold', textColor: MD_INK, fillColor: MD_LABELFILL } },
      }),
    );
    y = doc.lastAutoTable.finalY + 8;
  }
  for (let p = 0; p < photos.length; p++) {
    const img = await compress(photos[p]);
    if (!img) continue;
    const pw = W - 2 * M, phh = pw * 0.56;
    ensure(phh + 22);
    doc.setFontSize(8.5);
    doc.setTextColor(...MD_MUTED);
    doc.text('Photo ' + (p + 1), M, y);
    try {
      doc.addImage(img, 'JPEG', M, y + 6, pw, phh);
    } catch {
      /* unrenderable photo — skip */
    }
    y += phh + 16;
  }
  if (comments) {
    ensure(46);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(...MD_INK);
    doc.text('Comments', M, y);
    y += 12;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(40, 40, 40);
    const cls = doc.splitTextToSize(comments, W - 2 * M);
    doc.text(cls, M, y);
    y += cls.length * 12 + 6;
  }
  return y;
}
