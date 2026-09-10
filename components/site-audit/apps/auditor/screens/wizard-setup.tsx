'use client';

import { categoryFor, mdInstallTermsBlock } from '../../../data/audit-registry';
import { fmtDateA } from '../../../shared/format';
import { Order, Room, RoomPatch, WizardPhase } from '../../types/auditor';
import { buildAuditTC, pdfFileName, slotLabel } from '../utils';
import { ActingAs } from '../../types/auditor';
import { SignaturePad, SignaturePadHandle } from '../../field-app-shared';
import { JobDetailsHeader } from './job-detail';
import { RoomEditor, RoomReviewCard } from '../sections/rooms';
import { KV } from '../ui';
import { Dispatch, RefObject, SetStateAction } from 'react';

export function WizardSetupPhase({ actingAs, completing, handleFinish, onDone, order, pdfUrl, phase, removeRoom, rooms, setPhase, setSignName, setTcAgree, signName, signPadRef, tcAgree, updateRoom }: {
  actingAs: ActingAs;
  completing: boolean;
  handleFinish: () => Promise<void>;
  onDone: () => void;
  order: Order;
  pdfUrl: string | null;
  phase: WizardPhase;
  removeRoom: (id: number) => void;
  rooms: Room[];
  setPhase: Dispatch<SetStateAction<WizardPhase>>;
  setSignName: Dispatch<SetStateAction<string>>;
  setTcAgree: Dispatch<SetStateAction<boolean>>;
  signName: string;
  signPadRef: RefObject<SignaturePadHandle | null>;
  tcAgree: boolean;
  updateRoom: (id: number, patch: RoomPatch) => void;
}) {
  return (
    <>
      {phase === 'rooms' && (
        <div>
          <JobDetailsHeader order={order} actingAs={actingAs} />
          <div className="my-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-[12.5px] text-blue-900">
            Add a room for every space audited. Pick the product category — measurement fields and
            site-readiness checks adapt automatically.
          </div>
          {rooms.map((r, i) => (
            <RoomEditor key={r.id} room={r} index={i} onChange={(patch) => updateRoom(r.id, patch)} onRemove={() => removeRoom(r.id)} />
          ))}
        </div>
      )}
    
      {phase === 'review' && (
        <div>
          <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h2 className="mb-2 text-[15px] font-bold text-gray-900">Job summary</h2>
            <KV label="Client" value={order.name} />
            <KV label="PI No." value={order.pi} />
            <KV label="Address" value={order.addr} />
            <KV label="Auditor" value={actingAs.name} />
            <KV label="Date" value={fmtDateA(order.date)} />
            <KV label="Time slot" value={slotLabel(order.slot)} />
            <KV label="Rooms" value={String(rooms.length)} />
          </div>
          {rooms.map((r, i) => (
            <RoomReviewCard key={r.id} room={r} index={i} />
          ))}
          <div className="mb-6 flex gap-2.5">
            <button
              type="button"
              onClick={() => setPhase('rooms')}
              className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              ← Back to rooms
            </button>
            <button
              type="button"
              onClick={() => setPhase('pass')}
              className="flex-1 rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:opacity-90"
            >
              Proceed to client →
            </button>
          </div>
        </div>
      )}
    
      {phase === 'pass' && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-8 text-center">
          <div className="mb-4 text-5xl">📱</div>
          <div className="mb-2 text-xl font-bold text-gray-900">Please hand the phone to the client</div>
          <p className="mb-6 text-[13.5px] text-gray-500">The client will now complete the final steps:</p>
          <div className="mb-7 rounded-xl bg-gray-50 px-4 py-3.5 text-left text-[13.5px] leading-loose">
            <div>
              <b>Step 1</b> &nbsp; Read &amp; agree to the Terms &amp; Conditions
            </div>
            <div>
              <b>Step 2</b> &nbsp; Rate the service (3 questions)
            </div>
            <div>
              <b>Step 3</b> &nbsp; Sign the job card
            </div>
          </div>
          <button
            type="button"
            onClick={() => setPhase('terms')}
            className="w-full rounded-xl bg-green-600 py-3.5 text-[15px] font-bold text-white hover:opacity-90"
          >
            Client is ready →
          </button>
          <button
            type="button"
            onClick={() => setPhase('review')}
            className="mt-2.5 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            ← Back to job card
          </button>
        </div>
      )}
    
      {phase === 'terms' && (
        <div>
          <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-[15px] font-bold text-gray-900">Terms &amp; Conditions</h2>
            <div className="max-h-[200px] overflow-y-auto whitespace-pre-line rounded-lg border border-gray-200 p-3.5 text-[13px] leading-relaxed text-gray-800">
              {buildAuditTC(mdInstallTermsBlock(rooms.map((r) => r.category)))}
            </div>
            <label className="mt-4 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={tcAgree}
                onChange={(e) => setTcAgree(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[#1F3A5F]"
              />
              <span className="text-[13.5px] font-semibold leading-tight">I have read and agree to the terms and conditions above</span>
            </label>
          </div>
          <div className="my-3.5 mb-6 flex gap-2.5">
            <button
              type="button"
              onClick={() => setPhase('pass')}
              className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              ← Back
            </button>
            <button
              type="button"
              disabled={!tcAgree}
              onClick={() => setPhase('sign')}
              className="flex-1 rounded-xl bg-[#1F3A5F] py-3 text-sm font-bold text-white disabled:opacity-40"
            >
              Agree &amp; proceed →
            </button>
          </div>
        </div>
      )}
    
      {phase === 'sign' && (
        <div>
          <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-[15px] font-bold text-gray-900">Summary</h2>
            <KV label="Client" value={order.name} />
            <KV label="PI" value={order.pi} />
            <KV label="Rooms" value={String(rooms.length)} />
            <div className="mt-2.5 space-y-1.5">
              {rooms.map((r, i) => (
                <div key={r.id} className="flex text-[13px]">
                  <span className="w-20 shrink-0 text-gray-400">Room {i + 1}</span>
                  <span>
                    {r.name || '(unnamed)'} · {categoryFor(r.category).pdfLabel}
                    {r.variant ? ` (${r.variant})` : ''} · SKU {r.sku || 'NA'}
                    {categoryFor(r.category).segment.model === 'multi'
                      ? ` · ${r.segments.length} ${categoryFor(r.category).segment.segLabel.toLowerCase()}${r.segments.length === 1 ? '' : 's'}`
                      : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4">
            <h2 className="mb-2 text-[15px] font-bold text-gray-900">Client consent &amp; signature</h2>
            <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-[12.5px] text-gray-600">
              By signing, the client confirms the site audit was carried out and the captured details are correct.
            </div>
            <label className="text-[13px] font-semibold text-gray-700">Client signature</label>
            <SignaturePad ref={signPadRef} className="mt-1.5" />
            <button
              type="button"
              onClick={() => signPadRef.current?.clear()}
              className="mt-1.5 rounded-md border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            >
              Clear signature
            </button>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Client name (confirming)</label>
                <input
                  value={signName}
                  onChange={(e) => setSignName(e.target.value)}
                  className="mt-1 w-full rounded-md border border-gray-200 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Date</label>
                <input
                  value={fmtDateA(order.date)}
                  disabled
                  className="mt-1 w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-sm text-gray-500"
                />
              </div>
            </div>
          </div>
          <div className="my-3.5 mb-6 flex gap-2.5">
            <button
              type="button"
              onClick={() => setPhase('terms')}
              className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
            >
              ← Back
            </button>
            <button
              type="button"
              disabled={completing}
              onClick={handleFinish}
              className="flex-1 rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            >
              {completing ? 'Saving…' : 'Generate PDF & complete'}
            </button>
          </div>
        </div>
      )}
    
      {phase === 'done' && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-white p-7 text-center">
          <div className="mb-3 text-5xl">✅</div>
          <div className="mb-1.5 text-xl font-bold text-green-600">Audit Complete!</div>
          <div className="mb-5 text-[13.5px] text-gray-500">Saved &amp; SM notified.</div>
          {pdfUrl ? (
            <>
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                download={pdfFileName(order)}
                className="mb-2 block rounded-xl bg-green-600 py-4 text-[16px] font-bold text-white hover:opacity-90"
              >
                📥 Open Job Card PDF
              </a>
              <div className="mb-5 text-[11.5px] text-gray-400">iPhone: tap to view → use the share icon to save to Files</div>
            </>
          ) : (
            <div className="mb-5 rounded-lg bg-gray-50 p-3 text-left text-[13px] text-gray-600">
              PDF could not be generated on this device. Download it from the order screen later.
            </div>
          )}
          <button
            type="button"
            onClick={onDone}
            className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-bold text-gray-700 hover:bg-gray-50"
          >
            Done — Back to Orders
          </button>
        </div>
      )}
    </>
  );
}
