'use client';
import { useState, useEffect, useMemo } from 'react';
import { fetchMovements, completeMovement, type MovementType } from '../../lib/displayApi';

interface MovementItem {
  id?: number;
  vsm_id?: number;
  change_request_type: string;
  removal_reason: string | null;
  from_location: {
    branch?: string;
    category?: string;
    display_type?: string;
    location_string?: string;
  } | null;
  to_location: {
    branch?: string;
    display_type?: string;
    location_string?: string;
  } | null;
  quantity: number;
  variant: {
    product_name: string;
    sku: string | null;
  };
  status: string;
  created_at: string;
  modified_at: string;
  completed_at: string | null;
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit', hour: 'numeric', minute: '2-digit' });
  } catch { return '—'; }
}

const TYPE_LABELS: Record<string, string> = {
  add_display: 'Add',
  move_display: 'Move',
  remove_display: 'Remove',
};

const TYPE_FILTERS: { key: 'all' | MovementType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'add_display', label: 'Add' },
  { key: 'move_display', label: 'Move' },
  { key: 'remove_display', label: 'Remove' },
];

function getVsmId(item: MovementItem): number | null {
  return item.id ?? item.vsm_id ?? null;
}

async function approveMovement(vsmId: number) {
  await displayApi('movement_in_progress', { vsm_id: vsmId });
  await displayApi('movement_complete', { vsm_id: vsmId });
}

export function MovementStatusView() {
  const [items, setItems] = useState<MovementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
<<<<<<< HEAD
  const [typeFilter, setTypeFilter] = useState<'all' | MovementType>('all');
=======
  const [statusFilter, setStatusFilter] = useState('initiated');
>>>>>>> 1e0855153e64689b821ff275bdae916f12e5d5d2
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const loadMovements = async () => {
    setLoading(true);
    try {
<<<<<<< HEAD
      // Backend returns the movements still awaiting completion (status=initiated).
      const data = await fetchMovements();
=======
      const data = await displayApi('fetch_movements');
      if (data?.status === false) {
        setError(typeof data.data === 'string' ? data.data : 'Backend error');
        return;
      }
>>>>>>> 1e0855153e64689b821ff275bdae916f12e5d5d2
      const list = Array.isArray(data) ? data : (data?.data ?? data?.results ?? []);
      if (!Array.isArray(list)) {
        setError('Unexpected response from server');
        return;
      }
      setItems(list);
      setError(null);
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch movements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMovements(); }, []);

  const filtered = useMemo(() => {
    if (typeFilter === 'all') return items;
    return items.filter(i => i.change_request_type === typeFilter);
  }, [items, typeFilter]);

<<<<<<< HEAD
  const allSelected = filtered.length > 0 && filtered.every(i => {
=======
  const actionableItems = useMemo(() => {
    return filtered.filter(i => (i.status === 'initiated' || i.status === 'in_progress') && getVsmId(i) !== null);
  }, [filtered]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: items.length };
    for (const item of items) {
      counts[item.status] = (counts[item.status] || 0) + 1;
    }
    return counts;
  }, [items]);

  const allSelected = actionableItems.length > 0 && actionableItems.every(i => {
>>>>>>> 1e0855153e64689b821ff275bdae916f12e5d5d2
    const vid = getVsmId(i);
    return vid !== null && selected.has(vid);
  });

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      const next = new Set<number>();
      filtered.forEach(i => { const vid = getVsmId(i); if (vid !== null) next.add(vid); });
      setSelected(next);
    }
  };

  const toggleSelect = (vsmId: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(vsmId)) next.delete(vsmId); else next.add(vsmId);
      return next;
    });
  };

<<<<<<< HEAD
  const removeRow = (vsmId: number) => {
    setItems(prev => prev.filter(i => getVsmId(i) !== vsmId));
    setSelected(prev => { const n = new Set(prev); n.delete(vsmId); return n; });
  };

  const handleComplete = async (vsmId: number) => {
    setActionLoading(prev => ({ ...prev, [`complete-${vsmId}`]: true }));
    try {
      await completeMovement(vsmId);
      removeRow(vsmId);
      setToast({ msg: `Movement #${vsmId} completed`, type: 'success' });
    } catch (e: any) {
      setToast({ msg: e.message || 'Failed to complete', type: 'error' });
    } finally {
      setActionLoading(prev => ({ ...prev, [`complete-${vsmId}`]: false }));
    }
  };

  const handleBulkComplete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(`Complete ${ids.length} movement${ids.length === 1 ? '' : 's'}?`)) return;
=======
  const handleApprove = async (vsmId: number) => {
    setActionLoading(prev => ({ ...prev, [vsmId]: true }));
    try {
      await approveMovement(vsmId);
      setItems(prev => prev.map(i => getVsmId(i) === vsmId ? { ...i, status: 'completed', completed_at: new Date().toISOString() } : i));
      setSelected(prev => { const n = new Set(prev); n.delete(vsmId); return n; });
      setToast({ msg: `Movement #${vsmId} approved`, type: 'success' });
    } catch (e: any) {
      setToast({ msg: e.message || 'Failed to approve', type: 'error' });
    } finally {
      setActionLoading(prev => ({ ...prev, [vsmId]: false }));
    }
  };

  const cancelMovement = async (vsmId: number) => {
    const item = items.find(i => getVsmId(i) === vsmId);
    if (item?.status === 'initiated') {
      await displayApi('movement_in_progress', { vsm_id: vsmId });
      await displayApi('movement_complete', { vsm_id: vsmId });
    } else if (item?.status === 'in_progress') {
      await displayApi('movement_complete', { vsm_id: vsmId });
    }
    await displayApi('revert_movement', { vsm_id: vsmId });
  };

  const handleCancel = async (vsmId: number) => {
    setActionLoading(prev => ({ ...prev, [`cancel-${vsmId}`]: true }));
    try {
      await cancelMovement(vsmId);
      setItems(prev => prev.map(i => getVsmId(i) === vsmId ? { ...i, status: 'cancelled' } : i));
      setSelected(prev => { const n = new Set(prev); n.delete(vsmId); return n; });
      setToast({ msg: `Movement #${vsmId} cancelled`, type: 'success' });
    } catch (e: any) {
      setToast({ msg: e.message || 'Failed to cancel', type: 'error' });
    } finally {
      setActionLoading(prev => ({ ...prev, [`cancel-${vsmId}`]: false }));
    }
  };

  const handleBulkApprove = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
>>>>>>> 1e0855153e64689b821ff275bdae916f12e5d5d2
    setBulkLoading(true);
    let success = 0;
    const failedIds: number[] = [];
    for (const vsmId of ids) {
      try {
<<<<<<< HEAD
        await completeMovement(vsmId);
        removeRow(vsmId);
        success++;
      } catch { failedIds.push(vsmId); }
    }
    setBulkLoading(false);
    const fail = failedIds.length;
    if (fail) console.error('[storeDisplay] complete failed for vsm_ids', failedIds);
    setToast({ msg: `Completed ${success}${fail ? `, ${fail} failed (#${failedIds.slice(0, 5).join(', #')})` : ''}`, type: fail ? 'error' : 'success' });
=======
        await approveMovement(vsmId);
        setItems(prev => prev.map(i => getVsmId(i) === vsmId ? { ...i, status: 'completed', completed_at: new Date().toISOString() } : i));
        success++;
      } catch { failedIds.push(vsmId); }
    }
    setSelected(new Set());
    setBulkLoading(false);
    const fail = failedIds.length;
    setToast({ msg: `Approved ${success}${fail ? `, ${fail} failed` : ''}`, type: fail ? 'error' : 'success' });
  };

  const handleBulkCancel = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkLoading(true);
    let success = 0;
    const failedIds: number[] = [];
    for (const vsmId of ids) {
      try {
        await cancelMovement(vsmId);
        setItems(prev => prev.map(i => getVsmId(i) === vsmId ? { ...i, status: 'cancelled' } : i));
        success++;
      } catch { failedIds.push(vsmId); }
    }
    setSelected(new Set());
    setBulkLoading(false);
    const fail = failedIds.length;
    setToast({ msg: `Cancelled ${success}${fail ? `, ${fail} failed` : ''}`, type: fail ? 'error' : 'success' });
>>>>>>> 1e0855153e64689b821ff275bdae916f12e5d5d2
  };

  return (
    <div className="px-6 py-4">
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[60] px-4 py-2.5 rounded-lg shadow-lg text-[13px] font-medium ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <h2 className="text-[15px] font-bold text-gray-800">Pending Movements</h2>
        <div className="flex gap-1">
<<<<<<< HEAD
          {TYPE_FILTERS.map(t => (
=======
          {['all', 'initiated', 'completed', 'cancelled'].map(s => (
>>>>>>> 1e0855153e64689b821ff275bdae916f12e5d5d2
            <button
              key={t.key}
              onClick={() => setTypeFilter(t.key)}
              className={`px-3 py-1 text-[11px] font-semibold rounded-full cursor-pointer border ${
                typeFilter === t.key
                  ? 'bg-[#EAB308] text-white border-[#EAB308]'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
<<<<<<< HEAD
              {t.label}
=======
              {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
              {statusCounts[s] ? ` (${statusCounts[s]})` : ''}
>>>>>>> 1e0855153e64689b821ff275bdae916f12e5d5d2
            </button>
          ))}
        </div>
        <button onClick={loadMovements} className="px-3 py-1 text-[11px] font-semibold rounded-full cursor-pointer border bg-white text-gray-500 border-gray-200 hover:border-gray-300">
          ↻ Refresh
        </button>
        <span className="text-[12px] text-gray-400 ml-auto">{filtered.length} awaiting completion</span>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg">
          <span className="text-[13px] font-medium text-gray-700">{selected.size} selected</span>
          <div className="flex gap-2 ml-auto">
            <button
<<<<<<< HEAD
              onClick={handleBulkComplete}
              disabled={bulkLoading}
              className="px-4 py-1.5 text-[12px] font-semibold text-white bg-green-600 rounded-md cursor-pointer hover:bg-green-700 disabled:opacity-50 disabled:cursor-default"
            >
              {bulkLoading ? 'Processing...' : `Complete All (${selected.size})`}
=======
              onClick={handleBulkApprove}
              disabled={bulkLoading}
              className="px-4 py-1.5 text-[12px] font-semibold text-white bg-green-600 rounded-md cursor-pointer hover:bg-green-700 disabled:opacity-50 disabled:cursor-default"
            >
              {bulkLoading ? 'Processing...' : `Approve All (${selected.size})`}
            </button>
            <button
              onClick={handleBulkCancel}
              disabled={bulkLoading}
              className="px-4 py-1.5 text-[12px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-md cursor-pointer hover:bg-red-100 disabled:opacity-50 disabled:cursor-default"
            >
              {bulkLoading ? 'Processing...' : `Cancel All (${selected.size})`}
>>>>>>> 1e0855153e64689b821ff275bdae916f12e5d5d2
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="px-3 py-1.5 text-[12px] font-medium text-gray-500 bg-white border border-gray-200 rounded-md cursor-pointer hover:bg-gray-100"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-gray-400">Loading movements...</div>
      ) : error ? (
        <div className="py-16 text-center text-red-500">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-gray-400">No pending movements</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2.5 w-[40px]">
<<<<<<< HEAD
                    <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="cursor-pointer" title="Select all" />
=======
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="cursor-pointer"
                      title="Select all"
                    />
>>>>>>> 1e0855153e64689b821ff275bdae916f12e5d5d2
                  </th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 min-w-[200px]">Product</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">From</th>
                  <th className="text-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Qty</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">To</th>
<<<<<<< HEAD
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Type</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Created</th>
                  <th className="text-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 min-w-[120px]">Action</th>
=======
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Requested</th>
                  <th className="text-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 min-w-[100px]">Action</th>
>>>>>>> 1e0855153e64689b821ff275bdae916f12e5d5d2
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => {
                  const vsmId = getVsmId(item);
<<<<<<< HEAD
                  const isSelected = vsmId !== null && selected.has(vsmId);
                  const completeLoading = vsmId !== null && actionLoading[`complete-${vsmId}`];
=======
                  const isActionable = (item.status === 'initiated' || item.status === 'in_progress') && vsmId !== null;
                  const isSelected = vsmId !== null && selected.has(vsmId);
                  const isLoading = vsmId !== null && actionLoading[vsmId];
>>>>>>> 1e0855153e64689b821ff275bdae916f12e5d5d2

                  return (
                    <tr key={vsmId ?? idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 text-center">
<<<<<<< HEAD
                        {vsmId !== null ? (
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(vsmId)} className="cursor-pointer" />
=======
                        {isActionable ? (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(vsmId!)}
                            className="cursor-pointer"
                          />
>>>>>>> 1e0855153e64689b821ff275bdae916f12e5d5d2
                        ) : (
                          <span className="text-gray-200">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium text-gray-800 line-clamp-2">{item.variant?.product_name}</div>
                        {item.variant?.sku && (
                          <span className="font-mono text-[11px] text-gray-400">{item.variant.sku}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-gray-600">
<<<<<<< HEAD
                        {[item.from_location?.branch, item.from_location?.category, item.from_location?.display_type, item.from_location?.location_string].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-600">{item.quantity}</td>
                      <td className="px-3 py-2 text-[11px] text-gray-600">
                        {[item.to_location?.display_type, item.to_location?.location_string].filter(Boolean).join(' · ') || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700">
                          {TYPE_LABELS[item.change_request_type] || item.change_request_type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-gray-400">{formatDate(item.created_at)}</td>
                      <td className="px-3 py-2 text-center">
                        {vsmId !== null ? (
                          <button
                            onClick={() => handleComplete(vsmId)}
                            disabled={!!completeLoading || bulkLoading}
                            className="px-3 py-1 text-[11px] font-semibold text-white bg-green-600 rounded cursor-pointer hover:bg-green-700 disabled:opacity-50 disabled:cursor-default"
                          >
                            {completeLoading ? '...' : 'Complete'}
                          </button>
=======
                        <div>{item.from_location?.branch}</div>
                        <div className="text-gray-400">{item.from_location?.location_string} · {item.from_location?.display_type}</div>
                      </td>
                      <td className="px-3 py-2 text-center text-gray-600">{item.quantity}</td>
                      <td className="px-3 py-2 text-[11px] text-gray-600">
                        <div>{item.to_location?.location_string} · {item.to_location?.display_type}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-600'}`}>
                          {item.status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-gray-400">
                        {formatDate(item.created_at)}
                        {item.completed_at && <div className="text-green-600">Done: {formatDate(item.completed_at)}</div>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {isActionable ? (
                          <div className="flex gap-1.5 justify-center">
                            <button
                              onClick={() => handleApprove(vsmId!)}
                              disabled={!!isLoading || !!actionLoading[`cancel-${vsmId}`] || bulkLoading}
                              className="px-3 py-1 text-[11px] font-semibold text-white bg-green-600 rounded cursor-pointer hover:bg-green-700 disabled:opacity-50 disabled:cursor-default"
                            >
                              {isLoading ? '...' : 'Approve'}
                            </button>
                            <button
                              onClick={() => handleCancel(vsmId!)}
                              disabled={!!isLoading || !!actionLoading[`cancel-${vsmId}`] || bulkLoading}
                              className="px-3 py-1 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded cursor-pointer hover:bg-red-100 disabled:opacity-50 disabled:cursor-default"
                            >
                              {actionLoading[`cancel-${vsmId}`] ? '...' : 'Cancel'}
                            </button>
                          </div>
>>>>>>> 1e0855153e64689b821ff275bdae916f12e5d5d2
                        ) : (
                          <span className="text-[11px] text-gray-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
