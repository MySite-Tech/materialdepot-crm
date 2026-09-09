'use client';

import { GROUP_LABEL_CLS } from '../../constants/auditor';
import { Segment } from '../../types/auditor';
import { fieldValue } from '../../utils/auditor';
import { DocScannerModal } from '@/components/site-audit/apps/fieldAppShared';
import { AdjustRow, CategoryDef, FieldValues, PrereqEntry, fieldsFor, unitFor } from '@/components/site-audit/data/auditRegistry';
import { readCapturedPhoto, uploadPhoto } from '@/components/site-audit/siteAuditShared';
import { cn } from '@/lib/utils/index';
import { ChangeEvent, useCallback, useRef, useState } from 'react';

export function SegmentFields({
  cat,
  seg,
  room,
  onFields,
}: {
  cat: CategoryDef;
  seg: Segment;
  room: { v: number; variant: string | null };
  onFields: (next: FieldValues) => void;
}) {
  const visible = fieldsFor(cat, room).filter((f) => !f.showIf || f.showIf(seg.fields));
  const groups: { group: string; fields: typeof visible }[] = [];
  visible.forEach((f) => {
    const last = groups[groups.length - 1];
    if (last && last.group === f.group) last.fields.push(f);
    else groups.push({ group: f.group, fields: [f] });
  });

  const setField = (k: string, value: string) => {
    onFields({ ...seg.fields, [k]: value });
  };

  return (
    <>
      {groups.map((g) => (
        <div key={g.group}>
          <div className={GROUP_LABEL_CLS}>{g.group}</div>
          <div className="mt-1 grid grid-cols-2 gap-3">
            {g.fields.map((f) => (
              <div key={f.k}>
                <label className="text-xs text-gray-500">{f.label}</label>
                {f.input === 'select' ? (
                  <select
                    value={fieldValue(seg, f)}
                    onChange={(e) => setField(f.k, e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                  >
                    {(f.opts ?? []).map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    inputMode={f.input === 'decimal' ? 'decimal' : undefined}
                    value={fieldValue(seg, f)}
                    onChange={(e) => setField(f.k, e.target.value)}
                    className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

export function SegmentAdjustments({
  cat,
  room,
  seg,
  onAdjust,
}: {
  cat: CategoryDef;
  room: { v: number; variant: string | null };
  seg: Segment;
  onAdjust: (updater: (prev: AdjustRow[]) => AdjustRow[]) => void;
}) {
  const u = unitFor(cat, room);
  const segLabel = (cat.segment && cat.segment.segLabel) || 'segment';

  const patchRow = (i: number, patch: Partial<AdjustRow>) =>
    onAdjust((prev) => prev.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const removeRow = (i: number) => onAdjust((prev) => prev.filter((_, idx) => idx !== i));
  const addRow = () =>
    onAdjust((prev) => [...prev, { sign: '-', shape: 'Rectangle', h: '', w: '', area: '', reason: '', photos: [] }]);
  const addPhoto = (i: number, url: string) =>
    onAdjust((prev) => prev.map((a, idx) => (idx === i ? { ...a, photos: [...(a.photos || []), url] } : a)));

  const swapPhoto = (from: string, to: string) =>
    onAdjust((prev) =>
      prev.map((a) =>
        (a.photos || []).includes(from) ? { ...a, photos: (a.photos || []).map((p) => (p === from ? to : p)) } : a,
      ),
    );
  const removePhotoAt = (i: number, at: number) =>
    onAdjust((prev) =>
      prev.map((a, idx) => (idx === i ? { ...a, photos: (a.photos || []).filter((_, pi) => pi !== at) } : a)),
    );

  return (
    <div className="mt-2.5">
      <div className={GROUP_LABEL_CLS}>Area adjustments (optional)</div>
      <div className="mb-1 text-xs text-gray-400">
        Add or subtract a small area for this {segLabel.toLowerCase()} — e.g. subtract a door or window opening. Enter
        the area in sq.ft yourself, and give a reason and a photo for each one.
      </div>
      {seg.adjust.map((a, i) => {
        const shape = a.shape || 'Rectangle';
        const isOther = shape === 'Other';

        const dim1 = shape === 'Triangle' ? 'Base' : cat.adjDim1 || 'Height';
        const dim2 = shape === 'Triangle' ? 'Height' : 'Width';

        const missingReason = !a.reason && String(a.area ?? '') !== '';
        return (
          <div key={i} className="mt-2 rounded-lg border border-gray-200 bg-white p-2.5">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Add or subtract</label>
                <select
                  value={a.sign || '-'}
                  onChange={(e) => patchRow(i, { sign: e.target.value as '+' | '-' })}
                  className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                >
                  <option value="-">Subtract</option>
                  <option value="+">Add</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-500">Shape</label>
                <select
                  value={shape}
                  onChange={(e) => {
                    const nextShape = e.target.value as AdjustRow['shape'];

                    patchRow(i, nextShape === 'Other' ? { shape: nextShape, h: '', w: '' } : { shape: nextShape });
                  }}
                  className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                >
                  <option value="Rectangle">Rectangle</option>
                  <option value="Triangle">Triangle</option>
                  <option value="Other">Other (no length x height)</option>
                </select>
              </div>
              {!isOther && (
                <>
                  <div>
                    <label className="text-xs text-gray-500">
                      {dim1} ({u})
                    </label>
                    <input
                      inputMode="decimal"
                      value={a.h ?? ''}
                      onChange={(e) => patchRow(i, { h: e.target.value })}
                      className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">
                      {dim2} ({u})
                    </label>
                    <input
                      inputMode="decimal"
                      value={a.w ?? ''}
                      onChange={(e) => patchRow(i, { w: e.target.value })}
                      className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                    />
                  </div>
                </>
              )}

              <div className="col-span-2">
                <label className="text-xs text-gray-500">Area (sq.ft)</label>
                <input
                  inputMode="decimal"
                  value={a.area ?? ''}
                  onChange={(e) => patchRow(i, { area: e.target.value })}
                  className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500">Reason</label>
                <input
                  value={a.reason || ''}
                  onChange={(e) => patchRow(i, { reason: e.target.value })}
                  placeholder="e.g. Door opening"
                  className={cn(
                    'mt-1 w-full rounded-md border px-2 py-1.5 text-sm',
                    missingReason ? 'border-red-400' : 'border-gray-200',
                  )}
                />
              </div>
            </div>
            <div className="mt-2">
              <label className="text-xs text-gray-500">Photo</label>
              <SegmentPhotos
                photos={a.photos || []}
                label=""
                onAdd={(url) => addPhoto(i, url)}
                onSwap={swapPhoto}
                onRemoveAt={(idx) => removePhotoAt(i, idx)}
              />
            </div>
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="mt-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 hover:bg-red-100"
            >
              Remove adjustment
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={addRow}
        className="mt-2 rounded-md border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs font-bold text-gray-700 hover:bg-gray-100"
      >
        + Add adjustment
      </button>
    </div>
  );
}

export function SegmentPrereqs({
  cat,
  seg,
  onPrereq,
}: {
  cat: CategoryDef;
  seg: Segment;
  onPrereq: (next: Record<string, PrereqEntry>) => void;
}) {
  if (!cat.prerequisites?.length) return null;
  const set = (k: string, patch: Partial<PrereqEntry>) => {
    const cur = seg.prereq[k] || { status: '', note: '' };
    onPrereq({ ...seg.prereq, [k]: { ...cur, ...patch } });
  };
  return (
    <div>
      <div className={GROUP_LABEL_CLS}>Site readiness checks</div>
      {cat.prerequisites.map((p) => {
        const cur = seg.prereq[p.k] || { status: '', note: '' };
        return (
          <div key={p.k} className="flex flex-col gap-1 border-b border-gray-100 py-1.5">
            <div className="text-[13px] text-gray-800">{p.label}</div>
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                value={cur.status || ''}
                onChange={(e) => set(p.k, { status: e.target.value })}
                className={cn(
                  'shrink-0 rounded-md border px-2 py-1 text-xs font-semibold',
                  cur.status === 'Not OK'
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : cur.status === 'OK'
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-gray-200 bg-white text-gray-600',
                )}
              >
                <option value="">Set…</option>
                <option value="OK">OK</option>
                <option value="Not OK">Not OK</option>
                <option value="N/A">N/A</option>
              </select>
              <input
                value={cur.note || ''}
                onChange={(e) => set(p.k, { note: e.target.value })}
                placeholder="Note (optional)"
                className="min-w-[130px] flex-1 rounded-md border border-gray-200 px-2 py-1 text-xs"
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function SegmentPhotos({
  photos,
  label,
  onAdd,
  onSwap,
  onRemoveAt,
}: {
  photos: string[];
  label: string;
  onAdd: (url: string) => void;
  onSwap: (from: string, to: string) => void;
  onRemoveAt: (idx: number) => void;
}) {
  const camInputRef = useRef<HTMLInputElement | null>(null);
  const galInputRef = useRef<HTMLInputElement | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [readErr, setReadErr] = useState<string | null>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || !files.length) return;
      setUploading(true);
      setReadErr(null);
      for (const file of Array.from(files)) {

        const got = await readCapturedPhoto(file, 1600, 0.88);
        if (!got.ok) { setReadErr(got.error); continue; }
        const resized = got.dataUrl;
        onAdd(resized);
        uploadPhoto(resized)
          .then((url) => onSwap(resized, url))
          .catch(() => { /* keep the inline base64 — the draft/job card still carries the photo */ });
      }
      setUploading(false);
    },
    [onAdd, onSwap],
  );

  return (
    <div className="mt-2">
      <label className="text-xs text-gray-500">{label}</label>
      <div className="mt-2 flex flex-wrap gap-2">
        {photos.map((p, idx) => (
          <div key={idx} className="relative h-20 w-20 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p}
              alt=""
              className="h-20 w-20 cursor-pointer rounded-lg border border-gray-200 object-cover"
              onClick={() => window.open(p, '_blank')}
            />
            <button
              type="button"
              onClick={() => onRemoveAt(idx)}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-bold leading-none text-white"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <input
        ref={camInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={galInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={() => camInputRef.current?.click()}
          disabled={uploading}
          className="flex-1 rounded-md border border-gray-200 bg-white py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          📷 Camera
        </button>
        <button
          type="button"
          onClick={() => galInputRef.current?.click()}
          disabled={uploading}
          className="flex-1 rounded-md border border-gray-200 bg-white py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          🖼 Gallery
        </button>
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          disabled={uploading}
          className="flex-1 rounded-md border border-gray-200 bg-white py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          📄 Scan
        </button>
      </div>
      {uploading && <div className="mt-1.5 text-[11px] text-gray-400">Adding photo…</div>}
      {readErr && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11.5px] font-semibold text-amber-800">
          <span className="flex-1">{readErr}</span>
          <button type="button" onClick={() => setReadErr(null)} className="shrink-0 font-bold">
            ×
          </button>
        </div>
      )}
      {scannerOpen && (
        <DocScannerModal open={scannerOpen} onClose={() => setScannerOpen(false)} onScanned={(url) => onAdd(url)} />
      )}
    </div>
  );
}
