'use client';

import { RoomBlock } from './job-detail';
import { Job, PersistedRoom, Room } from '../types';
import { buildInstallTC } from '../utils';
import { SignaturePad, SignaturePadHandle } from '@/components/site-audit/apps/field-app-shared';
import { categoryFor, mdInstallTermsBlock } from '@/components/site-audit/data/audit-registry';
import { fmtDateA } from '@/components/site-audit/shared';
import { useEffect, useState } from 'react';

export function JobCardWizardOverlay({
  job, installerName, rooms, stage, signName, installerSignName, saveStatus, hadSign, finishBusy, signPadRef,
  onBack, onAddRoom, onRemoveRoom, onRoomField, onRoomCategory, onRoomInstallField, onRoomFiles, onRoomRemovePhoto, onOpenScanner, onOpenLightbox,
  onFinishCard, onBackToRooms, onProceed, onBackFromHandoff, onClientReady, onTcsBack, onTcsProceed,
  onSignBack, onSignNameChange, onSignNext,
  onInstallerSignNameChange, onBackFromInstallerSignoff, onFinishInstallation,
}: {
  job: Job;
  installerName: string;
  rooms: Room[];
  stage: 'rooms' | 'review' | 'handoff' | 'tcs' | 'signature' | 'installerSignoff';
  signName: string;
  installerSignName: string;
  saveStatus: 'idle' | 'saving' | 'saved' | 'local';
  hadSign: boolean;
  finishBusy: boolean;
  signPadRef: React.RefObject<SignaturePadHandle | null>;
  onBack: () => void;
  onAddRoom: () => void;
  onRemoveRoom: (id: number) => void;
  onRoomField: (id: number, field: keyof PersistedRoom, value: string) => void;
  onRoomCategory: (id: number, category: string) => void;
  onRoomInstallField: (id: number, k: string, value: string) => void;
  onRoomFiles: (id: number, files: FileList | null) => Promise<string | null>;
  onRoomRemovePhoto: (id: number, idx: number) => void;
  onOpenScanner: (id: number) => void;
  onOpenLightbox: (src: string) => void;
  onFinishCard: () => void;
  onBackToRooms: () => void;
  onProceed: () => void;
  onBackFromHandoff: () => void;
  onClientReady: () => void;
  onTcsBack: () => void;
  onTcsProceed: () => void;
  onSignBack: () => void;
  onSignNameChange: (v: string) => void;
  onSignNext: () => void;
  onInstallerSignNameChange: (v: string) => void;
  onBackFromInstallerSignoff: () => void;
  onFinishInstallation: () => void;
}) {
  const [tcAgree, setTcAgree] = useState(false);
  useEffect(() => { if (stage === 'tcs') setTcAgree(false); }, [stage]);

  const saveStatusText = saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : saveStatus === 'local' ? '✓ Saved locally' : '';
  const saveStatusColor = saveStatus === 'saving' ? 'text-amber-600' : saveStatus === 'saved' ? 'text-green-600' : 'text-gray-400';

  return (
    <div className="fixed inset-0 z-[900] flex flex-col bg-gray-50">
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <button onClick={stage === 'rooms' ? onBack : undefined} disabled={stage !== 'rooms'} className="text-lg text-gray-500 disabled:opacity-30">←</button>
        <div>
          <div className="text-sm font-bold text-black">Installation Card</div>
          <div className="text-[12px] text-gray-400">{job.pi} · {job.name}</div>
        </div>
        {stage === 'rooms' && <div className={`ml-auto text-[11px] font-semibold ${saveStatusColor}`}>{saveStatusText}</div>}
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-2xl">
          {stage === 'rooms' && (
            <>
              {hadSign && (
                <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2.5 text-[12.5px] font-semibold text-amber-800">
                  This card was already signed &amp; completed. Your edits are saved on this device only — the signed
                  record on file, including its photos, is kept safe until you finish and capture new signatures.
                </div>
              )}
              <div className="mb-4 rounded-md bg-blue-50 px-3 py-2 text-[12px] text-blue-700">Fill one block per room. Each room needs a photo after installation. <span className="text-red-600">★</span> = required.</div>
              {rooms.map((r, i) => (
                <RoomBlock
                  key={r.id}
                  room={r}
                  index={i}
                  onField={(field, value) => onRoomField(r.id, field, value)}
                  onCategory={(category) => onRoomCategory(r.id, category)}
                  onInstallField={(k, value) => onRoomInstallField(r.id, k, value)}
                  onFiles={(files) => onRoomFiles(r.id, files)}
                  onOpenScanner={() => onOpenScanner(r.id)}
                  onRemovePhoto={(idx) => onRoomRemovePhoto(r.id, idx)}
                  onRemove={() => onRemoveRoom(r.id)}
                  onOpenLightbox={onOpenLightbox}
                />
              ))}
            </>
          )}

          {stage === 'review' && (
            <>
              <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <h2 className="mb-3 text-base font-bold text-black">Job summary</h2>
                <div className="grid grid-cols-[100px_1fr] gap-y-1.5 text-[13px]">
                  <div className="text-gray-400">Customer</div><div>{job.name}</div>
                  <div className="text-gray-400">PI No.</div><div>{job.pi}</div>
                  <div className="text-gray-400">Address</div><div>{job.addr}</div>
                  <div className="text-gray-400">Installer</div><div>{installerName}</div>
                  <div className="text-gray-400">Date</div><div>{fmtDateA(job.date)}</div>
                  <div className="text-gray-400">Rooms</div><div>{rooms.length}</div>
                </div>
              </div>
              {rooms.map((r, i) => (
                <div key={r.id} className="mb-3 rounded-lg border border-gray-200 bg-white p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-[#1F3A5F] px-2.5 py-0.5 text-[12px] font-bold text-white">Room {i + 1}</span>
                    <b className="text-[15px]">{r.name}</b>
                    <span className="rounded-md bg-yellow-100 px-2 py-0.5 text-[11px] font-bold text-yellow-800">{categoryFor(r.category).pdfLabel}</span>
                    {r.sku && <span className="text-[12px] text-gray-400">SKU: {r.sku}</span>}
                  </div>
                  {(categoryFor(r.category).installFields || [])
                    .filter((f) => String(r.fields?.[f.k] ?? '') !== '')
                    .map((f) => (
                      <div key={f.k} className="text-[12px] text-gray-500">
                        {f.label}: <span className="text-gray-900">{String(r.fields?.[f.k])}</span>
                      </div>
                    ))}
                  {r.photos.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {r.photos.map((p, pi) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={pi} src={p} alt="" onClick={() => onOpenLightbox(p)} className="h-20 w-20 cursor-pointer rounded-lg border-2 border-gray-200 object-cover" />
                      ))}
                    </div>
                  )}
                  {r.comments && <div className="border-l-2 border-gray-200 pl-2.5 text-[13px] text-gray-500">{r.comments}</div>}
                </div>
              ))}
              {job.isPrimary ? (
                <button onClick={onProceed} className="mb-3 w-full rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:opacity-90">Proceed to client →</button>
              ) : (
                <>
                  <div className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-600">You are an <b>additional installer</b> — the primary installer handles the customer signature. Tap below to mark your part complete.</div>
                  <button disabled={finishBusy} onClick={onProceed} className="mb-3 w-full rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">{finishBusy ? 'Saving…' : 'Mark my part complete →'}</button>
                </>
              )}
              <button onClick={onBackToRooms} className="w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">← Back to rooms</button>
            </>
          )}

          {stage === 'handoff' && (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
              <div className="mb-4 text-5xl">📱</div>
              <div className="mb-2 text-lg font-bold text-[#1F3A5F]">Please hand the phone to the customer</div>
              <p className="mb-6 text-[13px] text-gray-500">The customer will now complete the final steps:</p>
              <div className="mb-7 rounded-lg bg-gray-50 px-4 py-3.5 text-left text-[13px] leading-loose">
                <div><b>Step 1</b> &nbsp; Read &amp; agree to the Terms &amp; Conditions</div>
                <div><b>Step 2</b> &nbsp; Rate the service (3 questions)</div>
                <div><b>Step 3</b> &nbsp; Provide their signature</div>
              </div>
              <button onClick={onClientReady} className="w-full rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:opacity-90">Customer is ready →</button>
              <button onClick={onBackFromHandoff} className="mt-2.5 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">← Back to job card</button>
            </div>
          )}

          {stage === 'tcs' && (
            <>
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <h2 className="mb-3 text-base font-bold text-black">Terms &amp; Conditions</h2>
                <div className="max-h-[200px] overflow-y-auto whitespace-pre-line rounded-lg border border-gray-200 p-3.5 text-[13.5px] leading-relaxed">
                  {buildInstallTC(mdInstallTermsBlock([job.type]))}
                </div>
                <label className="mt-5 flex cursor-pointer items-start gap-3">
                  <input type="checkbox" checked={tcAgree} onChange={(e) => setTcAgree(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#1F3A5F]" />
                  <span className="text-sm font-semibold leading-tight">I have read and agree to the terms and conditions above</span>
                </label>
              </div>
              <button disabled={!tcAgree} onClick={onTcsProceed} className="mt-3.5 w-full rounded-xl bg-[#1F3A5F] py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-40">Agree &amp; proceed →</button>
              <button onClick={onTcsBack} className="mt-2.5 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">← Back</button>
            </>
          )}

          {stage === 'signature' && (
            <>
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <h2 className="mb-3 text-base font-bold text-black">Customer signature <span className="text-red-600">★</span></h2>
                <div className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-[12px] text-gray-500">Show the phone to the customer. Ask them to sign that the installation is done and they are happy.</div>
                <SignaturePad ref={signPadRef} className="mb-3" />
                <button onClick={() => signPadRef.current?.clear()} className="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">Clear signature</button>
                <div className="mt-3">
                  <label className="mb-1 block text-sm font-semibold">Customer name</label>
                  <input value={signName} onChange={(e) => onSignNameChange(e.target.value)} className="w-full rounded-lg border border-gray-200 p-2.5 text-sm outline-none focus:border-yellow-400" />
                </div>
              </div>
              <button onClick={onSignNext} className="mt-3.5 w-full rounded-xl bg-[#1F3A5F] py-3 text-sm font-bold text-white hover:opacity-90">Next: installer confirmation →</button>
              <button onClick={onSignBack} className="mt-2.5 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">← Back</button>
            </>
          )}

          {stage === 'installerSignoff' && (
            <>
              <div className="rounded-lg border border-gray-200 bg-white p-5">
                <h2 className="mb-3 text-base font-bold text-black">Installer confirmation <span className="text-red-600">★</span></h2>
                <div className="mb-3 rounded-md bg-gray-50 px-3 py-2 text-[12px] text-gray-500">I confirm this installation was carried out in line with Material Depot&apos;s installation terms &amp; conditions for the categories involved.</div>
                <SignaturePad ref={signPadRef} className="mb-3" />
                <button onClick={() => signPadRef.current?.clear()} className="w-full rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">Clear signature</button>
                <div className="mt-3">
                  <label className="mb-1 block text-sm font-semibold">Installer name</label>
                  <input value={installerSignName} onChange={(e) => onInstallerSignNameChange(e.target.value)} className="w-full rounded-lg border border-gray-200 p-2.5 text-sm outline-none focus:border-yellow-400" />
                </div>
              </div>
              <button disabled={finishBusy} onClick={onFinishInstallation} className="mt-3.5 w-full rounded-xl bg-green-600 py-3 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">{finishBusy ? 'Saving…' : 'Save & finish job'}</button>
              <button onClick={onBackFromInstallerSignoff} className="mt-2.5 w-full rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">← Back</button>
            </>
          )}
        </div>
      </div>

      {stage === 'rooms' && (
        <div className="flex gap-2 border-t border-gray-200 bg-white p-3">
          <button onClick={onAddRoom} className="flex-1 rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50">+ Add room</button>
          <button onClick={onFinishCard} className="flex-1 rounded-xl bg-[#1F3A5F] py-3 text-sm font-bold text-white hover:opacity-90">Finish &amp; sign</button>
        </div>
      )}
    </div>
  );
}
