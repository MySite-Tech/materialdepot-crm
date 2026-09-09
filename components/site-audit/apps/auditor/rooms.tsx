'use client';

import { renderSketchData } from './pdf';
import { SegmentAdjustments, SegmentFields, SegmentPhotos, SegmentPrereqs } from './segments';
import { Room, RoomPatch, Segment } from '../../types/auditor';
import { blankSegment } from '../../utils/auditor';
import { SketchCanvas } from '@/components/site-audit/apps/fieldAppShared';
import { CATEGORY_LIST, ROOM_V, adjRows, categoryFor, needsVariant, prereqFlagged, segmentPrereqRows, segmentRows, unitFor, unitNoteFor } from '@/components/site-audit/data/auditRegistry';
import { cn } from '@/lib/utils/index';
import { useCallback, useMemo } from 'react';

export function RoomEditor({
  room,
  index,
  onChange,
  onRemove,
}: {
  room: Room;
  index: number;
  onChange: (patch: RoomPatch) => void;
  onRemove: () => void;
}) {
  const cat = categoryFor(room.category);
  const multi = cat.segment.model === 'multi';
  const flagged = room.segments.some((s) => prereqFlagged(s));

  const patchSegment = useCallback(
    (sid: number, patch: Partial<Segment>) => {
      onChange((r) => ({ segments: r.segments.map((s) => (s.sid === sid ? { ...s, ...patch } : s)) }));
    },
    [onChange],
  );

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-bold text-gray-700">Room / Space {index + 1}</div>
        <button
          type="button"
          onClick={onRemove}
          className="rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700 hover:bg-red-100"
        >
          Remove
        </button>
      </div>

      <div>
        <label className="text-xs text-gray-500">Product category</label>
        <select
          value={room.category}
          onChange={(e) => {
            const category = e.target.value;
            onChange({
              category,
              v: ROOM_V,
              variant: null,
              segments: [blankSegment(category, 1, { v: ROOM_V, variant: null })],
              nextSid: 1,
            });
          }}
          className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
        >
          {CATEGORY_LIST.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-gray-500">Room name</label>
          <input
            value={room.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g. Master Bedroom"
            className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-yellow-400"
          />
        </div>
        <div>
          <label className="text-xs text-gray-500">SKU Code (write NA if none)</label>
          <input
            value={room.sku}
            onChange={(e) => onChange({ sku: e.target.value })}
            placeholder="e.g. WP-9020 / NA"
            className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-yellow-400"
          />
        </div>
      </div>

      {cat.variants && (
        <div className="mt-3">
          <label className="text-xs text-gray-500">{cat.label} type</label>
          <select
            value={room.variant || ''}
            onChange={(e) => {
              const prev = room.variant;
              const next = e.target.value || null;

              const unitFlips = unitFor(cat, { v: room.v, variant: prev }) !== unitFor(cat, { v: room.v, variant: next });

              const DIM_KEYS = ['height', 'width', 'length'];
              const hasDims = room.segments.some(
                (s) =>
                  DIM_KEYS.some((k) => String(s.fields?.[k] ?? '') !== '') ||
                  (s.adjust || []).some((a) => String(a.h ?? '') !== '' || String(a.w ?? '') !== ''),
              );
              if (
                prev &&
                next &&
                unitFlips &&
                hasDims &&
                !window.confirm(
                  `Switching to ${next} changes the measurement unit from ${unitFor(cat, { v: room.v, variant: prev })} to ${unitFor(cat, { v: room.v, variant: next })}.\n\nThe length/height/width figures already entered will be cleared so they can be re-taken in the new unit. The areas you typed in sq.ft are kept. Continue?`,
                )
              ) {
                return;
              }
              if (prev && next && unitFlips) {
                onChange({
                  variant: next,
                  segments: room.segments.map((s) => {
                    const fields = { ...s.fields };
                    DIM_KEYS.forEach((k) => delete fields[k]);
                    return {
                      ...s,
                      fields,
                      adjust: (s.adjust || []).map((a) => ({ ...a, h: '', w: '' })),
                    };
                  }),
                });
              } else {
                onChange({ variant: next });
              }
            }}
            className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
          >
            <option value="">Select…</option>
            {cat.variants.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
      )}

      {unitNoteFor(cat, room) && (
        <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-800">
          📏 {unitNoteFor(cat, room)}
        </div>
      )}

      {room.segments.map((seg, si) => (
        <div key={seg.sid} className="mt-3 rounded-xl border-[1.5px] border-gray-200 bg-[#fbfcfe] p-3">
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="text-sm font-extrabold text-[#1F3A5F]">
              {cat.segment.segLabel}
              {multi ? ` ${si + 1}` : ''}
            </div>
            {multi && (
              <button
                type="button"
                onClick={() => onChange((r) => ({ segments: r.segments.filter((s) => s.sid !== seg.sid) }))}
                className="shrink-0 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700 hover:bg-red-100"
              >
                Remove
              </button>
            )}
          </div>

          {cat.segment.facing && (
            <div>
              <label className="text-xs text-gray-500">Facing direction</label>
              <select
                value={seg.facing || ''}
                onChange={(e) => patchSegment(seg.sid, { facing: e.target.value || null })}
                className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
              >
                <option value="">Select…</option>
                {(cat.segment.facingOpts ?? []).map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          )}

          {needsVariant(cat, room) ? (
            <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs font-semibold text-amber-800">
              {cat.variantPrompt || `Pick the ${cat.label} type above to enter measurements.`}
            </div>
          ) : (
            <>
              <SegmentFields
                cat={cat}
                seg={seg}
                room={room}
                onFields={(fields) => patchSegment(seg.sid, { fields })}
              />
              <SegmentAdjustments
                cat={cat}
                room={room}
                seg={seg}

                onAdjust={(updater) =>
                  onChange((r) => ({
                    segments: r.segments.map((s) =>
                      s.sid === seg.sid ? { ...s, adjust: updater(s.adjust || []) } : s,
                    ),
                  }))
                }
              />
            </>
          )}

          <SegmentPhotos
            photos={seg.photos}
            label={multi ? `${cat.segment.segLabel} photos` : 'Photos'}
            onAdd={(url) =>
              onChange((r) => ({
                segments: r.segments.map((s) => (s.sid === seg.sid ? { ...s, photos: [...s.photos, url] } : s)),
              }))
            }
            onSwap={(from, to) =>
              onChange((r) => ({
                segments: r.segments.map((s) =>
                  s.sid === seg.sid ? { ...s, photos: s.photos.map((p) => (p === from ? to : p)) } : s,
                ),
              }))
            }
            onRemoveAt={(idx) =>
              onChange((r) => ({
                segments: r.segments.map((s) =>
                  s.sid === seg.sid ? { ...s, photos: s.photos.filter((_, i) => i !== idx) } : s,
                ),
              }))
            }
          />

          <SegmentPrereqs cat={cat} seg={seg} onPrereq={(prereq) => patchSegment(seg.sid, { prereq })} />
        </div>
      ))}

      {multi && (
        <button
          type="button"
          onClick={() =>
            onChange((r) => ({
              segments: [...r.segments, blankSegment(r.category, r.nextSid + 1, r)],
              nextSid: r.nextSid + 1,
            }))
          }
          className="mt-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          + {cat.segment.addLabel || 'Add'}
        </button>
      )}

      {flagged && (
        <div className="mt-2.5 rounded-lg bg-red-50 px-2.5 py-2 text-[12.5px] font-semibold text-red-800">
          One or more site-readiness checks are marked Not OK — recorded for the SM to review.
        </div>
      )}

      <div className="mt-3">
        <label className="text-xs text-gray-500">2D diagram (draw on the dotted sheet)</label>
        <SketchCanvas
          value={room.sketchStrokes}
          onChange={(strokes) => onChange({ sketchStrokes: strokes })}
          className="mt-1.5"
        />
        <div className="mt-1.5 flex gap-2">
          <button
            type="button"
            onClick={() => onChange((r) => ({ sketchStrokes: r.sketchStrokes.slice(0, -1) }))}
            className="rounded-md border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={() => onChange({ sketchStrokes: [] })}
            className="rounded-md border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Clear
          </button>
        </div>
      </div>

      <div className="mt-3">
        <label className="text-xs text-gray-500">Room notes</label>
        <textarea
          value={room.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Access, special instructions…"
          className="mt-1.5 min-h-[70px] w-full resize-y rounded-md border border-gray-200 p-2 text-sm"
        />
      </div>
    </div>
  );
}

export function RoomReviewCard({ room, index }: { room: Room; index: number }) {
  const cat = categoryFor(room.category);
  const multi = cat.segment.model === 'multi';
  const sketchImg = useMemo(() => renderSketchData(room.sketchStrokes), [room.sketchStrokes]);
  const segs = useMemo(
    () =>
      room.segments.map((s) => ({
        seg: s,
        rows: segmentRows(cat, { ...s, id: s.sid }, true, room),
        adj: adjRows(cat, room, s.adjust),
        prq: segmentPrereqRows(cat, { ...s, id: s.sid }),
        flagged: prereqFlagged(s),
      })),
    [room.segments, cat, room],
  );

  return (
    <div className="mb-3 rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-[#1F3A5F] px-2.5 py-0.5 text-xs font-bold text-white">Room {index + 1}</span>
        <b className="text-[15px]">{room.name || '(unnamed)'}</b>
        <span className="rounded-md bg-yellow-100 px-2 py-0.5 text-[11px] font-bold text-yellow-800">
          {cat.pdfLabel}
          {room.variant ? ` · ${room.variant}` : ''}
        </span>
        {room.sku && <span className="text-[11.5px] text-gray-500">SKU: {room.sku}</span>}
      </div>

      {segs.map(({ seg, rows, adj, prq, flagged }, si) => (
        <div key={seg.sid} className="mt-2 rounded-lg border border-gray-200 p-2.5">
          {multi && (
            <div className="mb-1.5 text-[13px] font-extrabold text-[#1F3A5F]">
              {cat.segment.segLabel} {si + 1}
              {seg.facing ? ` — ${seg.facing}` : ''}
              {flagged && <span className="ml-1 text-red-600">⚠</span>}
            </div>
          )}
          {rows.length ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
                  <div className="text-[13px] text-gray-900">{value}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs text-gray-400">No measurements recorded.</div>
          )}
          {adj.length > 0 && (
            <div className="mt-1.5 border-t border-dashed border-gray-200 pt-1.5">
              <div className="mb-0.5 text-[11px] font-extrabold uppercase tracking-wide text-gray-400">
                Area adjustments
              </div>
              {adj.map((a, ai) => (
                <div key={ai} className="flex flex-wrap gap-2 text-[12.5px]">
                  <span className={cn('font-bold', a.neg ? 'text-red-600' : 'text-green-700')}>{a.area} sq.ft</span>
                  <span className="text-gray-400">
                    {a.label} {a.size}
                  </span>
                  <span>{a.reason || <i className="text-red-600">no reason given</i>}</span>
                  <span>
                    {a.photos.length ? (
                      `${a.photos.length} photo${a.photos.length > 1 ? 's' : ''}`
                    ) : (
                      <i className="text-red-600">no photo attached</i>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
          {prq.length > 0 && (
            <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1">
              {prq.map(([label, status, note]) => (
                <div key={label} className="contents">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
                  <div
                    className={cn(
                      'text-[13px]',
                      status === 'Not OK' ? 'text-red-600' : status === 'OK' ? 'text-green-700' : 'text-gray-500',
                    )}
                  >
                    {status}
                    {note ? ` - ${note}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
          {seg.photos.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {seg.photos.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={p} alt="" className="h-16 w-16 rounded-lg border border-gray-200 object-cover" />
              ))}
            </div>
          )}
        </div>
      ))}

      {sketchImg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={sketchImg} alt="Room sketch" className="mt-2 w-full rounded-lg border border-gray-200" />
      )}
      {room.notes && (
        <div className="mt-2 border-l-2 border-gray-200 pl-2.5 text-[12.5px] text-gray-500">{room.notes}</div>
      )}
    </div>
  );
}
