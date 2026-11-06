import type { ClientImportPlan } from '@/lib/b2b/client-import/types';
import { btnGhost, btnPrimary } from '../../../constants/ui';
import type { ClientImporter } from '../hooks/use-client-import';

const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

const firms = (n: number) => `${n.toLocaleString('en-IN')} firm${n === 1 ? '' : 's'}`;

function Breakdown({ p }: { p: ClientImportPlan }) {
  return (
    <>
      {' '}Orders placed {day(p.from)} – {day(p.to)}: {p.ordersRead.toLocaleString('en-IN')} read, {firms(p.firmsFound)} billed with a GSTIN,
      {' '}{p.alreadyHere.toLocaleString('en-IN')} already here by number or GSTIN
      {p.noPhone ? `, ${p.noPhone} with no phone number left out` : ''}.
      {p.truncated && <span className="font-semibold"> Some months had more orders than one read takes, so this is a floor.</span>}
    </>
  );
}

export function ImportBar({ importer }: { importer: ClientImporter }) {
  const { last, preview, busy, error } = importer;

  if (preview) {
    return (
      <div className="mb-3 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2.5 text-[12px] text-teal-900 flex items-start justify-between gap-3 flex-wrap">
        <span>
          <b>{firms(preview.newFirms)} {preview.newFirms === 1 ? 'is' : 'are'} not in the Client Database yet.</b>
          <Breakdown p={preview} />
          {' '}They are added with no KAM, named after the client on their latest order.
        </span>
        <span className="flex gap-2 shrink-0">
          <button onClick={importer.cancel} className={btnGhost} disabled={busy === 'year'}>Cancel</button>
          <button onClick={importer.confirm} className={btnPrimary} disabled={busy === 'year' || !preview.newFirms}>
            {busy === 'year' ? 'Adding…' : `Add ${firms(preview.newFirms)}`}
          </button>
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12px] text-amber-900 flex items-start justify-between gap-3">
        <span>New firms could not be brought in from orders: {error}. Nothing was added.</span>
        <button onClick={importer.dismiss} className="opacity-60 hover:opacity-100 leading-none">×</button>
      </div>
    );
  }

  if (!last?.imported) return null;

  return (
    <div className="mb-3 rounded-lg border border-teal-200 bg-teal-50 px-4 py-2.5 text-[12px] text-teal-900 flex items-start justify-between gap-3">
      <span>
        <b>Added {firms(last.imported)} from orders.</b>
        <Breakdown p={last} />
      </span>
      <button onClick={importer.dismiss} className="opacity-60 hover:opacity-100 leading-none">×</button>
    </div>
  );
}
