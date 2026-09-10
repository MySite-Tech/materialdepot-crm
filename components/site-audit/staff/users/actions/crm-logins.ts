'use client';

import { ProfileRow } from '../types';
import { createCrmLoginFor } from '../../staff-directory';
import { Dispatch, SetStateAction } from 'react';

export function makeCrmLoginActions({ flash, load, noCrmList, setBackfilling }: {
  flash: (m: string) => void;
  load: () => Promise<void>;
  noCrmList: ProfileRow[];
  setBackfilling: Dispatch<SetStateAction<boolean>>;
}) {
async function backfillCrmLogins() {
  if (!noCrmList.length) return;
  setBackfilling(true);
  let ok = 0;
  const failed: string[] = [];
  for (const p of noCrmList) {
    try {
      await createCrmLoginFor(p);
      ok++;
    } catch (e: any) {
      failed.push(p.name + ' (' + (e?.message || 'backend error') + ')');
    }
  }
  await load();
  setBackfilling(false);
  if (failed.length) {
    console.error('[siteAudit] CRM login backfill failures', failed);
    flash('✓ Created ' + ok + ' of ' + noCrmList.length + ' — failed: ' + failed.slice(0, 2).join(', ') + (failed.length > 2 ? ' and ' + (failed.length - 2) + ' more (see console)' : ''));
  } else {
    flash('✓ Created ' + ok + ' CRM login' + (ok === 1 ? '' : 's') + ' — they can sign in with their phone number now');
  }
}

async function createOneCrmLogin(u: ProfileRow) {
  try {
    await createCrmLoginFor(u);
    await load();
    flash('✓ ' + u.name + ' can sign into the CRM with ' + u.contact + ' now');
  } catch (e: any) {
    flash('⚠ ' + (e?.message || 'Could not create their CRM login'));
  }
}


  return { backfillCrmLogins, createOneCrmLogin };
}
