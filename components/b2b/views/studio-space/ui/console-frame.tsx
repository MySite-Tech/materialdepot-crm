'use client';

export function ConsoleFrame({ src, hidden }: { src: string | null; hidden: boolean }) {
  if (hidden && !src) return null;
  if (!src) return <p className="flex-1 text-sm text-gray-400 py-16 text-center bg-white">Signing you in to Studio Space…</p>;
  return (
    <iframe
      key={src}
      src={src}
      title="Studio Space admin"
      className={`flex-1 w-full min-h-[600px] border-0 bg-white ${hidden ? 'hidden' : ''}`}
      allow="clipboard-write"
    />
  );
}
