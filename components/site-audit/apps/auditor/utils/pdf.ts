'use client';

import { Order } from '../../types/auditor';
import { SketchStroke } from '@/components/site-audit/apps/field-app-shared';
import { MD_INK, MD_MUTED, loadBrandLogo, mdBrandGrid, mdCompress, mdInfoTable, mdPdfAuditRoom, mdPdfConsent, mdPdfHeader } from '@/components/site-audit/brand/pdf-brand';
import { categoryFor, mdInstallTermsBlock } from '@/components/site-audit/data/audit-registry';
import { fmtDateA } from '@/components/site-audit/shared';
import { jsPDF } from 'jspdf';

function compressImageDataUrl(dataUrl: string | null | undefined): Promise<string | null> {
  if (!dataUrl) return Promise.resolve(null);
  return new Promise((resolve) => {
    const im = new Image();
    if (dataUrl.startsWith('http')) im.crossOrigin = 'anonymous';
    im.onload = () => {
      try {
        const s = Math.min(1, 1600 / im.width, 1200 / im.height);
        const w = Math.round(im.width * s), h = Math.round(im.height * s);
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        cv.getContext('2d')!.drawImage(im, 0, 0, w, h);
        resolve(cv.toDataURL('image/jpeg', 0.88));
      } catch {
        resolve(null);
      }
    };
    im.onerror = () => resolve(null);
    im.src = dataUrl;
  });
}

export function renderSketchData(sketchStrokes: SketchStroke[] | undefined): string | null {
  if (!sketchStrokes || !sketchStrokes.length) return null;
  const W = 1000, H = 500;
  const o = document.createElement('canvas');
  o.width = W;
  o.height = H;
  const x = o.getContext('2d')!;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, W, H);
  const s = Math.round(22 * (W / 360));
  x.fillStyle = '#b2b8c1';
  for (let yy = s; yy < H; yy += s) {
    for (let xx = s; xx < W; xx += s) {
      x.beginPath();
      x.arc(xx, yy, 2, 0, 7);
      x.fill();
    }
  }
  x.strokeStyle = '#1F3A5F';
  x.lineWidth = 3.2;
  x.lineJoin = 'round';
  x.lineCap = 'round';
  for (const st of sketchStrokes) {
    if (st.length < 1) continue;
    x.beginPath();
    st.forEach((p, i) => {
      const X = p.x * W, Y = p.y * H;
      if (i) x.lineTo(X, Y);
      else x.moveTo(X, Y);
    });
    x.stroke();
  }
  return o.toDataURL('image/jpeg', 0.85);
}

export async function genPDF(order: Order, auditorName: string): Promise<string> {
  await loadBrandLogo();
  const doc: any = new jsPDF('p', 'pt', 'a4');
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
  let y = M;
  const navy = MD_INK;
  const muted = MD_MUTED;
  const rooms: any[] = order.jobcard?.rooms || [];

  function header() {
    y = mdPdfHeader(doc, { title: 'Site Audit Job Card', right: order.pi, M });
    return y;
  }
  header();
  y = mdInfoTable(
    doc,
    y,
    [
      ['Proforma Invoice No.', order.pi],
      ['Client Name', order.name],
      ['Client Mobile', order.phone],
      ['Site Address', order.addr],
      ['BM', order.bm],
      ['Auditor', auditorName],
      ['Date', fmtDateA(order.date)],
    ],
    M,
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...navy);
  doc.text('Rooms summary', M, y + 4);
  y += 10;
  doc.autoTable(
    mdBrandGrid({
      startY: y,
      margin: { left: M, right: M },
      styles: { fontSize: 8.5, cellPadding: 4, lineColor: [210, 216, 225] },
      head: [['#', 'Room', 'Type', 'SKU No.']],
      body: rooms.map((r, i) => [String(i + 1), r.name || '-', categoryFor(r.category || r.type).pdfLabel, r.sku || 'NA']),
    }),
  );

  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    doc.addPage();
    y = M;
    header();
    const cat = categoryFor(r.category || r.type);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(...navy);
    doc.text('Room ' + (i + 1) + ': ' + (r.name || '-'), M, y + 2);
    y += 14;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...muted);
    doc.text(cat.pdfLabel + '  ·  SKU: ' + (r.sku || 'NA'), M, y + 10);
    y += 24;
    y = await mdPdfAuditRoom(doc, r, y, {
      M,
      W,
      H,
      compress: (d) => mdCompress(d),
      sketchImg: renderSketchData(r.sketchStrokes),
      header: () => mdPdfHeader(doc, { title: 'Site Audit Job Card', right: order.pi, M }),
    });
  }

  doc.addPage();
  y = M;
  header();
  const R = order.jobcard?.sign?.ratings;
  if (R) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(...navy);
    doc.text('Client Feedback', M, y);
    y += 14;
    doc.autoTable({
      startY: y,
      margin: { left: M, right: M },
      theme: 'grid',
      styles: { fontSize: 9, cellPadding: 4 },
      columnStyles: { 0: { cellWidth: 260, fontStyle: 'bold', textColor: navy, fillColor: [238, 243, 249] } },
      body: [
        ['Overall Site Audit experience', String(R.q1 || '—') + ' / 10'],
        ['Site Auditor behaviour', String(R.q2 || '—') + ' / 10'],
        ['Site cleanliness after audit', String(R.q3 || '—') + ' / 10'],
        ...(R.comments ? [['Comments', R.comments]] : []),
      ],
    });
    y = doc.lastAutoTable.finalY + 12;
  }
  await mdPdfConsent(doc, {
    y,
    M,
    W,
    H,
    compress: compressImageDataUrl,
    consentText:
      'I confirm that the site audit for the above order has been carried out by the Material Depot auditor, that the rooms, measurements and details recorded in this Job Card are correct, and that I am satisfied with the service provided, and that I have read, understood and agree to the installation terms & conditions below.',
    termsBlock: mdInstallTermsBlock([...new Set(rooms.map((r) => r.category || r.type))]),
    personName: order.jobcard?.sign?.name || order.name,
    personDate: fmtDateA(order.date),
    sign: order.jobcard?.sign,
    header: () => mdPdfHeader(doc, { title: 'Site Audit Job Card', right: order.pi, M }),
  });
  return URL.createObjectURL(doc.output('blob'));
}
