import { b2bBackendFetch } from '@/lib/server/b2b-backend';
import { kylas } from '@/lib/server/b2b-team/kylas';
import { B2B_INBOUND_OWNERS } from '@/lib/api/b2b/inbound/constants';
import { b2bInboundRule, mapInboundLead } from '@/lib/api/b2b/inbound/mappers';
import { B2B_FRESH_START, type B2BLeadRow } from '@/lib/b2b/data/rows';
import { inboundToRow } from '@/lib/b2b/mappers/inbound';
import type { TeamMember } from '@/lib/b2b/team/types';
import { teamMembers } from '@/lib/b2b/team/utils';
import { readInboundRows } from './rows';

const PAGE = 500;
const MAX_PAGES = 6;

export interface ImportOutcome {
  imported: number;
  checked: number;
}

export function inboundOwnerNames(members: TeamMember[]): Map<number, string> {
  const names = new Map(Object.entries(B2B_INBOUND_OWNERS).map(([id, name]) => [Number(id), name]));
  for (const m of teamMembers(members, 'inbound')) if (m.kylasUserId) names.set(m.kylasUserId, m.name);
  return names;
}

export function inboundRowFromKylas(raw: Record<string, any>, names: Map<number, string>): B2BLeadRow {
  const lead = mapInboundLead(raw);
  return inboundToRow({ ...lead, owner: (lead.ownerId != null && names.get(lead.ownerId)) || lead.owner });
}

export async function importInbound(members: TeamMember[], full: boolean): Promise<ImportOutcome> {
  const names = inboundOwnerNames(members);
  const known = new Set((await readInboundRows()).keys());
  const after = new Date(`${B2B_FRESH_START}T00:00:00+05:30`).toISOString();
  const rule = JSON.stringify(b2bInboundRule([...names.keys()], '', after));

  const fresh: B2BLeadRow[] = [];
  let checked = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    const body = await kylas(`/search/lead?sort=updatedAt,desc&page=${page}&size=${PAGE}`, { method: 'POST', body: rule });
    const content: Record<string, any>[] = Array.isArray(body.content) ? body.content : [];
    checked += content.length;
    const unseen = content.filter((raw) => !known.has(String(raw.id)));
    for (const raw of unseen) {
      known.add(String(raw.id));
      fresh.push(inboundRowFromKylas(raw, names));
    }
    if (page + 1 >= Number(body.totalPages ?? 0)) break;
    if (!full && !unseen.length) break;
  }

  for (let i = 0; i < fresh.length; i += PAGE) {
    await b2bBackendFetch('/rows/bulk', { method: 'POST', body: { rows: fresh.slice(i, i + PAGE), only_new: true } });
  }
  return { imported: fresh.length, checked };
}
