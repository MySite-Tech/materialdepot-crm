import { b2bBackendPost } from '../data/backend';

export const fetchStudioSignInUrl = (): Promise<string> =>
  b2bBackendPost<{ url: string }>('/studio-handoff', {}).then((b) => b.url);
