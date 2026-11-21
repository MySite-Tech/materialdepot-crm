import { useCallback, useEffect, useState } from 'react';
import { sbGetPaged } from '../../../shared';
import { NPS_FETCH_PAGE, NPS_QUERY } from '../../constants';
import type { NpsKind, NpsRow } from '../../types';
import { auditJobs, groupByEnq, installJobs } from '../utils';

export function useNpsRows(kind: NpsKind) {
  const [rows, setRows] = useState<NpsRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setFailed(false);
    sbGetPaged(NPS_QUERY[kind], NPS_FETCH_PAGE).then((raw) => {
      if (!live) return;
      if (!Array.isArray(raw)) { setFailed(true); return; }
      setRows(groupByEnq(kind === 'audit' ? auditJobs(raw) : installJobs(raw)));
    });
    return () => { live = false; };
  }, [kind, nonce]);

  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { rows, failed, retry };
}
