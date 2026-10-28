'use client';

import { InboundLead, OutreachLead } from '../../../models/mock-data';
import { CSV_COLUMNS, CSV_MAX_ROWS, CSV_TEMPLATE, ImportRow, Rep, planImport } from '../../../models/outreach/intake';
import { exportRowsCsv } from '../../../utils/export';
import { inputCls } from '../../../ui/inbound-chips';
import { nowIso } from '../utils';
import { useMemo, useState } from 'react';

type Plan = ReturnType<typeof planImport>;

export function ImportModal({ existing, inbound, reps, me, canPickBm, onClose, onImport }: {
  existing: OutreachLead[];
  inbound: InboundLead[] | null;
  reps: Rep[];
  me: Rep;
  canPickBm: boolean;
  onClose: () => void;
  onImport: (leads: OutreachLead[]) => Promise<string | null>;
}) {
  const [grid, setGrid] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState('');
  const [readError, setReadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fallback = reps.find((r) => r.name === me.name) || reps[0] || me;
  const [defaultBm, setDefaultBm] = useState(fallback.name);
  const defaultRep = canPickBm ? reps.find((r) => r.name === defaultBm) || fallback : fallback;

  const plan: Plan | null = useMemo(() => grid && planImport(grid, {
    existing, inbound: inbound || [], reps: canPickBm ? reps : [defaultRep], defaultRep, by: me.name, at: nowIso(),
  }), [grid, existing, inbound, reps, canPickBm, defaultRep, me.name]);

  const ready = plan?.rows.filter((r) => r.lead) ?? [];
  const skipped = plan?.rows.filter((r) => !r.lead) ?? [];

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    setReadError(null);
    setFileName(file.name);
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      setGrid(XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' }));
    } catch {
      setGrid(null);
      setReadError('That file could not be read. Save it as .csv or .xlsx and try again.');
    }
  };

  const commit = async () => {
    setSaving(true);
    setSaveError(null);
    const err = await onImport(ready.map((r) => r.lead!));
    setSaving(false);
    if (err) setSaveError(`Nothing was imported: ${err}`);
    else onClose();
  };

  const issue = (r: ImportRow) => [...r.errors, ...r.warnings].join(' · ');

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[860px] bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-gray-100 gap-3">
          <div>
            <h2 className="text-base font-bold text-gray-800">Import leads</h2>
            <p className="text-[11px] text-gray-400 mt-0.5 leading-snug">
              {`A .csv or .xlsx with one firm per row, up to ${CSV_MAX_ROWS}. Required: ${CSV_COLUMNS.filter((c) => c.required).map((c) => c.header).join(' and ')}. Every lead starts in Yet to Meet.`}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-4 overflow-y-auto flex flex-col gap-3">
          <div className="flex items-end gap-3 flex-wrap">
            <label className="block">
              <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">File</span>
              <input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => readFile(e.target.files?.[0])} className="text-[12px]" />
            </label>
            {canPickBm && (
              <label className="block min-w-[180px]">
                <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">BM when the row has none</span>
                <select value={defaultBm} onChange={(e) => setDefaultBm(e.target.value)} className={inputCls}>
                  {reps.map((r) => <option key={r.phone || r.name} value={r.name}>{r.name}</option>)}
                </select>
              </label>
            )}
            <button
              onClick={() => exportRowsCsv(CSV_TEMPLATE[0], CSV_TEMPLATE.slice(1), 'outreach_import_template')}
              className="ml-auto text-[11.5px] font-semibold text-[#0F766E] hover:underline"
            >
              Download template
            </button>
          </div>
          <p className="text-[10.5px] text-gray-400 leading-snug">
            {`Columns read: ${CSV_COLUMNS.map((c) => c.header).join(', ')}. Common alternatives (Company, Phone, Contact number, GSTIN, Address…) are recognised. A mobile already in Outreach is skipped; one that is an Inbound lead is imported with a warning.`}
          </p>

          {readError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{readError}</div>}
          {plan && plan.missingRequired.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
              {`${fileName} has no ${plan.missingRequired.join(' or ')} column. Rename the header or use the template.`}
            </div>
          )}
          {plan && !plan.missingRequired.length && (
            <>
              <div className="flex items-center gap-3 text-[12px] flex-wrap">
                <span className="font-semibold text-green-700">{`${ready.length} ready to import`}</span>
                {skipped.length > 0 && <span className="font-semibold text-red-600">{`${skipped.length} will be skipped`}</span>}
                {plan.overLimit > 0 && <span className="font-semibold text-amber-700">{`${plan.overLimit} rows past the ${CSV_MAX_ROWS}-row limit were not read — split the file`}</span>}
                {plan.unknownHeaders.length > 0 && <span className="text-gray-400">{`Ignored columns: ${plan.unknownHeaders.join(', ')}`}</span>}
              </div>
              <div className="border border-gray-200 rounded-md overflow-auto max-h-[46vh]">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr>{['Line', 'Firm', 'Mobile', 'BM', 'Source', 'Issues'].map((h) => (
                      <th key={h} className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-gray-400 text-left">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {plan.rows.map((r) => (
                      <tr key={r.line} className={`border-t border-gray-50 ${r.lead ? '' : 'bg-red-50/60'}`}>
                        <td className="px-3 py-1.5 text-gray-400 font-mono">{r.line}</td>
                        <td className="px-3 py-1.5 text-gray-900 font-semibold max-w-[200px] truncate">{r.company || '—'}</td>
                        <td className="px-3 py-1.5 font-mono text-gray-600">{r.phone || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-600">{r.lead?.bm || '—'}</td>
                        <td className="px-3 py-1.5 text-gray-600">{r.lead?.source || '—'}</td>
                        <td className={`px-3 py-1.5 leading-snug ${r.errors.length ? 'text-red-600' : 'text-amber-700'}`}>{issue(r)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {saveError && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">{saveError}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-[12px] font-semibold border border-gray-200 rounded-md text-gray-500 bg-white">Cancel</button>
          <button
            onClick={commit}
            disabled={saving || !ready.length}
            className="px-4 py-2 text-[12px] font-semibold rounded-md bg-[#0F766E] text-white disabled:opacity-50"
          >
            {saving ? 'Importing…' : `Import ${ready.length} lead${ready.length === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
