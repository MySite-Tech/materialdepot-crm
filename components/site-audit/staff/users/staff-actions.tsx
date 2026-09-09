'use client';

import { CITIES } from '../../shared/cityScope';
import { phoneKey } from '../../shared/identity';
import { randomPasscode, syntheticSiteAuditEmail } from '../../shared/roleSync';
import { sbPatch, sbPost } from '../../shared/sbClient';
import { ProfileRow } from '../../types/staff-users';
import { Dispatch, SetStateAction } from 'react';

export function makeStaffActions({ bmMakeList, flash, load, setBmOrders, setEditing, setMakingBms }: {
  bmMakeList: { id: string | number; name: string; phone: string; role: string; allowedBranches?: string[] | undefined; active?: boolean | undefined; }[];
  flash: (m: string) => void;
  load: () => Promise<void>;
  setBmOrders: Dispatch<SetStateAction<{ bm: string | null; }[] | null>>;
  setEditing: Dispatch<SetStateAction<ProfileRow | null>>;
  setMakingBms: Dispatch<SetStateAction<boolean>>;
}) {
async function createMissingBms() {
  if (!bmMakeList.length) return;
  if (!window.confirm(
    'Create ' + bmMakeList.length + ' Site Audit BM account(s)?\n\n'
    + bmMakeList.slice(0, 12).map((u) => u.name + ' · ' + u.phone).join('\n')
    + (bmMakeList.length > 12 ? '\n…and ' + (bmMakeList.length - 12) + ' more' : '')
    + '\n\nThey get a Business Manager dashboard, and orders attributed to them can link from then on.'
  )) return;
  setMakingBms(true);
  let ok = 0;
  const failed: string[] = [];
  for (const u of bmMakeList) {
    try {
      await sbPost('profiles', {
        name: u.name,

        email: syntheticSiteAuditEmail(u.phone),
        role: 'bm',
        contact: phoneKey(u.phone),
        city: (u.allowedBranches || []).some((b) => /hyder|gachi|kompally/i.test(b)) ? 'Hyderabad' : CITIES[0],
        installer_type: 'flooring',
        passcode: randomPasscode(),
      });
      ok++;
    } catch (e: any) {
      failed.push(u.name + ' (' + (e?.message || 'write failed') + ')');
    }
  }
  setMakingBms(false);
  setBmOrders(null);
  await load();
  if (failed.length) {
    console.error('[siteAudit] BM account creation failures', failed);
    flash('✓ Created ' + ok + ' of ' + bmMakeList.length + ' — failed: ' + failed.slice(0, 3).join(', '));
  } else {
    flash('✓ Created ' + ok + ' BM account(s) — press “Link by exact match” to attribute their orders');
  }
}

async function resetPasscode(u: ProfileRow) {
  if (!window.confirm(`Reset ${u.name}'s passcode? They will be asked to create a new one on their next sign-in.`)) return;
  try {
    await sbPatch('profiles', u.id, { passcode: null });
    setEditing(null);
    await load();
    flash(`✓ ${u.name}'s passcode has been reset`);
  } catch (e: any) {
    flash('⚠ ' + (e?.message || 'Could not reset passcode'));
  }
}


  return { createMissingBms, resetPasscode };
}
