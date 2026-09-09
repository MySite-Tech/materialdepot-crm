'use client';

import { loginWithPhone } from '../../lib/api/auth';
import { AppUser } from '../../types/crm';
import { Dispatch, SetStateAction, useEffect } from 'react';

export function useRestoreSession({ setCurrentUser, setPermsLoaded, setUserLoaded }: {
  setCurrentUser: Dispatch<SetStateAction<AppUser | null>>;
  setPermsLoaded: Dispatch<SetStateAction<boolean>>;
  setUserLoaded: Dispatch<SetStateAction<boolean>>;
}) {
useEffect(() => {
  try {
    const stored = localStorage.getItem('materialdepot_user');
    if (stored) {
      const parsed = JSON.parse(stored);
      setCurrentUser({ ...parsed, allowedBranches: parsed.allowedBranches || [], individualPermissions: undefined });
      if (parsed?.phone) {
        loginWithPhone(String(parsed.phone))
          .then((fresh) => {
            if (fresh) {
              const merged: AppUser = {
                ...fresh,
                allowedBranches: fresh.allowedBranches || [],
                individualPermissions: fresh.individualPermissions || [],
              };
              setCurrentUser(merged);
              localStorage.setItem('materialdepot_user', JSON.stringify(merged));
            }
          })
          .catch(() => {/* keep cached identity on transient failure */})
          .finally(() => setPermsLoaded(true));
      } else {
        setPermsLoaded(true);
      }
    } else {
      setPermsLoaded(true);
    }
  } catch { setPermsLoaded(true); }
  setUserLoaded(true);
}, []);

  return {  };
}
