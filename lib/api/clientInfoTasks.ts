import { mdFetch } from './client';

export interface ClientInfoTask {
  id: number;
  client: { id: number; name: string; contact: string } | null;
  followup_date: string | null;
  status: string;
  created_at: string;
  modified_at: string;
}

export interface ClientInfoProperty {
  id: number;
  name: string;
  options: string[] | null;
  required: boolean;
  value: string | null;
}

export interface ClientInfoTaskDetail extends ClientInfoTask {
  properties: ClientInfoProperty[];
}

export interface SaveAnswersResponse {
  ticket_id: number;
  saved_property_ids: number[];
}

const bmHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function fetchClientInfoTasks(token: string): Promise<ClientInfoTask[]> {
  return mdFetch("/order/bm/client-info-tasks/", { headers: bmHeaders(token) });
}

export async function fetchPendingFollowupTasks(token: string): Promise<ClientInfoTask[]> {
  return mdFetch("/order/bm/client-info-tasks/pending-followup/", { headers: bmHeaders(token) });
}

export async function fetchClientInfoTaskDetail(token: string, ticketId: number): Promise<ClientInfoTaskDetail> {
  return mdFetch(`/order/bm/client-info-tasks/${ticketId}/`, { headers: bmHeaders(token) });
}

export async function saveClientInfoAnswers(
  token: string,
  ticketId: number,
  answers: { property_id: number; value: string }[],
): Promise<SaveAnswersResponse> {
  return mdFetch(`/order/bm/client-info-tasks/${ticketId}/answers/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...bmHeaders(token) },
    body: JSON.stringify({ answers }),
  });
}

