import { CLIENT_ENTITY_TYPES, ClientContact, ClientEntity, ClientEntityType, ClientGst, Segment, contactNumbers, gstNumbers, normalizeCompanyName, normalizeGst, validateGst } from '../../models/client';
import { RowIssue, cleanCell, normalize, parsePhone } from '../kam-import';
import { CLIENT_UPLOAD_COLUMNS } from './constants';
import { ClientImportEntity, ClientImportResult, ClientParsedRow, EntityAction } from './types';
import { isClientHeaderRow, matchClientType, matchSegment, normalizeGstFree } from './utils';
export function validateClientRows(
  rows: string[][],
  existing: ClientEntity[] = [],
): ClientImportResult {
  const out: ClientParsedRow[] = [];
  let skipped = 0;
  const stamp = Date.now();

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

        primary: draft.contacts.length === 0,
      });
    }
    if (gstCheck.normalized && !draft.gsts.some((g) => g.number === gstCheck.normalized)) {
      draft.gsts.push({ number: gstCheck.normalized });
    }
    if (remarks) draft.remarks.push(remarks);

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
