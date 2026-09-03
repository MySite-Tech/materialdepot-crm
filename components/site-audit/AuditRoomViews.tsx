'use client';

/* Shared read-only renderers for one audit room / one installation room.
   React port of mdAuditRoomHtml + mdInstallRoomHtml from material-depot-site's
   /md-audit-registry.js — every consumer (SM Audit job drawer, the installer's read-only audit
   report, the install job-card view) renders v2 segment audits and legacy rooms identically. */

import {
  adjRows,
  categoryFor,
  installRoomPhotos,
  installRoomRows,
  normalizeRoom,
  prereqFlagged,
  segmentPrereqRows,
  segmentRows,
} from './auditRegistry';

/* An adjustment's photo is the ONLY evidence of what was added or subtracted, so it is rendered
   as the image itself — not as a "1 photo" count, which is what this showed until 2026-09-01.
   Auditors were attaching the photo correctly and it was reaching the DB as a Storage URL; every
   renderer (this one, the PDF, and both legacy equivalents) then dropped it on the floor, so the
   office saw a bare number and the auditor concluded the upload had failed. Keep the strip here
   in step with `mdPdfAuditRoom` in pdfBrand.ts. */
function AdjustmentRows({ rows }: { rows: ReturnType<typeof adjRows> }) {
  if (!rows.length) return null;
  return (
    <div className="mt-1.5 border-t border-dashed border-gray-200 pt-1.5">
      <div className="mb-0.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-400">Area adjustments</div>
      {rows.map((a, i) => (
        <div key={i} className="mt-1 first:mt-0">
          <div className="flex flex-wrap gap-2 text-[12.5px]">
            <span className={`font-bold ${a.neg ? 'text-red-600' : 'text-green-700'}`}>{a.area} sq.ft</span>
            <span className="text-gray-400">
              {a.label} {a.size}
            </span>
            <span>{a.reason || <i className="text-red-600">no reason given</i>}</span>
            {!a.photos.length && <span><i className="text-red-600">no photo attached</i></span>}
          </div>
          <PhotoStrip photos={a.photos.filter(Boolean)} size={52} />
        </div>
      ))}
    </div>
  );
}

function KvGrid({ rows }: { rows: [string, string, string?][] }) {
  return (
    <div className="grid grid-cols-[minmax(110px,auto)_1fr] gap-x-3 gap-y-1 text-[12.5px]">
      {rows.map(([label, value, color], i) => (
        <div key={i} className="contents">
          <div className="text-gray-400">{label}</div>
          <div className={color || 'text-gray-900'}>{value}</div>
        </div>
      ))}
    </div>
  );
}

function PhotoStrip({ photos, size = 60 }: { photos: string[]; size?: number }) {
  if (!photos.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {photos.map((p, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={i}
          src={p}
          alt=""
          onClick={() => window.open(p, '_blank')}
          style={{ width: size, height: size }}
          className="cursor-pointer rounded-lg border border-gray-200 object-cover"
        />
      ))}
    </div>
  );
}

export function AuditRoomCard({ room, index }: { room: any; index: number }) {
  const nr = normalizeRoom(room);
  const cat = categoryFor(nr.category);
  const isV2 = nr.v >= 2;
  const multi = isV2 && cat.segment && cat.segment.model === 'multi';

  return (
    <div className="mb-2 rounded-xl border border-gray-200 p-3">
      <div className="text-[13px] font-bold text-gray-900">
        Room {index + 1}: {nr.name || '—'}{' '}
        <span className="text-[11.5px] font-semibold text-gray-400">
          {cat.pdfLabel}
          {nr.variant ? ` · ${nr.variant}` : ''} · SKU: {nr.sku || 'NA'}
        </span>
      </div>

      {(nr.segments || []).map((seg, si) => {
        const rows = segmentRows(cat, seg, isV2, nr);
        const adj = isV2 ? adjRows(cat, nr, seg.adjust) : [];
        const prq = isV2 ? segmentPrereqRows(cat, seg) : [];
        const flagged = prereqFlagged(seg);
        return (
          <div key={si} className="mt-2 rounded-lg border border-gray-200 p-2.5">
            {multi && (
              <div className="mb-1.5 text-[12.5px] font-extrabold text-[#1F3A5F]">
                {cat.segment.segLabel} {si + 1}
                {seg.facing ? ` — ${seg.facing}` : ''}
                {flagged && <span className="ml-1 text-red-600">⚠</span>}
              </div>
            )}
            {rows.length ? (
              <KvGrid rows={rows as [string, string][]} />
            ) : (
              <div className="text-xs text-gray-400">No measurements recorded.</div>
            )}
            <AdjustmentRows rows={adj} />
            {prq.length > 0 && (
              <div className="mt-1.5">
                <KvGrid
                  rows={prq.map(([label, status, note]) => [
                    label,
                    status + (note ? ` - ${note}` : ''),
                    status === 'Not OK' ? 'text-red-600' : status === 'OK' ? 'text-green-700' : 'text-gray-400',
                  ])}
                />
              </div>
            )}
            <PhotoStrip photos={(seg.photos || []).filter(Boolean)} />
            {seg.material && (
              <div className="mt-2 flex items-center gap-2 rounded-lg bg-blue-50 px-2 py-1.5">
                {seg.material.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={seg.material.image}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-md border border-gray-200 object-cover"
                  />
                )}
                <div className="min-w-0 text-[11.5px]">
                  <div className="font-bold text-gray-900">
                    {seg.material.productName || seg.material.sku || 'Material selected'}
                  </div>
                  {seg.material.sku && <div className="text-gray-400">SKU: {seg.material.sku}</div>}
                </div>
              </div>
            )}
          </div>
        );
      })}

      {nr.notes && <div className="mt-2 text-xs text-gray-500">Notes: {nr.notes}</div>}
    </div>
  );
}

export function InstallRoomCard({ room, index }: { room: any; index: number }) {
  const isV2 = room && room.v >= 2;
  const cat = isV2 ? categoryFor(room.category) : null;
  const rows = installRoomRows(room);
  const photos = installRoomPhotos(room);
  const comments = room?.comments || room?.notes || '';

  return (
    <div className="mb-2 rounded-xl border border-gray-200 p-3">
      <div className="text-[13px] font-bold text-gray-900">
        Room {index + 1}: {room?.name || '—'}
        {cat && (
          <span className="ml-1 text-[11.5px] font-semibold text-gray-400">
            {cat.pdfLabel} · SKU: {room.sku || 'NA'}
          </span>
        )}
      </div>
      {rows.length > 0 && (
        <div className="mt-2">
          <KvGrid rows={rows as [string, string][]} />
        </div>
      )}
      <PhotoStrip photos={photos} />
      {comments && <div className="mt-2 text-xs text-gray-500">{comments}</div>}
    </div>
  );
}
