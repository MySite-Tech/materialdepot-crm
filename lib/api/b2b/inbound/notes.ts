import { KYLAS_API_KEY, KYLAS_API_URL, kylasFetch } from '../../core/kylas-client';
import { CallOutcome } from './types';
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

export async function createLeadNote(
  leadId: string | number,
  text: string,
): Promise<boolean> {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const body = {
    sourceEntity: { description: `<div>${escaped}</div>`, mentions: null },
    targetEntityId: String(leadId),
    targetEntityType: 'LEAD',
  };
  try {
    await kylasFetch('/notes/relation', { method: 'POST', body: JSON.stringify(body) });
    return true;
  } catch {
    return false;
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

export async function createInboundCallLog(params: {
  leadId: string | number;
  leadName: string;
  phoneId: string | number;
  outcome: CallOutcome;
  callType?: 'outgoing' | 'incoming';
  callSummary?: string;
  durationMinutes?: number;
  startTime?: string;
}): Promise<boolean> {
  const { leadId, leadName, phoneId, outcome, callType = 'outgoing', callSummary = '', durationMinutes, startTime } = params;
  const fd = new FormData();
  fd.append('isManual', 'true');
  fd.append('outcome', outcome);
  fd.append('startTime', startTime || new Date().toISOString());
  fd.append('phoneId', String(phoneId));
  fd.append('callType', callType);
  if (outcome === 'connected' && durationMinutes != null) {
    fd.append('duration', String(durationMinutes));
    fd.append('durationType', 'minutes');
  }
  fd.append('callSummary', callSummary);
  fd.append('notes', '[]');
  fd.append('relatedTo[id]', String(leadId));
  fd.append('relatedTo[name]', leadName);
  fd.append('relatedTo[entity]', 'lead');
  fd.append('relatedTo[phoneId]', String(phoneId));
  try {
    const res = await fetch(`${KYLAS_API_URL}/call-logs/`, {
      method: 'POST',
      headers: { 'api-key': KYLAS_API_KEY },
      body: fd,
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return true;
  } catch {
    return false;
  }
}
