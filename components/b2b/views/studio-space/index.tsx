'use client';

import { RotateCw } from 'lucide-react';
import { STUDIO_CONSOLE_URL } from './constants';
import { StudioNumbers } from './numbers';
import { ConsoleFrame } from './ui/console-frame';
import { useStudioSignIn } from '../../hooks/use-studio-sign-in';
import { useState } from 'react';

type Pane = 'console' | 'numbers';

const PANES: [Pane, string][] = [['console', 'Studio Space admin'], ['numbers', 'Numbers by firm']];

export default function StudioSpace() {
  const [pane, setPane] = useState<Pane>('console');
  const signIn = useStudioSignIn(STUDIO_CONSOLE_URL);

  return (
    <div className="h-full flex flex-col">
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white flex-wrap">
        <h1 className="text-[14px] font-bold text-gray-800">Studio Space</h1>
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5">
          {PANES.map(([k, label]) => (
            <button key={k} onClick={() => setPane(k)}
              className={`px-3 py-1 rounded-md text-[12px] font-semibold cursor-pointer ${pane === k ? 'bg-[#0F766E] text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
              {label}
            </button>
          ))}
        </div>
        {pane === 'console' && (
          <span className={`text-[11px] ${signIn.error ? 'text-amber-700 font-semibold' : 'text-gray-400'}`}>
            {signIn.error
              ? `Not signed in automatically: ${signIn.error}. Sign in below.`
              : 'Signed in by your CRM mobile. Blank? Open in a new tab once, then Reload.'}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {pane === 'console' && (
            <button onClick={signIn.reload} title="Reload Studio Space"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-gray-200 text-[12px] text-gray-600 hover:bg-gray-50 cursor-pointer">
              <RotateCw size={12} /> Reload
            </button>
          )}
          <a href={STUDIO_CONSOLE_URL} target="_blank" rel="noopener noreferrer"
            className="px-2.5 py-1 rounded-md bg-[#0F766E] text-white text-[12px] font-semibold hover:bg-[#0D5F58]">
            Open in new tab ↗
          </a>
        </div>
      </div>
      <ConsoleFrame src={signIn.src} hidden={pane !== 'console'} />
      {pane === 'numbers' && <div className="flex-1 overflow-y-auto"><StudioNumbers /></div>}
    </div>
  );
}
