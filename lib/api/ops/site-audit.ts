import { mdFetch } from '../core/client';

export async function fetchSiteAuditECs(leadIds: string[]): Promise<Record<string, string>> {
  if (!leadIds.length) return {};
  const data = await mdFetch('/site-audit-ec-branches/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lead_ids: leadIds }),
  });
  return (data && data.results) || {};
}
