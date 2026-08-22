'use client';
import { useState, useEffect } from 'react';
import { initiateMovement, completeMovement } from '../../lib/displayApi';
import { STORES, STORE_CODE_TO_BRANCH_ID } from '../../lib/displaySupabase';

const DISPLAY_TYPES = ['shelves', 'drawer', 'catalogue', 'panel_display', 'flaps', 'slots', 'wall_display', 'floor_stand'];

interface Props {
  open: boolean;
  onClose: () => void;
  defaultStoreCode?: string;
  onAdded?: () => void;
}

function extractVariantHandle(input: string): string {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('materialdepot.com')) {
      const segments = url.pathname.split('/').filter(Boolean);
      if (segments.length > 0) return segments[0];
    }
  } catch {}
  return trimmed;
}

export function AddToDisplayDialog({ open, onClose, defaultStoreCode = '', onAdded }: Props) {
  const [storeCode, setStoreCode] = useState(defaultStoreCode);
  const [rawInput, setRawInput] = useState('');
  const [displayType, setDisplayType] = useState('shelves');
  const [locationString, setLocationString] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [vsmId, setVsmId] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const variantHandle = extractVariantHandle(rawInput);
  const isUrl = rawInput.trim() !== variantHandle && variantHandle.length > 0;

  useEffect(() => {
    if (open) {
      setStoreCode(defaultStoreCode);
      setRawInput('');
      setDisplayType('shelves');
      setLocationString('');
      setQuantity(1);
      setVsmId(null);
      setMsg(null);
      setLoading(false);
    }
  }, [open, defaultStoreCode]);

  if (!open) return null;

  const branchId = storeCode ? (STORE_CODE_TO_BRANCH_ID[storeCode] || storeCode) : '';
  const canInitiate = !!(branchId && variantHandle && locationString.trim() && quantity > 0);

  const handleInitiate = async () => {
    if (!canInitiate) return;
    setLoading(true);
    setMsg(null);
    try {
      const data = await initiateMovement({
        movement_type: 'add_display',
        variant_handle: variantHandle,
        branch_id: branchId,
        display_type_to: displayType,
        location_string_to: locationString.trim(),
        quantity,
      });
      const id = data?.vsm_id ?? data?.data?.vsm_id ?? data?.id ?? null;
      setVsmId(id);
      setMsg({ text: `Add initiated (movement #${id}). Complete it now, or later from Pending Movements.`, type: 'success' });
    } catch (e: any) {
      setMsg({ text: e.message || 'Failed to initiate', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (!vsmId) return;
    setLoading(true);
    try {
      await completeMovement(vsmId);
      setMsg({ text: 'Product added to display.', type: 'success' });
      onAdded?.();
      setTimeout(onClose, 700);
    } catch (e: any) {
      setMsg({ text: e.message || 'Failed to complete', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-5">
          <h3 className="text-[15px] font-bold text-gray-800 mb-4">Add Product to Display</h3>

          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Store</label>
              <select className="w-full px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none" value={storeCode} onChange={(e) => setStoreCode(e.target.value)} disabled={!!vsmId}>
                <option value="">Choose a store...</option>
                {STORES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Product URL or Variant Handle</label>
              <input className="w-full px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none" placeholder="Paste product URL or variant handle" value={rawInput} onChange={(e) => setRawInput(e.target.value)} disabled={!!vsmId} />
              {isUrl && variantHandle && (
                <div className="mt-1 text-[11px] text-gray-500">Handle: <span className="font-mono text-gray-700">{variantHandle}</span></div>
              )}
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Display Type</label>
              <select className="w-full px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none" value={displayType} onChange={(e) => setDisplayType(e.target.value)} disabled={!!vsmId}>
                {DISPLAY_TYPES.map(dt => (
                  <option key={dt} value={dt}>{dt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Location String</label>
              <input className="w-full px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none" placeholder="e.g., 22A" value={locationString} onChange={(e) => setLocationString(e.target.value)} disabled={!!vsmId} />
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Quantity</label>
              <input type="number" min={1} className="w-full px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none" value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)} disabled={!!vsmId} />
            </div>
          </div>

          {msg && (
            <div className={`mt-3 text-[11px] px-3 py-2 rounded ${msg.type === 'error' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>{msg.text}</div>
          )}

          <div className="flex gap-2 justify-end mt-5">
            <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-gray-600 bg-gray-100 rounded-md cursor-pointer hover:bg-gray-200">Close</button>
            {!vsmId ? (
              <button onClick={handleInitiate} disabled={loading || !canInitiate} className="px-4 py-2 text-[13px] font-semibold text-white bg-[#EAB308] rounded-md cursor-pointer hover:bg-[#CA9A06] disabled:opacity-50 disabled:cursor-default">
                {loading ? 'Initiating...' : 'Initiate Add'}
              </button>
            ) : (
              <button onClick={handleComplete} disabled={loading} className="px-4 py-2 text-[13px] font-semibold text-white bg-green-600 rounded-md cursor-pointer hover:bg-green-700 disabled:opacity-50 disabled:cursor-default">
                {loading ? 'Completing...' : 'Complete now'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
