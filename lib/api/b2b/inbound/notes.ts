import { kylasFetch } from '../../core/kylas-client';
import { formatKylasTs, pickName, stripHtml } from './utils';
export async function fetchLeadNotes(
  leadId: string | number,
  ownerId?: number,
): Promise<import('../../../../components/b2b/models/mock-data').LeadNote[]> {
  const params = new URLSearchParams({
    targetEntityId: String(leadId),
    targetEntityType: 'LEAD',
    sort: 'createdAt,desc',
    page: '0',
    size: '10',
  });
  if (ownerId) params.set('targetEntityOwnerId', String(ownerId));
  try {
    const data = await kylasFetch(`/notes/relation?${params.toString()}`);
    const items = data?.content || (Array.isArray(data) ? data : []);
    return items
      .map((n: Record<string, any>) => ({
        ts: formatKylasTs(n.createdAt),
        author: n.createdBy?.name || n.updatedBy?.name || 'Kylas',
        text: stripHtml(n.description ?? n.note ?? n.body ?? ''),
      }))
      .filter((n: import('../../../../components/b2b/models/mock-data').LeadNote) => n.text);
  } catch {
    return [];
  }
}

export async function fetchLeadCallLogs(
  leadId: string | number,
): Promise<import('../../../../components/b2b/models/mock-data').CallLogEntry[]> {
  const body = {
    jsonRule: {
      rules: [{
        id: 'related_to', field: 'related_to', type: 'related_lookup',
        value: { entity: 'lead', id: String(leadId) }, operator: 'equal',
      }],
      condition: 'AND',
    },
  };
  try {
    const data = await kylasFetch('/call-logs/search?page=1&size=10&sort=createdAt,desc', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const items = data?.content || (Array.isArray(data) ? data : []);
    return items.map((c: Record<string, any>) => ({
      id: String(c.id),
      ts: formatKylasTs(c.createdAt ?? c.calledAt ?? c.startTime),
      direction: pickName(c.callType ?? c.type ?? c.direction) || 'Call',
      status: pickName(c.status ?? c.callStatus ?? c.outcome) || '—',
      durationSec: typeof c.duration === 'number' ? c.duration : undefined,
      by: c.createdBy?.name || c.owner?.name || c.calledBy?.name || '',
      note: stripHtml(c.notes ?? c.description ?? c.remark ?? ''),
    }));
  } catch {
    return [];
  }
}

export async function fetchCallLogSummary(callLogId: string | number): Promise<string> {
  const data = await kylasFetch(`/call-logs/${callLogId}?relatedToType=lead`);
  return stripHtml(data?.callSummary ?? data?.summary ?? data?.aiSummary ?? data?.transcriptSummary ?? '');
}
