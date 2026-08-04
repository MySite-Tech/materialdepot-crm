/* Verbatim port of genInstallPDFSM from SMInstall.jsx (the Service Manager's
   "Download Job Card PDF" button on a completed sub-job). Layout/field order
   matches the installer-side genInstallerPDF in SiteInstallerApp.tsx exactly
   — both apps produce the same document for the same completed job. */

import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { fmtDate } from './shared';
import { installerById } from './shared';
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
  const doc: any = new jsPDF('p', 'pt', 'a4');
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 40;
  let y = M;
  const navy: [number, number, number] = [31, 58, 95], blue: [number, number, number] = [46, 108, 168], muted: [number, number, number] = [90, 100, 120];
  const rooms = jobcard.rooms || [];
  const primaryAssign = sj.assignments && (sj.assignments.find((a) => a.primary) || sj.assignments[0]);
  const installerName = (primaryAssign && primaryAssign.installer_name)
    || (sj.installer && installerById(installers, sj.installer)?.name)
    || sj.installer_email
    || '—';

  function hdr() {
    doc.setFillColor(...navy); doc.rect(M, y, 34, 34, 'F'); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('MD', M + 9, y + 22);
    doc.setFontSize(10); doc.setTextColor(...blue); doc.text('MATERIAL DEPOT', M + 44, y + 13); doc.setFontSize(15); doc.setTextColor(...navy); doc.text('Installation Job Card', M + 44, y + 30);
    y += 46; doc.setDrawColor(...navy); doc.setLineWidth(1.2); doc.line(M, y, W - M, y); y += 14;
  }
  hdr();
  doc.autoTable({
    startY: y, margin: { left: M, right: M }, theme: 'grid', styles: { fontSize: 9, cellPadding: 5, lineColor: [210, 216, 225] }, columnStyles: { 0: { cellWidth: 130, fontStyle: 'bold', textColor: navy, fillColor: [238, 243, 249] } },
    body: [['Proforma Invoice No.', o.pi || ''], ['Client Name', o.name || ''], ['Client Mobile', o.phone || ''], ['Site Address', o.addr || ''], ['BM', o.bm || ''], ['Installer', installerName], ['Type', sj.type === 'wallpaper' ? 'Wallpaper' : 'Wooden Flooring'], ['Date', fmtDate(sj.date)]],
  });
  y = doc.lastAutoTable.finalY + 10;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...navy); doc.text('Rooms installed', M, y + 4); y += 10;
  doc.autoTable({ startY: y, margin: { left: M, right: M }, theme: 'grid', headStyles: { fillColor: navy, fontSize: 8.5 }, styles: { fontSize: 8.5, cellPadding: 4, lineColor: [210, 216, 225] }, head: [['#', 'Room', 'SKU', 'Qty']], body: rooms.map((r, i) => [String(i + 1), r.name || '-', r.sku || '-', r.qty || '-']) });

  for (let i = 0; i < rooms.length; i++) {
    const r = rooms[i];
    doc.addPage(); y = M; hdr();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...navy); doc.text('Room ' + (i + 1) + ': ' + (r.name || '-'), M, y + 2); y += 14;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...muted); doc.text('SKU: ' + (r.sku || '-') + (r.qty ? ' · Qty: ' + r.qty : ''), M, y + 10); y += 24;
    const photos = r.photos && r.photos.length ? r.photos : r.photo ? [r.photo] : [];
    for (let pi = 0; pi < photos.length; pi++) {
      const ph = await compressForPdf(photos[pi]);
      if (ph) {
        const iw = W - 2 * M, ih = iw * 0.6;
        if (y + ih > H - M) { doc.addPage(); y = M; hdr(); }
        doc.setFontSize(8.5); doc.setTextColor(...muted); doc.text(pi === 0 ? 'Photo after installation' : 'Photo ' + (pi + 1), M, y);
        try { doc.addImage(ph, 'JPEG', M, y + 6, iw, ih); } catch { /* skip unrenderable image */ }
        y += ih + 18;
      }
    }
    if (r.comments) {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...navy); doc.text('Comments', M, y); y += 12;
      doc.setFont('helvetica', 'normal'); doc.setTextColor(40, 40, 40); doc.text(doc.splitTextToSize(r.comments, W - 2 * M), M, y);
    }
  }

  doc.addPage(); y = M; hdr();
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...navy); doc.text('Client Acknowledgement', M, y + 4); y += 26;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(40, 40, 40);
  doc.text(doc.splitTextToSize('I confirm that the installation for the above order has been carried out by the Material Depot installer, the rooms and products listed in this Job Card have been installed, and that I am satisfied with the service provided.', W - 2 * M), M, y); y += 70;
  const RI = jobcard.sign && jobcard.sign.ratings;
  if (RI) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...navy); doc.text('Client Feedback', M, y); y += 14;
    doc.autoTable({
      startY: y, margin: { left: M, right: M }, theme: 'grid', styles: { fontSize: 9, cellPadding: 4 }, columnStyles: { 0: { cellWidth: 260, fontStyle: 'bold', textColor: navy, fillColor: [238, 243, 249] } },
      body: ([['Overall installation experience', String(RI.q1 || '—') + ' / 10'], ['Site Installer rating', String(RI.q2 || '—') + ' / 10'], ['Site cleanliness after installation', String(RI.q3 || '—') + ' / 10'], ...(RI.comments ? [['Comments', RI.comments]] : [])] as string[][]).filter(Boolean),
    });
    y = doc.lastAutoTable.finalY + 10;
  }
  doc.setFontSize(10); doc.setTextColor(...muted); doc.text('Client name: ' + ((jobcard.sign && jobcard.sign.name) || o.name || ''), M, y); y += 18; doc.text('Date: ' + fmtDate(sj.date), M, y);
  const sigW = 200, sigH = 80, sx = W - M - sigW, sy = H - M - sigH - 24;
  if (jobcard.sign && jobcard.sign.img) {
    const si = await compressForPdf(jobcard.sign.img);
    if (si) try { doc.addImage(si, 'JPEG', sx, sy - 10, sigW, sigH); } catch { /* skip */ }
  }
  doc.setDrawColor(...muted); doc.setLineWidth(0.8); doc.line(sx, sy + sigH - 6, sx + sigW, sy + sigH - 6);
  doc.setFontSize(9.5); doc.setTextColor(...muted); doc.text('Client signature', sx, sy + sigH + 10);
  doc.save(('Installation_' + (o.name || 'client') + '_' + (o.pi || '') + '.pdf').replace(/[^a-z0-9_\-.]/gi, '_'));
}
