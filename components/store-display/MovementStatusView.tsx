'use client';
import { useState, useEffect, useMemo } from 'react';
import { displayApi } from '../../lib/displayApi';

interface MovementItem {
  id?: number;
  vsm_id?: number;
  change_request_type: string;
  removal_reason: string | null;
  from_location: {
    branch: string;
    category: string;
    display_type: string;
    location_string: string;
  };
  to_location: {
    branch?: string;
    display_type: string;
    location_string: string;
  };
  quantity: number;
  variant: {
    product_name: string;
    sku: string | null;
  };
  status: string;
  created_at: string;
  modified_at: string;
  completed_at: string | null;
  cancelled_at?: string | null;
}

function formatDate(d: string | null | undefined) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit', hour: 'numeric', minute: '2-digit' });
  } catch { return '—'; }
}

const STATUS_COLORS: Record<string, string> = {
  initiated: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-amber-50 text-amber-700',
  completed: 'bg-green-50 text-green-700',
  cancelled: 'bg-red-50 text-red-600',
};

function getVsmId(item: MovementItem): number | null {
  return item.vsm_id ?? item.id ?? null;
}

export function MovementStatusView() {
  const [items, setItems] = useState<MovementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [bulkLoading, setBulkLoading] = useState<'approve' | 'reject' | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchMovements = async () => {
    try {
      const data = await displayApi('fetch_movements');
      const list = Array.isArray(data) ? data : (data?.data ?? data?.results ?? []);
      setItems(list);
    } catch (e: any) {
      setError(e?.message || 'Failed to fetch movements');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMovements(); }, []);

  const filtered = useMemo(() => {
    if (statusFilter === 'all') return items;
    return items.filter(i => i.status === statusFilter);
  }, [items, statusFilter]);

  const actionableItems = useMemo(() => {
    return filtered.filter(i => i.status === 'initiated' || i.status === 'in_progress');
  }, [filtered]);

  const allSelected = actionableItems.length > 0 && actionableItems.every(i => {
    const vid = getVsmId(i);
    return vid !== null && selected.has(vid);
  });

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      const newSet = new Set<number>();
      actionableItems.forEach(i => {
        const vid = getVsmId(i);
        if (vid !== null) newSet.add(vid);
      });
      setSelected(newSet);
    }
  };

  const toggleSelect = (vsmId: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(vsmId)) next.delete(vsmId);
      else next.add(vsmId);
      return next;
    });
  };

  const handleApprove = async (vsmId: number) => {
    setActionLoading(prev => ({ ...prev, [`approve-${vsmId}`]: true }));
    try {
      await displayApi('movement_complete', { vsm_id: vsmId });
      setItems(prev => prev.map(i => getVsmId(i) === vsmId ? { ...i, status: 'completed', completed_at: new Date().toISOString() } : i));
      setSelected(prev => { const n = new Set(prev); n.delete(vsmId); return n; });
      setToast({ msg: `Movement #${vsmId} approved`, type: 'success' });
    } catch (e: any) {
      setToast({ msg: e.message || 'Failed to approve', type: 'error' });
    } finally {
      setActionLoading(prev => ({ ...prev, [`approve-${vsmId}`]: false }));
    }
  };

  const handleReject = async (vsmId: number) => {
    setActionLoading(prev => ({ ...prev, [`reject-${vsmId}`]: true }));
    try {
      await displayApi('cancel_movement', { vsm_id: vsmId });
      setItems(prev => prev.map(i => getVsmId(i) === vsmId ? { ...i, status: 'cancelled', cancelled_at: new Date().toISOString() } : i));
      setSelected(prev => { const n = new Set(prev); n.delete(vsmId); return n; });
      setToast({ msg: `Movement #${vsmId} rejected`, type: 'success' });
    } catch (e: any) {
      setToast({ msg: e.message || 'Failed to reject', type: 'error' });
    } finally {
      setActionLoading(prev => ({ ...prev, [`reject-${vsmId}`]: false }));
    }
  };

  const handleBulkApprove = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkLoading('approve');
    let success = 0;
    let fail = 0;
    for (const vsmId of ids) {
      try {
        await displayApi('movement_complete', { vsm_id: vsmId });
        setItems(prev => prev.map(i => getVsmId(i) === vsmId ? { ...i, status: 'completed', completed_at: new Date().toISOString() } : i));
        success++;
      } catch { fail++; }
    }
    setSelected(new Set());
    setBulkLoading(null);
    setToast({ msg: `Approved ${success}${fail ? `, ${fail} failed` : ''}`, type: fail ? 'error' : 'success' });
  };

  const handleBulkReject = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    setBulkLoading('reject');
    let success = 0;
    let fail = 0;
    for (const vsmId of ids) {
      try {
        await displayApi('cancel_movement', { vsm_id: vsmId });
        setItems(prev => prev.map(i => getVsmId(i) === vsmId ? { ...i, status: 'cancelled', cancelled_at: new Date().toISOString() } : i));
        success++;
      } catch { fail++; }
    }
    setSelected(new Set());
    setBulkLoading(null);
    setToast({ msg: `Rejected ${success}${fail ? `, ${fail} failed` : ''}`, type: fail ? 'error' : 'success' });
  };

  return (
    <div className="px-6 py-4">
      {toast && (
        <div className={`fixed bottom-4 right-4 z-[60] px-4 py-2.5 rounded-lg shadow-lg text-[13px] font-medium ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <h2 className="text-[15px] font-bold text-gray-800">Movement Status</h2>
        <div className="flex gap-1">
          {['all', 'initiated', 'in_progress', 'completed', 'cancelled'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 text-[11px] font-semibold rounded-full cursor-pointer border ${
                statusFilter === s
                  ? 'bg-[#EAB308] text-white border-[#EAB308]'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}
            >
              {s === 'all' ? 'All' : s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
            </button>
          ))}
        </div>
        <span className="text-[12px] text-gray-400 ml-auto">{filtered.length} movement{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 mb-3 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg">
          <span className="text-[13px] font-medium text-gray-700">{selected.size} selected</span>
          <div className="flex gap-2 ml-auto">
            <button
              onClick={handleBulkApprove}
              disabled={!!bulkLoading}
              className="px-4 py-1.5 text-[12px] font-semibold text-white bg-green-600 rounded-md cursor-pointer hover:bg-green-700 disabled:opacity-50 disabled:cursor-default"
            >
              {bulkLoading === 'approve' ? 'Approving...' : `Approve All (${selected.size})`}
            </button>
            <button
              onClick={handleBulkReject}
              disabled={!!bulkLoading}
              className="px-4 py-1.5 text-[12px] font-semibold text-white bg-red-500 rounded-md cursor-pointer hover:bg-red-600 disabled:opacity-50 disabled:cursor-default"
            >
              {bulkLoading === 'reject' ? 'Rejecting...' : `Reject All (${selected.size})`}
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
        <div className="py-16 text-center text-gray-400">No movements found</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2.5 w-[40px]">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="cursor-pointer"
                      title="Select all actionable"
                    />
                  </th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 min-w-[200px]">Product</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">From</th>
                  <th className="text-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Qty</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">To</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Status</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Type</th>
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Dates</th>
                  <th className="text-center px-3 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 min-w-[160px]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item, idx) => {
                  const vsmId = getVsmId(item);
                  const isActionable = item.status === 'initiated' || item.status === 'in_progress';
                  const isSelected = vsmId !== null && selected.has(vsmId);
                  const approveLoading = vsmId !== null && actionLoading[`approve-${vsmId}`];
                  const rejectLoading = vsmId !== null && actionLoading[`reject-${vsmId}`];

                  return (
                    <tr key={vsmId ?? idx} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2 text-center">
                        {isActionable && vsmId !== null ? (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelect(vsmId)}
                            className="cursor-pointer"
                          />
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
                        {[item.from_location?.branch, item.from_location?.category, item.from_location?.display_type, item.from_location?.location_string].filter(Boolean).join(' · ')}
                      </td>
                      <td className="px-3 py-2 text-center text-gray-600">{item.quantity}</td>
                      <td className="px-3 py-2 text-[11px] text-gray-600">
                        {[item.to_location?.display_type, item.to_location?.location_string].filter(Boolean).join(' · ')}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLORS[item.status] || 'bg-gray-100 text-gray-600'}`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[11px] text-gray-600">{item.change_request_type}</td>
                      <td className="px-3 py-2 text-[11px] text-gray-400 space-y-0.5">
                        <div>Created: {formatDate(item.created_at)}</div>
                        {item.completed_at && <div>Completed: {formatDate(item.completed_at)}</div>}
                        {item.cancelled_at && <div>Cancelled: {formatDate(item.cancelled_at)}</div>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {isActionable && vsmId !== null ? (
                          <div className="flex gap-1.5 justify-center">
                            <button
                              onClick={() => handleApprove(vsmId)}
                              disabled={!!approveLoading || !!rejectLoading || !!bulkLoading}
                              className="px-3 py-1 text-[11px] font-semibold text-white bg-green-600 rounded cursor-pointer hover:bg-green-700 disabled:opacity-50 disabled:cursor-default"
                            >
                              {approveLoading ? '...' : 'Approve'}
                            </button>
                            <button
                              onClick={() => handleReject(vsmId)}
                              disabled={!!approveLoading || !!rejectLoading || !!bulkLoading}
                              className="px-3 py-1 text-[11px] font-semibold text-white bg-red-500 rounded cursor-pointer hover:bg-red-600 disabled:opacity-50 disabled:cursor-default"
                            >
                              {rejectLoading ? '...' : 'Reject'}
                            </button>
                          </div>
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
