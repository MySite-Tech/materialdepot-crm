'use client';

import { RotateCw } from 'lucide-react';
import { STUDIO_SPACE_URL, StudioFirm } from '../../../models/client';
import { useStudioSignIn } from '../../../hooks/use-studio-sign-in';
import { useState } from 'react';

export function StudioViewCard({ studio }: { studio: StudioFirm }) {
  const viewAs = `${STUDIO_SPACE_URL}/console/view-as?firm=${encodeURIComponent(studio.partnerId)}`;
  const signIn = useStudioSignIn(viewAs);
  const [signedIn, setSignedIn] = useState(false);
  const src = signIn.error ? viewAs : signedIn ? viewAs : signIn.src;

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden flex flex-col">
      <div className="px-4 py-2.5 border-b border-gray-100 flex items-center gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-gray-900">{studio.firmName} on Studio Space</div>
          <div className={`text-[11.5px] ${signIn.error ? 'text-amber-700' : 'text-gray-500'}`}>
            {signIn.error
              ? `Not signed in automatically (${signIn.error}). Sign in below, then open their view again.`
              : 'Their view: the firm’s own dashboard as they see it. A KAM sees their own firms, read-only; an admin can act.'}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => { setSignedIn(false); signIn.reload(); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-gray-200 text-[12px] text-gray-600 hover:bg-gray-50">
            <RotateCw size={12} /> Reload
          </button>
          <a href={viewAs} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 rounded-md bg-[#0F766E] text-white text-[12px] font-semibold hover:bg-[#0D5F58]">Open in new tab ↗</a>
        </div>
      </div>
      {!src ? (
        <p className="text-sm text-gray-400 py-16 text-center">Signing you in to Studio Space…</p>
      ) : (
        <iframe
          key={src}
          src={src}
          title={`${studio.firmName} on Studio Space`}
          onLoad={() => { if (!signIn.error && !signedIn) setSignedIn(true); }}
          className="w-full h-[calc(100vh-190px)] min-h-[520px] border-0 bg-white"
          allow="clipboard-write"
        />
      )}
    </div>
  );
}
