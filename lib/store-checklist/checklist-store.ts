import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ChecklistDay, ChecklistMarks } from './types';
import { emptyDay } from './utils';

const TABLE = 'store_checklist';
const MARK_FN = 'store_checklist_mark';

let _admin: SupabaseClient | null = null;

function admin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}

type Row = {
  store_code: string;
  check_date: string;
  items: ChecklistMarks | null;
  updated_at: string | null;
  updated_by: string | null;
};

const toDay = (row: Row): ChecklistDay => ({
  storeCode: row.store_code,
  date: row.check_date,
  items: row.items && typeof row.items === 'object' ? row.items : {},
  updatedAt: row.updated_at,
  updatedBy: row.updated_by,
});

export async function readDays(
  storeCodes: readonly string[],
  from: string,
  to: string,
): Promise<ChecklistDay[]> {
  if (storeCodes.length === 0) return [];
  const { data, error } = await admin()
    .from(TABLE)
    .select('store_code, check_date, items, updated_at, updated_by')
    .in('store_code', [...storeCodes])
    .gte('check_date', from)
    .lte('check_date', to)
    .order('check_date', { ascending: false })
    .order('store_code', { ascending: true });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map(toDay);
}

export async function readDay(storeCode: string, date: string): Promise<ChecklistDay> {
  const days = await readDays([storeCode], date, date);
  return days[0] ?? emptyDay(storeCode, date);
}

export async function markItems(
  storeCode: string,
  date: string,
  marks: ChecklistMarks,
  by: string,
): Promise<ChecklistDay> {
  const { data, error } = await admin().rpc(MARK_FN, {
    p_store: storeCode,
    p_date: date,
    p_marks: marks,
    p_by: by,
  });
  if (error) throw new Error(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as Row | null;
  if (!row) throw new Error(`${MARK_FN} returned no row`);
  return toDay(row);
}
