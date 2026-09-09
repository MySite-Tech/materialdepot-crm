import { CLIENT_ENTITY_TYPES, SEGMENTS } from '../../models/clientModel';
import { CLIENT_UPLOAD_COLUMNS, CLIENT_UPLOAD_FORMAT, CLIENT_UPLOAD_MANDATORY, TEMPLATE_EXAMPLE_ROWS } from '../../constants/client-import';
import { ClientImportResult, ClientImportSummary, TemplateSheet } from '../../types/client-import';
export function summarizeClientImport(r: ClientImportResult): ClientImportSummary {
  return {
    rowsOk: r.rows.filter((x) => x.severity === 'ok').length,
    rowsWarned: r.rows.filter((x) => x.severity === 'warn').length,
    rowsRejected: r.rows.filter((x) => x.severity === 'error').length,
    skipped: r.skipped,
    entitiesCreate: r.entities.filter((e) => e.action === 'create' && !e.saveError).length,
    entitiesUpdate: r.entities.filter((e) => e.action === 'update-existing' && !e.saveError).length,
    entitiesMerge: r.entities.filter((e) => e.action === 'merge-into' && !e.saveError).length,
    entitiesFailed: r.entities.filter((e) => !!e.saveError).length,
    possibleDuplicates: r.possibleDuplicates.length,
  };
}

export function clientImportLogRows(r: ClientImportResult): string[][] {
  const out: string[][] = [];
  for (const row of r.rows) {
    const result = row.saveError ? 'Save failed'
      : row.severity === 'error' ? 'Rejected'
      : row.severity === 'warn' ? 'Imported with warnings'
      : 'Imported';
    if (row.saveError) out.push([String(row.line), row.company, result, '—', row.saveError]);
    for (const issue of row.issues) out.push([String(row.line), row.company, result, issue.column, issue.message]);
    if (!row.saveError && !row.issues.length) out.push([String(row.line), row.company, result, '—', '']);
  }
  for (const e of r.entities) {
    if (e.saveError) out.push([e.lines.join(' '), e.company, 'Entity not saved', '—', e.saveError]);
    else if (e.action !== 'create') {
      out.push([e.lines.join(' '), e.company, e.action === 'merge-into' ? 'Merged into existing' : 'Updated existing', '—', `matched "${e.existingCompany}" on ${e.matchedOn}`]);
    }
  }
  for (const d of r.possibleDuplicates) {
    out.push(['—', d.company, 'Possible duplicate', '—', `looks like existing client "${d.existingCompany}" but shares no contact number or GST — merge it by hand from the Merge screen if they are the same firm`]);
  }
  return out;
}

export function templateSheets(): TemplateSheet[] {
  const instructions: (string | number)[][] = [
    ['Client Database — Bulk Upload Template'],
    ['Material Depot · B2B Sales · Client Database Module PRD v1.0, §7'],
    [],
    ['How to use this file'],
    ['1.', 'Fill the "Template" sheet. Keep the header row exactly as it is — the importer reads columns by position.'],
    ['2.', 'One row = one contact number / GST pairing for a client.'],
    ['3.', 'A client with two phone numbers and one GST is TWO rows sharing the same Company Name.'],
    ['4.', 'Delete the example rows before uploading.'],
    ['5.', 'Upload it in the CRM: B2B Sales → Client Database → Bulk Upload.'],
    [],
    ['Columns'],
    ['Column', 'Mandatory', 'Format'],
    ...CLIENT_UPLOAD_COLUMNS.map((c) => [c, CLIENT_UPLOAD_MANDATORY[c] ? 'Yes' : 'No', CLIENT_UPLOAD_FORMAT[c]]),
    [],
    ['Accepted values'],
    ['Segment', SEGMENTS.join(', ')],
    ['Client Type', CLIENT_ENTITY_TYPES.join(', ')],
    [],
    ['A note on dropdowns'],
    ['', 'The PRD asks for dropdown validation on Segment and Client Type. The library this CRM generates'],
    ['', 'the file with cannot write Excel data validations, so the accepted values are on the "Lists" sheet'],
    ['', 'instead — select the Segment or Client Type column in Excel, then Data → Data Validation → List,'],
    ['', 'and point it at the matching column on "Lists" if you want the dropdown in your own copy.'],
    ['', 'Either way the upload itself REJECTS any value outside these lists and tells you the row number,'],
    ['', 'so a wrong value can never reach the Client Database.'],
    [],
    ['What happens to a row that matches a client we already have'],
    ['', 'Same contact number or same GST → the row is added to that existing client (it is the same client).'],
    ['', 'Merge With naming an exact existing Company Name → merged into it.'],
    ['', 'A similar company name and nothing else → uploaded as a NEW client and flagged for review, because'],
    ['', 'two firms with similar names are not one client. Merge them by hand from the Merge screen.'],
  ];

  const lists: (string | number)[][] = [
    ['Segment', 'Client Type'],
    ...Array.from({ length: Math.max(SEGMENTS.length, CLIENT_ENTITY_TYPES.length) }, (_, i) => [
      SEGMENTS[i] ?? '',
      CLIENT_ENTITY_TYPES[i] ?? '',
    ]),
  ];

  return [
    { name: 'Instructions', rows: instructions, colWidths: [34, 12, 78] },
    { name: 'Template', rows: [[...CLIENT_UPLOAD_COLUMNS], ...TEMPLATE_EXAMPLE_ROWS], colWidths: CLIENT_UPLOAD_COLUMNS.map(() => 26) },
    { name: 'Lists', rows: lists, colWidths: [12, 24] },
  ];
}
