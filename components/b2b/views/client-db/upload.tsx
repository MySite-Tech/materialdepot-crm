'use client';

import { CLIENT_IMPORT_LOG_HEADERS, CLIENT_UPLOAD_COLUMNS, CLIENT_UPLOAD_FORMAT, CLIENT_UPLOAD_MANDATORY, ClientImportResult, clientImportLogRows, parseDelimited, summarizeClientImport, templateSheets, validateClientRows } from '../../io/clientImport';
import { ClientEntity } from '../../models/clientModel';
import { exportRowsCsv, todayStr } from '../../ui/exportUtils';
import { btnGhost, btnPrimary, inputCls } from '../../utils/client-db';
import { useMemo, useState } from 'react';

export function UploadModal({ existing, onClose, onImport }: {
  existing: ClientEntity[];
  onClose: () => void;
  onImport: (result: ClientImportResult) => Promise<Record<string, string>>;
}) {
  const [text, setText] = useState('');
  const [fileRows, setFileRows] = useState<string[][] | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveErrors, setSaveErrors] = useState<Record<string, string> | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileError('');
    setSaveErrors(null);
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith('.csv') || name.endsWith('.txt') || name.endsWith('.tsv')) {
        setFileRows(parseDelimited(await file.text()));
      } else {
        const XLSX = await import('xlsx');
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });

        const ws = wb.Sheets['Template'] || wb.Sheets[wb.SheetNames[0]];
        if (!ws) throw new Error('the workbook has no readable sheet');
        setFileRows(XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, blankrows: true, raw: false, defval: '' }));
      }
      setFileName(file.name);
      setText('');
    } catch (e) {
      setFileRows(null);
      setFileName('');
      setFileError(`Could not read ${file.name}: ${e instanceof Error ? e.message : String(e)}. Use .xlsx, .xls or .csv.`);
    }
  };

  const parsed = useMemo(() => {
    const rows = fileRows ?? (text.trim() ? parseDelimited(text) : []);
    if (!rows.length) return null;
    return validateClientRows(rows, existing);
  }, [fileRows, text, existing]);

  const withSave = useMemo(() => {
    if (!parsed || !saveErrors) return parsed;
    return {
      ...parsed,
      entities: parsed.entities.map((e) => (e.client && saveErrors[e.client.id] ? { ...e, saveError: saveErrors[e.client.id] } : e)),
    };
  }, [parsed, saveErrors]);

  const summary = withSave ? summarizeClientImport(withSave) : null;
  const writable = (withSave?.entities || []).filter((e) => e.client && !e.saveError);

  const doImport = async () => {
    if (!withSave || !writable.length) return;
    setSaving(true);
    try {
      const errors = await onImport(withSave);
      if (Object.keys(errors).length) setSaveErrors(errors); else onClose();
    } finally {
      setSaving(false);
    }
  };

  const downloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    for (const sheet of templateSheets()) {
      const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
      if (sheet.colWidths) ws['!cols'] = sheet.colWidths.map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(wb, ws, sheet.name);
    }
    XLSX.writeFile(wb, 'Client_Database_Upload_Template.xlsx');
  };

  const downloadLog = () => {
    if (!withSave) return;
    exportRowsCsv(CLIENT_IMPORT_LOG_HEADERS, clientImportLogRows(withSave), `client-import-log-${todayStr()}`);
  };

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-[820px] bg-white rounded-xl shadow-xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-bold text-gray-800">Bulk Upload Clients</h2>
            <p className="text-[11px] text-gray-400">Client Database PRD §6.2 / §7</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none cursor-pointer">×</button>
        </div>

        <div className="px-6 py-5 overflow-y-auto flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="text-[12px] text-gray-500 min-w-0 flex-1">
              <p className="mb-1">Columns, in this order — <span className="font-semibold">one row = one contact number / GST pairing</span>, so a client with two numbers is two rows sharing a Company Name:</p>
              <div className="text-[11px] bg-gray-50 rounded-md p-2 overflow-x-auto">
                {CLIENT_UPLOAD_COLUMNS.map((c, i) => (
                  <span key={c} className="whitespace-nowrap">
                    <span className="text-gray-400">{i + 1}.</span>{' '}
                    <span className={CLIENT_UPLOAD_MANDATORY[c] ? 'font-semibold text-gray-700' : 'text-gray-500'} title={CLIENT_UPLOAD_FORMAT[c]}>{c}</span>
                    {CLIENT_UPLOAD_MANDATORY[c] && <span className="text-red-400">*</span>}
                    {i < CLIENT_UPLOAD_COLUMNS.length - 1 && <span className="text-gray-300">{'  ·  '}</span>}
                  </span>
                ))}
              </div>
            </div>
            <button onClick={downloadTemplate} className={btnGhost + ' whitespace-nowrap'}>⇩ Download template</button>
          </div>

          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Excel / CSV file</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.tsv,.txt"
              onChange={(e) => onFile(e.target.files?.[0])}
              className="block w-full text-[12px] text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[#0F766E] file:text-white file:text-[12px] file:font-semibold"
            />
            {fileName && <span className="text-[11px] text-[#0F766E] mt-1 inline-block">{fileName} · {parsed?.rows.length || 0} data rows{parsed?.skipped ? ` · ${parsed.skipped} header/blank skipped` : ''}</span>}
          </label>

          <label className="block">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Or paste rows</span>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setFileRows(null); setFileName(''); setFileError(''); setSaveErrors(null); }}
              rows={3}
              placeholder={'Metro Constructions, 9900099013, Rahul Nair, Owner, 27AAPFU0939F1ZV, 1, Contractor, , Monthly orders'}
              className={inputCls + ' resize-none font-mono text-[11px]'}
            />
          </label>

          {fileError && <p className="text-[12px] text-red-600">{fileError}</p>}

          {withSave && summary && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                  {!!summary.entitiesCreate && <span className="px-2 py-0.5 rounded-md bg-green-50 text-green-700 font-semibold">{summary.entitiesCreate} new client{summary.entitiesCreate === 1 ? '' : 's'}</span>}
                  {!!summary.entitiesUpdate && <span className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-700 font-semibold">{summary.entitiesUpdate} updated</span>}
                  {!!summary.entitiesMerge && <span className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold">{summary.entitiesMerge} merged in</span>}
                  {!!summary.rowsWarned && <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-semibold">{summary.rowsWarned} warning{summary.rowsWarned === 1 ? '' : 's'}</span>}
                  {!!summary.rowsRejected && <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700 font-semibold">{summary.rowsRejected} rejected</span>}
                  {!!summary.entitiesFailed && <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700 font-semibold">{summary.entitiesFailed} not saved</span>}
                </div>
                <button onClick={downloadLog} className="text-[11px] font-semibold text-[#0F766E] hover:underline cursor-pointer whitespace-nowrap">Download log (.csv)</button>
              </div>

              {!!withSave.possibleDuplicates.length && (
                <div className="border border-amber-200 bg-amber-50 rounded-md px-2 py-1.5 text-[11px] text-amber-900">
                  <div className="font-semibold mb-0.5">{withSave.possibleDuplicates.length} possible duplicate{withSave.possibleDuplicates.length === 1 ? '' : 's'} — uploaded as new clients, not merged</div>
                  {withSave.possibleDuplicates.slice(0, 5).map((d, i) => (
                    <div key={i}>“{d.company}” looks like existing “{d.existingCompany}” but shares no number or GST. Merge by hand if they are the same firm.</div>
                  ))}
                </div>
              )}

              <div className="border border-gray-200 rounded-md overflow-hidden">
                <div className="max-h-[180px] overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr className="text-gray-400 text-[9px] uppercase tracking-wider">
                        <th className="text-left font-semibold px-2 py-1.5">Client</th>
                        <th className="text-left font-semibold px-2 py-1.5">Action</th>
                        <th className="text-left font-semibold px-2 py-1.5">Numbers / GSTs</th>
                        <th className="text-left font-semibold px-2 py-1.5">Rows</th>
                      </tr>
                    </thead>
                    <tbody>
                      {withSave.entities.map((e) => (
                        <tr key={e.key} className="border-t border-gray-100 align-top">
                          <td className="px-2 py-1.5 font-medium text-gray-700">{e.company}</td>
                          <td className="px-2 py-1.5">
                            {e.saveError
                              ? <span className="text-red-600">{e.saveError}</span>
                              : e.action === 'create'
                                ? <span className="text-green-700">new</span>
                                : <span className="text-teal-700">{e.action === 'merge-into' ? 'merge into' : 'update'} “{e.existingCompany}” <span className="text-gray-400">({e.matchedOn})</span></span>}
                          </td>
                          <td className="px-2 py-1.5 font-mono text-gray-500">
                            {e.contacts.map((c) => c.number).join(', ')}
                            {!!e.gsts.length && <span className="text-gray-400"> · {e.gsts.map((g) => g.number).join(', ')}</span>}
                          </td>
                          <td className="px-2 py-1.5 text-gray-400 font-mono">{e.lines.join(' ')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {withSave.rows.some((r) => r.issues.length) && (
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <div className="max-h-[180px] overflow-y-auto">
                    <table className="w-full text-[11px]">
                      <tbody>
                        {withSave.rows.filter((r) => r.issues.length).map((r) => (
                          <tr key={r.line} className="border-t border-gray-100 align-top">
                            <td className="px-2 py-1.5 font-mono text-gray-400 w-10">{r.line}</td>
                            <td className="px-2 py-1.5 text-gray-700 font-medium">{r.company || <span className="text-gray-300">(blank)</span>}</td>
                            <td className="px-2 py-1.5">
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
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-100">
          <span className="text-[11px] text-gray-400">
            {saveErrors ? `${Object.keys(saveErrors).length} client(s) could not be saved.` : ''}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className={btnGhost}>{saveErrors ? 'Close' : 'Cancel'}</button>
            <button onClick={doImport} disabled={saving || !writable.length} className={btnPrimary}>
              {saving ? 'Importing…' : writable.length ? `Import ${writable.length} client${writable.length === 1 ? '' : 's'}` : 'Import'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
