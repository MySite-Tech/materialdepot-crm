'use client';

import { Job } from '../types';
import { MD_INK, MD_MUTED, loadBrandLogo, mdBrandGrid, mdInfoTable, mdPdfAuditRoom, mdPdfConsent, mdPdfHeader, mdPdfInstallRoom } from '@/components/site-audit/brand/pdf-brand';
import { categoryFor, mdInstallTermsBlock } from '@/components/site-audit/data/audit-registry';
import { fmtDateA } from '@/components/site-audit/shared';
import { jsPDF } from 'jspdf';

function compressForPdf(dataUrl: string | null | undefined): Promise<string | null> {
  if (!dataUrl) return Promise.resolve(null);
  return new Promise((res) => {
    const im = new Image();
    if (dataUrl.startsWith('http')) im.crossOrigin = 'anonymous';
    im.onload = () => {
      try {
        const s = Math.min(1, 1600 / Math.max(im.width, im.height));
        const w = Math.round(im.width * s), h = Math.round(im.height * s);
        const cv = document.createElement('canvas');
        cv.width = w;
        cv.height = h;
        cv.getContext('2d')!.drawImage(im, 0, 0, w, h);
        res(cv.toDataURL('image/jpeg', 0.88));
      } catch {
        res(null);
      }
    };
    im.onerror = () => res(null);
    im.src = dataUrl;
  });
}

function renderSketch(r: any): string | null {
  if (!r.sketchStrokes || !r.sketchStrokes.length) return null;
  const W = 1000, H = 500;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');
  if (!x) return null;
  x.fillStyle = '#fff';
  x.fillRect(0, 0, W, H);
  const s = Math.round(22 * (W / 360));
  x.fillStyle = '#b2b8c1';
  for (let yy = s; yy < H; yy += s) for (let xx = s; xx < W; xx += s) { x.beginPath(); x.arc(xx, yy, 2, 0, 7); x.fill(); }
  x.strokeStyle = '#1F3A5F';
  x.lineWidth = 3.2;
  x.lineJoin = 'round';
  x.lineCap = 'round';
  for (const st of r.sketchStrokes) {
    if (st.length < 1) continue;
    x.beginPath();
    st.forEach((p: any, i: number) => { const X = p.x * W, Y = p.y * H; if (i) x.lineTo(X, Y); else x.moveTo(X, Y); });
    x.stroke();
  }
  return c.toDataURL('image/jpeg', 0.85);
}

export async function genInstallerPDF(job: Job, installerName: string): Promise<void> {
  await loadBrandLogo();
  const doc: any = new jsPDF('p', 'pt', 'a4');
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
  let y = M;
  const navy = MD_INK, muted = MD_MUTED;
  const rooms = job.jobcard?.rooms || [];
  const isPartial = !!(job.jobcard?.draft || job.jobcard?.partial);
  const cardTitle = 'Installation Job Card';
  function header() {
    y = mdPdfHeader(doc, { title: cardTitle, right: job.pi, M });
    return y;
  }
  header();
  y = mdInfoTable(doc, y, [['Proforma Invoice No.', job.pi], ['Client Name', job.name], ['Client Mobile', job.phone], ['Site Address', job.addr], ['BM', job.bm], ['Installer', installerName], ['Type', categoryFor(job.type).pdfLabel], ['Date', fmtDateA(job.date)]], M);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...navy); doc.text(isPartial ? 'Rooms installed so far' : 'Rooms installed', M, y + 4); y += 10;
  doc.autoTable(mdBrandGrid({
    startY: y, margin: { left: M, right: M }, styles: { fontSize: 8.5, cellPadding: 4, lineColor: [210, 216, 225] },
    head: [['#', 'Room', 'Category', 'SKU No.']], body: rooms.map((r, i) => [String(i + 1), r.name || '-', categoryFor(r.category || job.type).pdfLabel, r.sku || 'NA']),
  }));

  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    doc.addPage(); y = M; header();
    const cat = categoryFor(r.category || job.type);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...navy); doc.text('Room ' + (i + 1) + ': ' + (r.name || '-'), M, y + 2); y += 14;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...muted); doc.text(cat.pdfLabel + '  ·  SKU: ' + (r.sku || '-'), M, y + 10); y += 24;
    y = await mdPdfInstallRoom(doc, r, y, { M, W, H, compress: compressForPdf, header: () => mdPdfHeader(doc, { title: cardTitle, right: job.pi, M }) });
  }

  doc.addPage(); y = M; header();
  const R = job.jobcard?.sign?.ratings;
  if (R) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...navy); doc.text('Client Feedback', M, y); y += 14;
    doc.autoTable({
      startY: y, margin: { left: M, right: M }, theme: 'grid', styles: { fontSize: 9, cellPadding: 4 }, columnStyles: { 0: { cellWidth: 260, fontStyle: 'bold', textColor: navy, fillColor: [238, 243, 249] } },
      body: [['Overall installation experience', String(R.q1 || '—') + ' / 10'], ['Site Installer rating', String(R.q2 || '—') + ' / 10'], ['Site cleanliness after installation', String(R.q3 || '—') + ' / 10'], ...(R.comments ? [['Comments', R.comments]] : [])],
    });
    y = doc.lastAutoTable.finalY + 12;
  }
  await mdPdfConsent(doc, {
    y, M, W, H, compress: compressForPdf,
    consentText: 'I confirm that the installation for the above order has been carried out by the Material Depot installer, the rooms and products listed in this Job Card have been installed, and that I am satisfied with the service provided, and that the installation was carried out in line with the installation terms & conditions below.',
    termsBlock: mdInstallTermsBlock([job.type]),
    personName: job.jobcard?.sign?.name || job.name,
    personDate: fmtDateA(job.date),
    sign: job.jobcard?.sign,
    installerSign: job.jobcard?.installerSign,
    header: () => mdPdfHeader(doc, { title: cardTitle, right: job.pi, M }),
  });

  const fn = ('Installation_' + (job.name || 'client') + '_' + (job.pi || '') + '.pdf').replace(/[^a-z0-9_\-.]/gi, '_');
  doc.save(fn);
}

export async function genAuditReportPDF(order: { pi: string; name: string; phone: string; addr: string; bm: string; date: string | null }, ticked: any): Promise<void> {
  await loadBrandLogo();
  const doc: any = new jsPDF('p', 'pt', 'a4');
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
  let y = M;
  const navy = MD_INK, muted = MD_MUTED;
  const rooms = ticked.rooms || [];
  function header() {
    y = mdPdfHeader(doc, { title: 'Site Audit Job Card', right: order.pi, M });
    return y;
  }
  header();
  y = mdInfoTable(doc, y, [['Proforma Invoice No.', order.pi], ['Client Name', order.name], ['Client Mobile', order.phone], ['Site Address', order.addr], ['BM', order.bm], ['Auditor', ticked.auditor || '—'], ['Date', fmtDateA(order.date)]], M);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...navy); doc.text('Rooms summary', M, y + 4); y += 10;
  doc.autoTable(mdBrandGrid({
    startY: y, margin: { left: M, right: M }, styles: { fontSize: 8.5, cellPadding: 4, lineColor: [210, 216, 225] },
    head: [['#', 'Room', 'Type', 'SKU No.']], body: rooms.map((r: any, i: number) => [String(i + 1), r.name || '-', categoryFor(r.category || r.type).pdfLabel, r.sku || 'NA']),
  }));
  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    doc.addPage(); y = M; header();
    const cat = categoryFor(r.category || r.type);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...navy); doc.text('Room ' + (i + 1) + ': ' + (r.name || '-'), M, y + 2); y += 14;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...muted); doc.text(cat.pdfLabel + '  ·  SKU: ' + (r.sku || 'NA'), M, y + 10); y += 24;
    y = await mdPdfAuditRoom(doc, r, y, { M, W, H, compress: compressForPdf, sketchImg: renderSketch(r), header: () => mdPdfHeader(doc, { title: 'Site Audit Job Card', right: order.pi, M }) });
  }
  doc.addPage(); y = M; header();
  await mdPdfConsent(doc, {
    y, M, W, H, compress: compressForPdf,
    consentText: 'I confirm that the site audit for the above order has been carried out by the Material Depot auditor, that the rooms, measurements and details recorded in this Job Card are correct, and that I am satisfied with the service provided, and that I have read, understood and agree to the installation terms & conditions below.',
    termsBlock: mdInstallTermsBlock([...new Set<string>(rooms.map((r: any) => r.category || r.type))]),
    personName: ticked.sign?.name || order.name,
    personDate: fmtDateA(order.date),
    sign: ticked.sign,
    header: () => mdPdfHeader(doc, { title: 'Site Audit Job Card', right: order.pi, M }),
  });
  doc.save(('SiteAudit_' + (order.name || 'client') + '_' + (order.pi || '') + '.pdf').replace(/[^a-z0-9_\-.]/gi, '_'));
}
