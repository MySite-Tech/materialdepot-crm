'use client';

import { Job, PersistedRoom, Room } from '../../types/installer';
import { ActingAs } from '../SiteAuditorApp';
import { SignaturePadHandle } from '../fieldAppShared';
import { JobCardWizardOverlay } from './wizard';
import { Dispatch, RefObject, SetStateAction } from 'react';

export function InstallerJobCardHost({ actingAs, finishBusy, finishCard, finishInstallation, hadSign, handleAddRoom, handleFilesForRoom, handleJcBack, installerSignName, jcJobRef, jcRooms, jcStage, markAdditionalComplete, onSignNext, removePhotoFromRoom, removeRoom, saveStatus, setInstallerSignName, setJcStage, setLightboxSrc, setScanTargetRoomId, setSignName, signName, signPadRef, updateRoomCategory, updateRoomField, updateRoomInstallField }: {
  actingAs: ActingAs;
  finishBusy: boolean;
  finishCard: () => void;
  finishInstallation: () => Promise<void>;
  hadSign: boolean;
  handleAddRoom: () => void;
  handleFilesForRoom: (roomId: number, files: FileList | null) => Promise<string | null>;
  handleJcBack: () => void;
  installerSignName: string;
  jcJobRef: RefObject<Job | null>;
  jcRooms: Room[];
  jcStage: "rooms" | "review" | "handoff" | "tcs" | "signature" | "installerSignoff";
  markAdditionalComplete: () => Promise<void>;
  onSignNext: () => Promise<void>;
  removePhotoFromRoom: (roomId: number, idx: number) => void;
  removeRoom: (roomId: number) => void;
  saveStatus: "idle" | "saving" | "saved" | "local";
  setInstallerSignName: Dispatch<SetStateAction<string>>;
  setJcStage: Dispatch<SetStateAction<"rooms" | "review" | "handoff" | "tcs" | "signature" | "installerSignoff">>;
  setLightboxSrc: Dispatch<SetStateAction<string | null>>;
  setScanTargetRoomId: Dispatch<SetStateAction<number | null>>;
  setSignName: Dispatch<SetStateAction<string>>;
  signName: string;
  signPadRef: RefObject<SignaturePadHandle | null>;
  updateRoomCategory: (roomId: number, category: string) => void;
  updateRoomField: (roomId: number, field: keyof PersistedRoom, value: string) => void;
  updateRoomInstallField: (roomId: number, k: string, value: string) => void;
}) {
  if (!jcJobRef.current) return null;

  return (
    <JobCardWizardOverlay
      job={jcJobRef.current}
      installerName={actingAs.name}
      rooms={jcRooms}
      stage={jcStage}
      signName={signName}
      installerSignName={installerSignName}
      saveStatus={saveStatus}
      hadSign={hadSign}
      finishBusy={finishBusy}
      signPadRef={signPadRef}
      onBack={handleJcBack}
      onAddRoom={handleAddRoom}
      onRemoveRoom={removeRoom}
      onRoomField={updateRoomField}
      onRoomCategory={updateRoomCategory}
      onRoomInstallField={updateRoomInstallField}
      onRoomFiles={handleFilesForRoom}
      onRoomRemovePhoto={removePhotoFromRoom}
      onOpenScanner={(roomId) => setScanTargetRoomId(roomId)}
      onOpenLightbox={setLightboxSrc}
      onFinishCard={finishCard}
      onBackToRooms={() => setJcStage('rooms')}
      onProceed={() => { if (jcJobRef.current!.isPrimary) setJcStage('handoff'); else markAdditionalComplete(); }}
      onBackFromHandoff={() => setJcStage('review')}
      onClientReady={() => setJcStage('tcs')}
      onTcsBack={() => setJcStage('handoff')}
      onTcsProceed={() => {
        setSignName(jcJobRef.current!.name);
        setJcStage('signature');
      }}
      onSignBack={() => setJcStage('tcs')}
      onSignNameChange={setSignName}
      onSignNext={onSignNext}
      onInstallerSignNameChange={setInstallerSignName}
      onBackFromInstallerSignoff={() => setJcStage('signature')}
      onFinishInstallation={finishInstallation}
    />
  );
}
