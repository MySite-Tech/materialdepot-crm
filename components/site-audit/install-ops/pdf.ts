/* Verbatim port of genInstallPDFSM from SMInstall.jsx (the Service Manager's
   "Download Job Card PDF" button on a completed sub-job). Layout/field order
   matches the installer-side genInstallerPDF in SiteInstallerApp.tsx exactly
   — both apps produce the same document for the same completed job. */

import { jsPDF } from 'jspdf';
import { fmtDate } from './shared';
import { installerById } from './shared';
import { categoryFor, mdInstallTermsBlock } from '../auditRegistry';
import { MD_INK, MD_MUTED, loadBrandLogo, mdBrandGrid, mdInfoTable, mdPdfConsent, mdPdfHeader, mdPdfInstallRoom } from '../pdfBrand';
import type { InstallOrder, Installer, JobCard, Subjob } from './types';

async function compressForPdf(dataUrl: string | null | undefined): Promise<string | null> {
  if (!dataUrl) return null;
  return new Promise((res) => {
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
        res(cv.toDataURL('image/jpeg', 0.88));
      } catch {
        res(null);
      }
    };
    im.onerror = () => res(null);
    im.src = dataUrl;
  });
}

export async function genInstallPDFSM(o: InstallOrder, sj: Subjob, jobcard: JobCard, installers: Installer[]): Promise<void> {
  await loadBrandLogo();
  const doc: any = new jsPDF('p', 'pt', 'a4');
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
  let y = M;
  const navy = MD_INK, muted = MD_MUTED;
  const rooms = jobcard.rooms || [];
  const primaryAssign = sj.assignments && (sj.assignments.find((a) => a.primary) || sj.assignments[0]);
  const installerName = (primaryAssign && primaryAssign.installer_name)
    || (sj.installer && installerById(installers, sj.installer)?.name)
    || sj.installer_email
    || '—';

  function hdr() {
    y = mdPdfHeader(doc, { title: 'Installation Job Card', right: o.pi, M });
    return y;
  }
  hdr();
  y = mdInfoTable(doc, y, [['Proforma Invoice No.', o.pi || ''], ['Client Name', o.name || ''], ['Client Mobile', o.phone || ''], ['Site Address', o.addr || ''], ['BM', o.bm || ''], ['Installer', installerName], ['Type', categoryFor(sj.type).pdfLabel], ['Date', fmtDate(sj.date)]], M);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...navy); doc.text('Rooms installed', M, y + 4); y += 10;
  doc.autoTable(mdBrandGrid({ startY: y, margin: { left: M, right: M }, styles: { fontSize: 8.5, cellPadding: 4, lineColor: [210, 216, 225] }, head: [['#', 'Room', 'Category', 'SKU']], body: rooms.map((r, i) => [String(i + 1), r.name || '-', categoryFor(r.category || sj.type).pdfLabel, r.sku || '-']) }));

  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    doc.addPage(); y = M; hdr();
    const cat = categoryFor(r.category || sj.type);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...navy); doc.text('Room ' + (i + 1) + ': ' + (r.name || '-'), M, y + 2); y += 14;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...muted); doc.text(cat.pdfLabel + '  ·  SKU: ' + (r.sku || '-'), M, y + 10); y += 24;
    y = await mdPdfInstallRoom(doc, r, y, { M, W, H, compress: compressForPdf, header: () => mdPdfHeader(doc, { title: 'Installation Job Card', right: o.pi, M }) });
  }

  doc.addPage(); y = M; hdr();
  const RI = jobcard.sign && jobcard.sign.ratings;
  if (RI) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...navy); doc.text('Client Feedback', M, y); y += 14;
    doc.autoTable({
      startY: y, margin: { left: M, right: M }, theme: 'grid', styles: { fontSize: 9, cellPadding: 4 }, columnStyles: { 0: { cellWidth: 260, fontStyle: 'bold', textColor: navy, fillColor: [238, 243, 249] } },
      body: ([['Overall installation experience', String(RI.q1 || '—') + ' / 10'], ['Site Installer rating', String(RI.q2 || '—') + ' / 10'], ['Site cleanliness after installation', String(RI.q3 || '—') + ' / 10'], ...(RI.comments ? [['Comments', RI.comments]] : [])] as string[][]).filter(Boolean),
    });
    y = doc.lastAutoTable.finalY + 10;
  }
  await mdPdfConsent(doc, {
    y, M, W, H, compress: compressForPdf,
    consentText: 'I confirm that the installation for the above order has been carried out by the Material Depot installer, the rooms and products listed in this Job Card have been installed, and that I am satisfied with the service provided, and that the installation was carried out in line with the installation terms & conditions below.',
    termsBlock: mdInstallTermsBlock([sj.type]),
    personName: (jobcard.sign && jobcard.sign.name) || o.name || '',
    personDate: fmtDate(sj.date),
    sign: jobcard.sign,
    installerSign: jobcard.installerSign,
    header: () => mdPdfHeader(doc, { title: 'Installation Job Card', right: o.pi, M }),
  });
  doc.save(('Installation_' + (o.name || 'client') + '_' + (o.pi || '') + '.pdf').replace(/[^a-z0-9_\-.]/gi, '_'));
}
