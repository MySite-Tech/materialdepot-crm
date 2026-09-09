import { H, SB_URL, sbPatch } from './sbClient';
import { rosterSelect } from './availability';

export type StaffExit = { deletedAt: string | null; deletedBy: string | null; exitReason: string | null };
export const EXIT_COLS = 'deleted_at,deleted_by,exit_reason';

export const EXIT_REASONS = [
  'Resigned',
  'Terminated',
  'Contract ended',
  'Absconded',
  'Moved to another role',
  'Other',
] as const;

let exitReady: boolean | null = null;

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

        if (body.includes('42703')) exitReady = false;
        else console.error('[siteAudit] exit-column probe failed', r.status, body.slice(0, 200));
      }
    } catch (e) {
      console.error('[siteAudit] exit-column probe failed', e);
    }
  }
  return exitReady === true;
}

export async function exitSelect(cols: string): Promise<string> {
  return (await probeExitColumns()) ? cols + ',' + EXIT_COLS : cols;
}

export async function activeStaffFilter(): Promise<string> {
  return (await probeExitColumns()) ? '&deleted_at=is.null' : '';
}

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

export class ExitColumnsMissing extends Error {
  constructor() {
    super('Staff exit needs site-audit-migration-004-staff-exit.sql to be run against the Site Audit Supabase project first. Nobody has been removed.');
    this.name = 'ExitColumnsMissing';
  }
}

export async function retireProfile(id: string, opts: { by?: string | null; reason?: string | null } = {}): Promise<void> {
  if (!(await probeExitColumns())) throw new ExitColumnsMissing();
  await sbPatch('profiles', id, {
    deleted_at: new Date().toISOString(),
    deleted_by: opts.by || null,
    exit_reason: opts.reason || null,
  });
}

export async function restoreProfile(id: string): Promise<void> {
  if (!(await probeExitColumns())) throw new ExitColumnsMissing();
  await sbPatch('profiles', id, { deleted_at: null, deleted_by: null, exit_reason: null });
}

export function exitColumnsKnown(): boolean | null { return exitReady; }
export async function exitColumnsAvailable(): Promise<boolean> { return probeExitColumns(); }
