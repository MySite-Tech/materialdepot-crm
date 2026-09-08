// ── Client Database bulk upload: parse + validate ─────────────────────────────
//
// Implements the §7 template of `Client_Database_Module_PRD.docx` — nine
// columns, four of them mandatory, "one row = one contact number/GST pairing
// for a client", so several rows sharing a Company Name become ONE entity.
//
// Pure functions, no React and no network. `ClientDatabase.tsx` renders whatever
// this reports, and every parsing primitive (cell hygiene, delimiter sniffing,
// the CSV parser, the phone coercion) is imported from `kamImport.ts` rather
// than copied — two copies of a date parser is how the two hand-kept registries
// in this repo drifted.
//
// PRD open question #3: "when an uploaded row matches an existing client by
// Contact Number or GST, should it auto-merge, or land in a review queue?"
//
// Split, on the strength of the evidence:
//
//   Contact number or GST already on a client → that IS the same client, by the
//     only keys the CRM has that mean identity. The row updates it: the contact
//     or GST is added to the record it already belongs to. Nothing is silently
//     fused, because nothing was two things to begin with.
//   "Merge With" naming an EXACT existing company name → merge, because a human
//     typed the instruction into the sheet.
//   A similar company NAME and nothing else → a new client, and the pair is
//     reported for the merge screen. "Metro Constructions" and "Metro
//     Construction Co" may be two firms, and a bulk upload that guessed would
//     fuse two books of business with nobody able to say which rows it chose.

import {
  cleanCell, normalize, parseDelimited, parsePhone, isHeaderRow as isKamHeaderRow,
  type RowIssue, type RowSeverity,
} from './kamImport';
import {
  CLIENT_ENTITY_TYPES, SEGMENTS, normalizeCompanyName, normalizeGst, validateGst,
  contactNumbers, gstNumbers,
  type ClientEntity, type ClientEntityType, type ClientContact, type ClientGst,
  type Segment,
} from './clientModel';

export { parseDelimited };

/** The §7 template's header row, in order. Positional, like the KAM sheet. */
export const CLIENT_UPLOAD_COLUMNS = [
  'Company Name',
  'Contact Number',
  'Contact Name',
  'Contact Label',
  'GST Number',
  'Segment',
  'Client Type',
  'Merge With (Existing Company Name)',
  'Remarks',
] as const;

export const CLIENT_UPLOAD_MANDATORY: Record<string, boolean> = {
  'Company Name': true,
  'Contact Number': true,
  'Contact Name': true,
  'Contact Label': false,
  'GST Number': false,
  'Segment': true,
  'Client Type': true,
  'Merge With (Existing Company Name)': false,
  'Remarks': false,
};

export const CLIENT_UPLOAD_FORMAT: Record<string, string> = {
  'Company Name': 'Free text — the canonical business entity name',
  'Contact Number': '10-digit mobile number, no country code, no spaces or dashes',
  'Contact Name': 'Free text — the person tied to that contact number',
  'Contact Label': 'e.g. Owner, Accounts, Site Manager',
  'GST Number': '15-character alphanumeric GSTIN, standard format',
  'Segment': '1, 2 or 3 only',
  'Client Type': CLIENT_ENTITY_TYPES.join(' / '),
  'Merge With (Existing Company Name)': 'Exact existing Company Name this row should merge into',
  'Remarks': 'Free text',
};

export type { RowIssue, RowSeverity };

export interface ClientParsedRow {
  /** 1-based row number in the source file, so the log matches the spreadsheet. */
  line: number;
  company: string;
  phone: string;
  gst: string;
  severity: RowSeverity;
  issues: RowIssue[];
  /** The entity this row belongs to, once rows are grouped. */
  entityKey?: string;
  saveError?: string;
}

export type EntityAction = 'create' | 'update-existing' | 'merge-into';

export interface ClientImportEntity {
  key: string;
  company: string;
  action: EntityAction;
  /** Set for update-existing / merge-into. */
  existingId?: string;
  existingCompany?: string;
  /** Which match key proved it was the same client. */
  matchedOn?: 'contact' | 'gst' | 'merge-with';
  contacts: ClientContact[];
  gsts: ClientGst[];
  segment?: Segment;
  clientType?: ClientEntityType;
  remarks?: string;
  lines: number[];
  /** The record to write. Absent only when every row for it was rejected. */
  client?: ClientEntity;
  saveError?: string;
}

export interface ClientImportResult {
  rows: ClientParsedRow[];
  entities: ClientImportEntity[];
  skipped: number;
  /**
   * Company names in the sheet that look like an existing client but share no
   * contact number or GST with it. Reported, never merged. PRD §4's merge
   * screen is where a human decides.
   */
  possibleDuplicates: { company: string; existingCompany: string; existingId: string }[];
}

// ── Field coercion ────────────────────────────────────────────────────────────

export function matchSegment(raw: string): Segment | null {
  const n = normalize(raw).replace(/^segment\s*/, '');
  if (!n) return null;
  return (SEGMENTS as readonly string[]).includes(n) ? (n as Segment) : null;
}

/**
 * Client type, exact on the PRD's list after case/spacing normalisation, plus
 * the handful of spellings the other two B2B modules use for the same thing.
 * Anything else is rejected rather than defaulted — a client silently typed as
 * `Other` is a client nobody can find again.
 */
const CLIENT_TYPE_ALIASES: Record<string, ClientEntityType> = {
  'architect': 'Architect',
  'interior designer': 'Interior Designer',
  'interior design': 'Interior Designer',
  'designer': 'Interior Designer',
  'contractor': 'Contractor',
  'builder': 'Builder',
  'end consumer': 'End Consumer',
  'home owner': 'End Consumer',
  'homeowner': 'End Consumer',
  'other': 'Other',
  'others': 'Other',
};

export function matchClientType(raw: string): ClientEntityType | null {
  const n = normalize(raw);
  if (!n) return null;
  const exact = CLIENT_ENTITY_TYPES.find((t) => normalize(t) === n);
  if (exact) return exact;
  return CLIENT_TYPE_ALIASES[n] ?? null;
}

/** Header detection for the §7 sheet, falling back to the shared heuristic. */
export function isClientHeaderRow(row: string[]): boolean {
  const first = normalize(row[0] || '');
  if (first === 'company name' || first === 'company' || first === 'client name') return true;
  const cells = row.slice(0, CLIENT_UPLOAD_COLUMNS.length).map(normalize);
  const expected = CLIENT_UPLOAD_COLUMNS.map((c) => normalize(c));
  const hits = cells.filter((c) => c && expected.some((e) => e.startsWith(c) || c.startsWith(e))).length;
  return hits >= 3 || isKamHeaderRow(row);
}

// ── Validation ────────────────────────────────────────────────────────────────

export function validateClientRows(
  rows: string[][],
  existing: ClientEntity[] = [],
): ClientImportResult {
  const out: ClientParsedRow[] = [];
  let skipped = 0;
  const stamp = Date.now();

  // Existing clients, indexed by every key that means identity.
  const byPhone = new Map<string, ClientEntity>();
  const byGst = new Map<string, ClientEntity>();
  const byExactName = new Map<string, ClientEntity>();
  const byLooseName = new Map<string, ClientEntity>();
  for (const c of existing) {
    for (const p of contactNumbers(c.contacts)) if (!byPhone.has(p)) byPhone.set(p, c);
    for (const g of gstNumbers(c.gsts)) if (!byGst.has(g)) byGst.set(g, c);
    const exact = normalize(c.company);
    if (exact && !byExactName.has(exact)) byExactName.set(exact, c);
    const loose = normalizeCompanyName(c.company);
    if (loose && !byLooseName.has(loose)) byLooseName.set(loose, c);
  }

  // ── Pass 1: one ClientParsedRow per sheet row ──
  interface Draft {
    key: string;
    company: string;
    mergeWith: string;
    contacts: ClientContact[];
    gsts: ClientGst[];
    segment?: Segment;
    clientType?: ClientEntityType;
    remarks: string[];
    lines: number[];
  }
  const drafts = new Map<string, Draft>();
  const seenPairing = new Map<string, number>();

  rows.forEach((raw, idx) => {
    const line = idx + 1;
    const cells = raw.map(cleanCell);
    if (!cells.some((c) => c)) { skipped++; return; }
    if (isClientHeaderRow(cells)) { skipped++; return; }

    const issues: RowIssue[] = [];
    const company = cells[0] || '';
    if (!company) issues.push({ column: 'Company Name', message: 'required — row skipped', severity: 'error' });

    const { phone, error: phoneError } = parsePhone(cells[1] || '');
    if (!cells[1]) issues.push({ column: 'Contact Number', message: 'required — it is the only thing that links orders to this client', severity: 'error' });
    else if (phoneError) issues.push({ column: 'Contact Number', message: phoneError, severity: 'error' });

    const contactName = cells[2] || '';
    if (!contactName) issues.push({ column: 'Contact Name', message: 'required by the template', severity: 'error' });

    const contactLabel = cells[3] || '';

    const gstRaw = cells[4] || '';
    const gstCheck = validateGst(gstRaw);
    if (gstRaw && !gstCheck.storable) {
      issues.push({ column: 'GST Number', message: gstCheck.message || 'not a valid GSTIN', severity: 'error' });
    } else if (gstRaw && gstCheck.check === 'bad-checksum') {
      issues.push({ column: 'GST Number', message: gstCheck.message || 'check digit disagrees', severity: 'warn' });
    }

    const segmentRaw = cells[5] || '';
    const segment = matchSegment(segmentRaw);
    if (!segmentRaw) issues.push({ column: 'Segment', message: 'required — 1, 2 or 3', severity: 'error' });
    else if (!segment) issues.push({ column: 'Segment', message: `"${segmentRaw}" is not 1, 2 or 3`, severity: 'error' });

    const typeRaw = cells[6] || '';
    const clientType = matchClientType(typeRaw);
    if (!typeRaw) issues.push({ column: 'Client Type', message: `required — one of ${CLIENT_ENTITY_TYPES.join(' / ')}`, severity: 'error' });
    else if (!clientType) issues.push({ column: 'Client Type', message: `"${typeRaw}" is not one of ${CLIENT_ENTITY_TYPES.join(' / ')}`, severity: 'error' });

    const mergeWith = cells[7] || '';
    if (mergeWith && !byExactName.has(normalize(mergeWith))) {
      // An exact name is what the column asks for. A near-miss is refused
      // rather than resolved, because "merge this client into that one" is the
      // single most destructive instruction the sheet can carry.
      issues.push({
        column: 'Merge With (Existing Company Name)',
        message: `no existing client is named exactly "${mergeWith}" — fix the spelling or leave it blank`,
        severity: 'error',
      });
    }

    const remarks = cells[8] || '';

    if (cells.length > CLIENT_UPLOAD_COLUMNS.length) {
      issues.push({ column: '—', message: `${cells.length - CLIENT_UPLOAD_COLUMNS.length} extra column(s) ignored`, severity: 'warn' });
    }

    // The same number/GST pairing twice in one file is a mistake worth naming;
    // the second row is dropped rather than added twice to the entity.
    const pairing = `${normalize(company)}|${phone}|${gstCheck.normalized}`;
    const dup = seenPairing.get(pairing);
    if (dup && phone) {
      issues.push({ column: 'Contact Number', message: `duplicate of row ${dup} in this file`, severity: 'error' });
    } else if (phone) {
      seenPairing.set(pairing, line);
    }

    const hasError = issues.some((i) => i.severity === 'error');
    if (hasError) {
      out.push({ line, company, phone, gst: gstCheck.normalized, severity: 'error', issues });
      return;
    }

    // "One row = one contact number/GST pairing for a client. A client with two
    // phone numbers and one GST is entered as two rows sharing the same Company
    // Name (and, where applicable, the same Merge With value)."
    const key = `${normalize(mergeWith) || normalize(company)}`;
    const draft = drafts.get(key) || {
      key, company, mergeWith,
      contacts: [], gsts: [], remarks: [], lines: [],
      segment: segment || undefined, clientType: clientType || undefined,
    };
    if (!draft.contacts.some((c) => c.number === phone)) {
      draft.contacts.push({
        number: phone,
        name: contactName || undefined,
        label: contactLabel || undefined,
        // The first row for an entity names its primary contact — §2's
        // "the one orders are mainly placed on". Nothing derives it from order
        // counts; that would make the list row's phone jump about as tickets land.
        primary: draft.contacts.length === 0,
      });
    }
    if (gstCheck.normalized && !draft.gsts.some((g) => g.number === gstCheck.normalized)) {
      draft.gsts.push({ number: gstCheck.normalized });
    }
    if (remarks) draft.remarks.push(remarks);
    // A later row disagreeing about segment/type is reported, and the FIRST
    // row's value stands — silently taking the last row's would make the
    // outcome depend on sheet order.
    if (segment && draft.segment && segment !== draft.segment) {
      issues.push({ column: 'Segment', message: `row ${draft.lines[0]} set Segment ${draft.segment} for "${draft.company}" — keeping that`, severity: 'warn' });
    }
    if (clientType && draft.clientType && clientType !== draft.clientType) {
      issues.push({ column: 'Client Type', message: `row ${draft.lines[0]} set "${draft.clientType}" for "${draft.company}" — keeping that`, severity: 'warn' });
    }
    draft.segment ||= segment || undefined;
    draft.clientType ||= clientType || undefined;
    draft.lines.push(line);
    drafts.set(key, draft);

    out.push({
      line, company, phone, gst: gstCheck.normalized,
      severity: issues.length ? 'warn' : 'ok',
      issues,
      entityKey: key,
    });
  });

  // ── Pass 2: drafts → entities, resolved against the existing master ──
  const entities: ClientImportEntity[] = [];
  const possibleDuplicates: ClientImportResult['possibleDuplicates'] = [];
  const claimedExisting = new Map<string, string>();

  for (const draft of drafts.values()) {
    let action: EntityAction = 'create';
    let hit: ClientEntity | undefined;
    let matchedOn: ClientImportEntity['matchedOn'];

    if (draft.mergeWith) {
      hit = byExactName.get(normalize(draft.mergeWith));
      action = 'merge-into';
      matchedOn = 'merge-with';
    }
    if (!hit) {
      for (const c of draft.contacts) {
        const found = byPhone.get(c.number);
        if (found) { hit = found; action = 'update-existing'; matchedOn = 'contact'; break; }
      }
    }
    if (!hit) {
      for (const g of draft.gsts) {
        const found = byGst.get(g.number);
        if (found) { hit = found; action = 'update-existing'; matchedOn = 'gst'; break; }
      }
    }
    if (!hit) {
      // Exact same canonical name is identity enough to update; a merely
      // SIMILAR name is not, and is reported instead.
      const exact = byExactName.get(normalize(draft.company));
      if (exact) { hit = exact; action = 'update-existing'; matchedOn = 'contact'; }
      else {
        const loose = byLooseName.get(normalizeCompanyName(draft.company));
        if (loose) possibleDuplicates.push({ company: draft.company, existingCompany: loose.company, existingId: loose.id });
      }
    }

    const entity: ClientImportEntity = {
      key: draft.key,
      company: draft.company,
      action: hit ? action : 'create',
      existingId: hit?.id,
      existingCompany: hit?.company,
      matchedOn: hit ? matchedOn : undefined,
      contacts: draft.contacts,
      gsts: draft.gsts,
      segment: draft.segment,
      clientType: draft.clientType,
      remarks: draft.remarks.join(' · ') || undefined,
      lines: draft.lines,
    };

    // Two sheet entities reaching the same existing client would each upsert
    // the same id and the second would overwrite the first, so the later one is
    // refused rather than allowed to clobber.
    if (hit) {
      const claimedBy = claimedExisting.get(hit.id);
      if (claimedBy) {
        entity.saveError = `"${claimedBy}" in this sheet already updates existing client "${hit.company}" — split or combine these rows`;
        entities.push(entity);
        continue;
      }
      claimedExisting.set(hit.id, draft.company);
    }

    entity.client = buildClient(entity, hit, stamp);
    entities.push(entity);
  }

  entities.sort((a, b) => a.company.localeCompare(b.company));
  return { rows: out, entities, skipped, possibleDuplicates };
}

/**
 * The record to write. For an update or a merge this is the EXISTING client with
 * the sheet's contacts and GSTs added — never a replacement, so an upload can
 * add a second phone number to an account without erasing its interaction log,
 * its KAM, or the contacts already on it.
 */
function buildClient(
  entity: ClientImportEntity,
  existing: ClientEntity | undefined,
  stamp: number,
): ClientEntity {
  const now = new Date().toISOString();
  if (!existing) {
    return {
      id: `CLI-${stamp}-${entity.contacts[0]?.number || entity.key.slice(0, 8)}`,
      company: entity.company,
      contacts: entity.contacts,
      gsts: entity.gsts,
      segment: entity.segment,
      clientType: entity.clientType,
      source: 'Existing',
      remarks: entity.remarks,
      interactions: [],
      escalations: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  const contacts = [...(existing.contacts || [])];
  for (const c of entity.contacts) {
    const at = contacts.findIndex((x) => normalizeGstFree(x.number) === normalizeGstFree(c.number));
    if (at < 0) contacts.push({ ...c, primary: false });
    else {
      // Fill blanks on the record we already hold; never overwrite a name or
      // label somebody curated with whatever a bulk sheet happened to carry.
      contacts[at] = {
        ...contacts[at],
        name: contacts[at].name || c.name,
        label: contacts[at].label || c.label,
      };
    }
  }
  if (!contacts.some((c) => c.primary) && contacts.length) contacts[0].primary = true;

  const gsts = [...(existing.gsts || [])];
  for (const g of entity.gsts) {
    if (!gsts.some((x) => normalizeGst(x.number) === g.number)) gsts.push(g);
  }

  return {
    ...existing,
    company: entity.action === 'merge-into' ? existing.company : (existing.company || entity.company),
    contacts,
    gsts,
    segment: existing.segment || entity.segment,
    clientType: existing.clientType || entity.clientType,
    remarks: [existing.remarks, entity.remarks].filter(Boolean).join(' · ') || undefined,
    updatedAt: now,
  };
}

const normalizeGstFree = (v: string | undefined) => String(v || '').replace(/\D/g, '').slice(-10);

// ── Summary + log ─────────────────────────────────────────────────────────────

export interface ClientImportSummary {
  rowsOk: number;
  rowsWarned: number;
  rowsRejected: number;
  skipped: number;
  entitiesCreate: number;
  entitiesUpdate: number;
  entitiesMerge: number;
  entitiesFailed: number;
  possibleDuplicates: number;
}

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

export const CLIENT_IMPORT_LOG_HEADERS = ['Row', 'Company', 'Result', 'Column', 'Message'];

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

// ── The template workbook (PRD §7) ────────────────────────────────────────────
//
// "A companion file, Client_Database_Upload_Template.xlsx, defines the exact
// format for bulk upload. It contains: an Instructions sheet…, a Template sheet
// with the exact header row plus one filled example row, [and] dropdown
// validation on Segment and Client Type so only accepted values can be entered."
//
// The first two are generated exactly as specified. **The dropdowns are not**,
// and cannot be: SheetJS 0.18 (the `xlsx` package this repo depends on) does not
// write data validations at all — `dataValidations` is a bare comment in its
// sheet writer. So the accepted values ship as a Lists sheet the user can point
// Excel's own Data Validation at, the Instructions sheet says so, and — the part
// that actually matters — `validateClientRows` above REJECTS a Segment or Client
// Type outside the list on import. The dropdown was a means of keeping bad
// values out; that end is met, at the door instead of at the keyboard.

export interface TemplateSheet {
  name: string;
  rows: (string | number)[][];
  colWidths?: number[];
}

export const TEMPLATE_EXAMPLE_ROWS: string[][] = [
  ['Metro Constructions', '9900099013', 'Rahul Nair', 'Owner', '27AAPFU0939F1ZV', '1', 'Contractor', '', 'Repeat client, orders monthly'],
  ['Metro Constructions', '9900099014', 'Priya Shah', 'Accounts', '', '1', 'Contractor', '', 'Second number on the same client'],
];

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
