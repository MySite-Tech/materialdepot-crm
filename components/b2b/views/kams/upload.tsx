'use client';

import { IMPORT_LOG_HEADERS, ParsedRow, UPLOAD_COLUMNS, importLogRows, parseDelimited, summarize, validateRows } from '../../io/kam-import';
import { KamOrder } from '../../models/kam';
import { exportRowsCsv, todayStr } from '../../utils/export';
import { btnGhost, btnPrimary, inputCls } from '../../constants/ui';
import { useMemo, useState } from 'react';

export function UploadModal({ existing, onClose, onImport }: {
  existing: KamOrder[];
  onClose: () => void;
  onImport: (orders: KamOrder[]) => Promise<Record<string, string>>;
}) {
  const [text, setText] = useState('');
  const [fileRows, setFileRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErrors, setSaveErrors] = useState<Record<string, string> | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError(''); setSaveErrors(null);
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.tsv')) {
        setFileRows(parseDelimited(await file.text()));
      } else {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        if (!ws) throw new Error('the first sheet is empty');
        setFileRows(XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: true, raw: false, defval: '' }));
      }
      setFileName(file.name); setText('');
    } catch (e) {
      setFileRows(null); setFileName('');
      setFileError(`Could not read ${file.name}: ${e instanceof Error ? e.message : String(e)}. Use .xlsx, .xls or .csv.`);
    }
  };

  const parsed = useMemo(() => {
    const rows = fileRows ?? (text.trim() ? parseDelimited(text) : []);
    if (!rows.length) return { rows: [] as ParsedRow[], skipped: 0 };
    return validateRows(rows, existing);
  }, [fileRows, text, existing]);

  const rowsWithSave = useMemo(() => {
    if (!saveErrors) return parsed.rows;
    return parsed.rows.map((r) => (r.order && saveErrors[r.order.id] ? { ...r, saveError: saveErrors[r.order.id] } : r));
  }, [parsed.rows, saveErrors]);

  const summary = useMemo(() => summarize(rowsWithSave, parsed.skipped), [rowsWithSave, parsed.skipped]);
  const importable = rowsWithSave.filter((r) => r.order && !r.saveError);

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[720px] bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-800">Upload Active Orders</h2>
            <p className="text-[11px] text-gray-400">The ops team&apos;s existing sheet · one row = one order</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none cursor-pointer">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-4">
          <div className="text-[12px] text-gray-500">
            <p className="mb-1">Columns in this order (only <span className="font-semibold">Client Name</span> required):</p>
            <div className="text-[11px] text-gray-600 bg-gray-50 rounded-md p-2 overflow-x-auto whitespace-nowrap">
              {UPLOAD_COLUMNS.map((c, i) => (
                <span key={c}><span className="text-gray-400">{i + 1}.</span> {c}{i < UPLOAD_COLUMNS.length - 1 ? <span className="text-gray-300">{'  ·  '}</span> : ''}</span>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              The “Value” column is read as the KAM&apos;s <span className="font-semibold">estimate</span>, not as revenue —
              revenue comes from the deal ticket the Enquiry ID matches. The old board&apos;s status names
              (Order Placed, Awaiting Payment…) are still accepted and mapped to the PRD&apos;s five.
              Clients are <span className="font-semibold">not</span> created by this upload; use the Client Database for that.
            </p>
          </div>

          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Excel / CSV file</span>
            <input type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" onChange={(e) => onFile(e.target.files?.[0])}
              className="block w-full text-[12px] text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[#0F766E] file:text-white file:text-[12px] file:font-semibold" />
            {fileName && <span className="text-[11px] text-[#0F766E] mt-1 inline-block">{fileName} · {parsed.rows.length} data rows</span>}
          </label>

          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Or paste rows</span>
            <textarea value={text} onChange={(e) => { setText(e.target.value); setFileRows(null); setFileName(''); setFileError(''); setSaveErrors(null); }}
              rows={3} className={inputCls + ' resize-none font-mono text-[11px]'}
              placeholder={'Metro Constructions, Rahul Nair, 9900099013, ENQ-3980, 265000, 2026-08-01, PI Shared, Jadhav, Sample shared'} />
          </label>

          {fileError && <p className="text-[12px] text-red-600">{fileError}</p>}

          {!!rowsWithSave.length && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap text-[11px]">
                <div className="flex gap-1.5 flex-wrap">
                  <span className="px-2 py-0.5 rounded-md bg-green-50 text-green-700 font-semibold">{summary.valid - summary.failed} ready</span>
                  {!!summary.updates && <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 font-semibold">{summary.updates} updates</span>}
                  {!!summary.warnings && <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-semibold">{summary.warnings} warnings</span>}
                  {!!summary.errors && <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700 font-semibold">{summary.errors} rejected</span>}
                  {!!summary.failed && <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700 font-semibold">{summary.failed} failed to save</span>}
                </div>
                <button onClick={() => exportRowsCsv(IMPORT_LOG_HEADERS, importLogRows(rowsWithSave), `kam-order-import-log-${todayStr()}`)}
                  className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer">Download log (.csv)</button>
              </div>
              {rowsWithSave.some((r) => r.issues.length || r.saveError) && (
                <div className="border border-gray-200 rounded-md overflow-hidden max-h-[220px] overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <tbody>
                      {rowsWithSave.filter((r) => r.issues.length || r.saveError).map((r) => (
                        <tr key={r.line} className="border-t border-gray-100 align-top">
                          <td className="px-2 py-1.5 font-mono text-gray-400 w-10">{r.line}</td>
                          <td className="px-2 py-1.5 font-medium text-gray-700">{r.company || <span className="text-gray-300">(blank)</span>}</td>
                          <td className="px-2 py-1.5">
                            {r.saveError && <div className="text-red-600">Could not save: {r.saveError}</div>}
                            {r.issues.map((issue, i) => (
                              <div key={i} className={issue.severity === 'error' ? 'text-red-600' : 'text-amber-700'}>
                                <span className="text-gray-400">{issue.column}:</span> {issue.message}
                              </div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className={btnGhost}>{saveErrors ? 'Close' : 'Cancel'}</button>
          <button
            onClick={async () => {
              if (!importable.length) return;
              setSaving(true);
              try {
                const errors = await onImport(importable.map((r) => r.order!));
                if (Object.keys(errors).length) setSaveErrors(errors); else onClose();
              } finally { setSaving(false); }
            }}
            disabled={saving || !importable.length}
            className={btnPrimary}
          >
            {saving ? 'Importing…' : importable.length ? `Import ${importable.length} order${importable.length === 1 ? '' : 's'}` : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
