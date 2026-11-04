import { b2bBackendGet } from '../data/backend';

export async function fetchKamLoad(): Promise<Record<string, number>> {
  try {
    return await b2bBackendGet<Record<string, number>>('/kam-load');
  } catch (e) {
    console.error('[b2b] kam load fetch failed', e);
    return {};
  }
}
