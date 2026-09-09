import { H, SB_URL, sbPatch } from './sbClient';
import { rosterSelect } from './availability';

/* Staff exit / attrition (profiles.deleted_at). Removal used to be a hard
   DELETE, so attrition was unmeasurable and — being irreversible — avoided,
   which is why rosters kept people who had left months earlier. A retired
   person is invisible to every roster, picker and capacity count, and the row
   survives as the attrition record. `deleted_at is null` is the ONLY predicate
   any read uses. See site-audit-migration-004-staff-exit.sql. */
export type StaffExit = { deletedAt: string | null; deletedBy: string | null; exitReason: string | null };
export const EXIT_COLS = 'deleted_at,deleted_by,exit_reason';

/* Free text in the DB (a new reason needs no migration), fixed list in the UI
   so the breakdown can't fragment into fourteen spellings of "resigned". */
export const EXIT_REASONS = [
  'Resigned',
  'Terminated',
  'Contract ended',
  'Absconded',
  'Moved to another role',
  'Other',
] as const;

/* Probe-gated, like `rosterSelect`: PostgREST fails the WHOLE select with
   42703 on a missing column, so naming `deleted_at` before migration 004 would
   empty every roster in both field apps and the kiosk. An unknown answer (a
   network blip) resolves to "absent" — pre-migration behaviour — never to
   "present", which would turn a dropped request into an empty roster. */
let exitReady: boolean | null = null;
/* Shared in-flight promise: ~8 callers mount together, and without it one page
   load fired eight identical probes before any latched. */
let exitProbe: Promise<boolean> | null = null;
async function probeExitColumns(): Promise<boolean> {
  if (exitReady !== null) return exitReady;
  if (!exitProbe) exitProbe = runExitProbe().finally(() => { exitProbe = null; });
  return exitProbe;
}
async function runExitProbe(): Promise<boolean> {
  if (exitReady === null) {
    try {
      const r = await fetch(SB_URL + '/rest/v1/profiles?select=' + EXIT_COLS + '&limit=1', { headers: H });
      if (r.ok) exitReady = true;
      else {
        const body = await r.text().catch(() => '');
        // Only a missing column is a durable "no"; anything else is transient
        // and must not be latched.
        if (body.includes('42703')) exitReady = false;
        else console.error('[siteAudit] exit-column probe failed', r.status, body.slice(0, 200));
      }
    } catch (e) {
      console.error('[siteAudit] exit-column probe failed', e);
    }
  }
  return exitReady === true;
}

/* 'id,name,city' -> 'id,name,city,deleted_at,…' once migrated, bare before. */
export async function exitSelect(cols: string): Promise<string> {
  return (await probeExitColumns()) ? cols + ',' + EXIT_COLS : cols;
}

/* ALWAYS append this rather than writing `&deleted_at=is.null` inline —
   inline, a pre-migration read 42703s and renders as an empty roster. */
export async function activeStaffFilter(): Promise<string> {
  return (await probeExitColumns()) ? '&deleted_at=is.null' : '';
}

/* Both sides at once, so a caller needs one await instead of two. */
export async function rosterQuery(cols: string): Promise<{ select: string; filter: string }> {
  const [caps, filter] = await Promise.all([rosterSelect(cols), activeStaffFilter()]);
  return { select: await exitSelect(caps), filter };
}

export function mapExit(r: any): StaffExit {
  return {
    deletedAt: r?.deleted_at || null,
    deletedBy: r?.deleted_by || null,
    exitReason: r?.exit_reason || null,
  };
}
export const hasLeft = (r: { deletedAt?: string | null } | null | undefined) => !!r?.deletedAt;

/* Thrown rather than falling back to `sbDel`. A hard delete is not a degraded
   soft delete — it destroys the record being asked for — so a missing column
   refuses and names the migration. */
export class ExitColumnsMissing extends Error {
  constructor() {
    super('Staff exit needs site-audit-migration-004-staff-exit.sql to be run against the Site Audit Supabase project first. Nobody has been removed.');
    this.name = 'ExitColumnsMissing';
  }
}

/* `by` is the remover's email, so an accidental removal has an owner to ask. */
export async function retireProfile(id: string, opts: { by?: string | null; reason?: string | null } = {}): Promise<void> {
  if (!(await probeExitColumns())) throw new ExitColumnsMissing();
  await sbPatch('profiles', id, {
    deleted_at: new Date().toISOString(),
    deleted_by: opts.by || null,
    exit_reason: opts.reason || null,
  });
}

/* Clears the reason too — a current staff member with an exit reason on file
   reads as a data fault in the attrition breakdown. */
export async function restoreProfile(id: string): Promise<void> {
  if (!(await probeExitColumns())) throw new ExitColumnsMissing();
  await sbPatch('profiles', id, { deleted_at: null, deleted_by: null, exit_reason: null });
}

/* Test seam, and how the UI tells "no former staff" from "can't record one
   yet". Null while the probe hasn't run. */
export function exitColumnsKnown(): boolean | null { return exitReady; }
export async function exitColumnsAvailable(): Promise<boolean> { return probeExitColumns(); }
