'use client';

import { downloadCsv } from '../../../data/cat-analytics';
import { Drill } from '../types';
import { useEffect } from 'react';

export function DrillModal({ drill, onClose }: { drill: Drill; onClose: () => void }) {
  const yes = drill.rows.filter((r) => r.hit === 'yes');
  const no = drill.rows.filter((r) => r.hit === 'no');
  const na = drill.rows.filter((r) => r.hit === 'na');
  const den = yes.length + no.length;
  const pct = den ? Math.round((yes.length / den) * 100) : null;

  const ordered = [...yes, ...no, ...na];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const download = () => {
    const header = ['Enquiry ID', 'Customer', 'Phone', 'BM', 'Assigned to', 'Slot', 'Date', 'Counts', 'Result'];
    downloadCsv(
      drill.title.replace(/[^a-z0-9]+/gi, '_').toLowerCase(),
      [header].concat(ordered.map((r) => [r.pi, r.customer, r.phone, r.bm, r.person, r.slot, r.date, r.hit === 'yes' ? 'yes' : r.hit === 'no' ? 'no' : 'n/a', r.result]))
    );
  };

  const cell = 'px-3 py-2 text-[12.5px] border-t border-gray-100 align-middle';
  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-black/45 p-3 sm:p-6" onClick={onClose}>
      <div className="flex max-h-[88vh] w-full max-w-[1100px] flex-col overflow-hidden rounded-xl bg-white" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 border-b border-gray-200 px-5 py-4">
          <div className="flex-1">
            <h3 className="text-[15px] font-bold text-black">{drill.title}</h3>
            <div className="mt-1 text-[12px] text-gray-500">
              {drill.summary ? (
                drill.summary
              ) : !drill.rows.length ? (
                'No rows in this range'
              ) : den ? (
                <>
                  <b className="text-green-700">{yes.length}</b> of <b>{den}</b>
                  {pct !== null ? <> — {pct}%</> : null}
                  {no.length ? (
                    <>
                      {' · '}
                      <b className="text-red-700">{no.length}</b> did not
                    </>
                  ) : null}
                </>
              ) : (
                <>{drill.rows.length} row(s), none of which can be judged</>
              )}
              {!drill.summary && na.length ? <> · {na.length} not judged</> : null}
            </div>
          </div>
          <button onClick={onClose} className="-mt-1 cursor-pointer border-0 bg-transparent text-2xl leading-none text-gray-400 hover:text-gray-700" aria-label="Close">
            ×
          </button>
        </div>

        {drill.note ? <div className="border-b border-gray-100 bg-gray-50 px-5 py-3 text-[11.5px] leading-relaxed text-gray-500">{drill.note}</div> : null}

        <div className="flex-1 overflow-auto">
          {ordered.length ? (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-gray-50">
                <tr>
                  {['Enquiry ID', 'Customer', 'Phone', 'BM', 'Assigned to', 'Slot', 'Date', 'Result'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordered.map((r, i) => (
                  <tr key={i} className={r.hit === 'yes' ? 'bg-green-50/40' : r.hit === 'no' ? 'bg-red-50/40' : ''}>
                    <td className={cell + ' font-mono text-[11.5px] whitespace-nowrap'}>{r.pi || '—'}</td>
                    <td className={cell}>{r.customer || '—'}</td>
                    <td className={cell + ' whitespace-nowrap'}>
                      {r.phone ? (
                        <a href={'tel:' + r.phone} className="text-blue-600 hover:underline">
                          {r.phone}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={cell}>{r.bm || '—'}</td>
                    <td className={cell}>{r.person || '—'}</td>
                    <td className={cell + ' whitespace-nowrap text-gray-500'}>{r.slot || '—'}</td>
                    <td className={cell + ' whitespace-nowrap text-gray-500'}>{r.date || '—'}</td>
                    <td className={cell + ' ' + (r.hit === 'yes' ? 'font-semibold text-green-700' : r.hit === 'no' ? 'text-red-700' : 'text-gray-500')}>{r.result}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="px-5 py-8 text-center text-[13px] text-gray-400">Nothing in this date range.</div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-200 px-5 py-3">
          <span className="text-[11px] text-gray-400">Green = counts toward the metric · red = does not</span>
          <button
            onClick={download}
            disabled={!ordered.length}
            className="cursor-pointer rounded-md bg-[#1F3A5F] px-4 py-2 text-[12.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            ⬇ Download CSV
          </button>
        </div>
      </div>
    </div>
  );
}
