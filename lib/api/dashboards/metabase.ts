import { mdFetch } from '../core/client';

export interface MetabaseEmbedToken { token: string; instanceUrl: string }

export async function fetchMetabaseEmbedToken(questionId: number): Promise<MetabaseEmbedToken> {
  const data = await mdFetch(`/crm/metabase-embed-token/?question=${questionId}`);
  return { token: data.token, instanceUrl: data.instance_url };
}
