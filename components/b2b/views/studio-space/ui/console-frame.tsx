'use client';

import { STUDIO_CONSOLE_URL } from '../constants';

export function ConsoleFrame({ reloadKey }: { reloadKey: number }) {
  return (
    <iframe
      key={reloadKey}
      src={STUDIO_CONSOLE_URL}
      title="Studio Space admin"
      className="flex-1 w-full min-h-[600px] border-0 bg-white"
      allow="clipboard-write"
    />
  );
}
