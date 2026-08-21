'use client';
import { useEffect, useState } from 'react';
import { cancelMovement, completeMovement, initiateMovement } from '../../lib/displayApi';
import { getImageUrl } from '../../lib/imageUrl';

interface VariantLocationRow {
  id: number;
  location_id: number | null;
  branch_id?: string;
  is_active?: boolean;
  variant_handle: string;
  product_name: string;
  sku: string | null;
  category: string;
  display_type: string;
  location_string: string;
  is_deleted: boolean;
  image_url: string | null;
  quantity: number;
  private_label_product_name: string | null;
  private_label_brand: string | null;
  branch_name?: string;
}

interface Props {
  item: VariantLocationRow;
  storeName: string;
  onBack: () => void;
}

type RemovalReason = 'discontinued_permanently' | 'removed_temporarily';
// Two-step lifecycle: the backend only has "initiated" and "completed".
type RemovalStatus = 'removal_initiated' | 'removal_completed';
type ChangeStatus = 'change_initiated' | 'request_completed' | 'request_cancelled';

interface ChangeLocationRequest {
  status: ChangeStatus;
  vsmId?: number;
  newLocationString: string;
  oldLocationString: string;
  displayType: string;
  quantity: number;
}

const DISPLAY_TYPES = ['shelves', 'drawer', 'catalogue', 'panel_display', 'flaps', 'slots', 'wall_display', 'floor_stand'];

const CHANGE_STEPS: { key: ChangeStatus; label: string }[] = [
  { key: 'change_initiated', label: 'Initiated' },
  { key: 'request_completed', label: 'Completed' },
];

const REMOVAL_STEPS: { key: RemovalStatus; label: string }[] = [
  { key: 'removal_initiated', label: 'Initiated' },
  { key: 'removal_completed', label: 'Completed' },
];

// ─── Modal Overlay ──────────────────────────────────────────────────────────
function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {children}
      </div>
    </div>
  );
}

// ─── Toast ──────────────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  const el = toast ? (
    <div className={`fixed bottom-4 right-4 z-[60] px-4 py-2.5 rounded-lg shadow-lg text-[13px] font-medium ${toast.type === 'error' ? 'bg-red-600 text-white' : 'bg-green-600 text-white'}`}>
      {toast.msg}
    </div>
  ) : null;
  return { show: (msg: string, type: 'success' | 'error' = 'success') => setToast({ msg, type }), el };
}

// ─── Change Location Dialog ─────────────────────────────────────────────────
function ChangeLocationDialog({ open, onClose, initialData, onSave }: {
  open: boolean;
  onClose: () => void;
  initialData: { displayType: string; locationString: string; quantity: number };
  onSave: (data: { displayType: string; locationString: string; quantity: number }, positionChanged: boolean) => void;
}) {
  const [displayType, setDisplayType] = useState(initialData.displayType.toLowerCase());
  const [locationString, setLocationString] = useState(initialData.locationString);
  const [quantity, setQuantity] = useState(initialData.quantity);

  useEffect(() => {
    if (open) {
      setDisplayType(initialData.displayType.toLowerCase());
      setLocationString(initialData.locationString);
      setQuantity(initialData.quantity);
    }
  }, [open, initialData]);

  /* A display-type change is a physical re-placement just like a location
     change — the movement API has a `display_type_to` field for exactly that.
     Keying this on the location string alone sent display-type edits down the
     "save directly" path, which saves nothing. */
  const positionChanged = locationString !== initialData.locationString
    || displayType.toLowerCase() !== initialData.displayType.toLowerCase();

  const handleSave = () => {
    onSave({ displayType, locationString, quantity }, positionChanged);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="p-5">
        <h3 className="text-[15px] font-bold text-gray-800 mb-4">Change Location</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Display Type</label>
            <select className="w-full px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none" value={displayType} onChange={(e) => setDisplayType(e.target.value)}>
              {DISPLAY_TYPES.map(dt => (
                <option key={dt} value={dt}>{dt.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Location String</label>
            <input className="w-full px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none" placeholder="e.g., 22A" value={locationString} onChange={(e) => setLocationString(e.target.value)} />
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Quantity</label>
            <input type="number" min={1} className="w-full px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none" value={quantity} onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)} />
          </div>

          {positionChanged && (
            <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-[11px] text-amber-800">
              {locationString !== initialData.locationString ? (
                <>Position is changing from <strong>{initialData.locationString}</strong> to <strong>{locationString}</strong>.</>
              ) : (
                <>Display type is changing to <strong>{displayType}</strong>.</>
              )}{' '}
              This will initiate a tracked change request that the store manager must complete.
            </div>
          )}

          {!positionChanged && (
            <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2 text-[11px] text-blue-800">
              Quantity on its own can&apos;t be changed here — use the bulk sheet upload under Admin. Change the location or display type to raise a tracked request.
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose} className="px-4 py-2 text-[13px] font-medium text-gray-600 bg-gray-100 rounded-md cursor-pointer hover:bg-gray-200">Cancel</button>
          <button onClick={handleSave} className="px-4 py-2 text-[13px] font-semibold text-white bg-[#EAB308] rounded-md cursor-pointer hover:bg-[#CA9A06]">
            {positionChanged ? 'Initiate Change Request' : 'Save Changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Remove from Display Dialog ─────────────────────────────────────────────
function RemoveFromDisplayDialog({ open, onClose, productName, storeName, onConfirm }: {
  open: boolean;
  onClose: () => void;
  productName: string;
  storeName: string;
  onConfirm: (reason: RemovalReason) => void;
}) {
  const [reason, setReason] = useState<RemovalReason>('removed_temporarily');

  const handleConfirm = () => {
    onConfirm(reason);
    onClose();
    setReason('removed_temporarily');
  };

  return (
    <Modal open={open} onClose={() => { onClose(); setReason('removed_temporarily'); }}>
      <div className="p-5">
        <h3 className="text-[15px] font-bold text-red-600 mb-1 flex items-center gap-2">
          <span className="text-red-500">⚠</span> Remove from Display
        </h3>
        <p className="text-[12px] text-gray-500 mb-4">
          Are you sure you want to remove <strong>{productName}</strong> from <strong>{storeName}</strong>?
        </p>

        <div className="space-y-2 mb-4">
          <label className="block text-[11px] font-semibold text-gray-500 mb-2">Removal Reason *</label>

          <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${reason === 'removed_temporarily' ? 'border-blue-300 bg-blue-50/50' : 'border-gray-200 hover:bg-gray-50'}`}>
            <input type="radio" name="removal" value="removed_temporarily" checked={reason === 'removed_temporarily'} onChange={() => setReason('removed_temporarily')} className="mt-0.5" />
            <div>
              <div className="text-[13px] font-medium text-gray-800">Removed Temporarily</div>
              <div className="text-[11px] text-gray-400">Product will be temporarily removed from this store.</div>
            </div>
          </label>
          {reason === 'removed_temporarily' && (
            <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2 text-[11px] text-blue-800 ml-6">
              This is a temporary removal — the product will <strong>not</strong> be discontinued on the website.
            </div>
          )}

          <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${reason === 'discontinued_permanently' ? 'border-red-300 bg-red-50/50' : 'border-gray-200 hover:bg-gray-50'}`}>
            <input type="radio" name="removal" value="discontinued_permanently" checked={reason === 'discontinued_permanently'} onChange={() => setReason('discontinued_permanently')} className="mt-0.5" />
            <div>
              <div className="text-[13px] font-medium text-gray-800">Discontinued Permanently</div>
              <div className="text-[11px] text-gray-400">Product will be permanently removed from this store and discontinued on the website.</div>
            </div>
          </label>
          {reason === 'discontinued_permanently' && (
            <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-[11px] text-red-700 ml-6">
              <strong>Warning:</strong> This product will also be <strong>discontinued on the website</strong>. This action marks it for permanent removal.
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={() => { onClose(); setReason('removed_temporarily'); }} className="px-4 py-2 text-[13px] font-medium text-gray-600 bg-gray-100 rounded-md cursor-pointer hover:bg-gray-200">Cancel</button>
          <button onClick={handleConfirm} className="px-4 py-2 text-[13px] font-semibold text-white bg-red-500 rounded-md cursor-pointer hover:bg-red-600">
            Yes, Remove
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Step ladder (shared) ─────────────────────────────────────────────────────
function StepLadder<T extends string>({ steps, currentIdx }: { steps: { key: T; label: string }[]; currentIdx: number }) {
  return (
    <div className="flex items-center gap-1 mb-3">
      {steps.map((step, i) => {
        const isComplete = i <= currentIdx;
        const isCurrent = i === currentIdx;
        return (
          <div key={step.key} className="flex items-center gap-1 flex-1">
            <div className="flex flex-col items-center gap-1 flex-1">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${isComplete ? (isCurrent ? 'bg-amber-400 text-white' : 'bg-green-500 text-white') : 'bg-gray-200 text-gray-400'}`}>
                {isComplete ? '✓' : i + 1}
              </div>
              <span className={`text-[10px] text-center leading-tight ${isComplete ? 'font-medium text-gray-700' : 'text-gray-400'}`}>{step.label}</span>
            </div>
            {i < steps.length - 1 && <div className={`h-0.5 w-4 ${i < currentIdx ? 'bg-green-500' : 'bg-gray-200'}`} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Change Location Status Tracker ─────────────────────────────────────────
function ChangeLocationStatusTracker({ request, onStatusChange }: {
  request: ChangeLocationRequest;
  onStatusChange: (status: ChangeStatus) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [revertLoading, setRevertLoading] = useState(false);
  const toast = useToast();

  const currentIdx = CHANGE_STEPS.findIndex(s => s.key === request.status);

  const handleComplete = async () => {
    /* Without a vsm_id there is no movement to complete. Reporting success and
       moving the badge on anyway would tell the store the product had been
       relocated while its actual movement sat untouched. */
    if (!request.vsmId) {
      toast.show('This change request has no movement ID — reopen the product and initiate it again.', 'error');
      return;
    }
    setLoading(true);
    try {
      await completeMovement(request.vsmId);
      onStatusChange('request_completed');
      toast.show('Movement completed — product relocated');
    } catch (err: any) {
      toast.show(err.message || 'Failed to complete', 'error');
    } finally {
      setLoading(false);
    }
  };

  /* The backend only reverses a COMPLETED move (it puts the stock back), so
     "Cancel" is an undo offered after completion — not a way to discard a
     still-pending request. */
  const handleCancel = async () => {
    if (!request.vsmId) return;
    setRevertLoading(true);
    try {
      await cancelMovement(request.vsmId);
      toast.show('Movement cancelled — product returned to its original location');
      onStatusChange('request_cancelled');
      toast.show('Movement cancelled — product moved back to original location');
    } catch (err: any) {
      toast.show(err.message || 'Failed to cancel', 'error');
    } finally {
      setRevertLoading(false);
    }
  };

  const statusColors: Record<ChangeStatus, string> = {
    change_initiated: 'bg-amber-50 text-amber-700',
    request_completed: 'bg-green-50 text-green-700',
    request_cancelled: 'bg-red-50 text-red-600',
  };

  return (
    <div className="bg-blue-50/40 border border-blue-200 rounded-lg p-4 mt-4">
      {toast.el}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-bold text-gray-800">Location Change Status</span>
        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${statusColors[request.status]}`}>
          {CHANGE_STEPS.find(s => s.key === request.status)?.label ?? 'Cancelled'}
        </span>
      </div>

      <div className="text-[12px] space-y-1 mb-3">
        <div><span className="text-gray-400">From: </span><span className="font-mono font-medium text-gray-700">{request.oldLocationString}</span></div>
        <div><span className="text-gray-400">To: </span><span className="font-mono font-medium text-gray-700">{request.newLocationString}</span></div>
      </div>

      {request.status !== 'request_cancelled' && <StepLadder steps={CHANGE_STEPS} currentIdx={currentIdx} />}

      {request.status === 'request_completed' && (
        <div className="bg-green-50 border border-green-200 rounded px-3 py-2 text-[11px] text-green-800 mb-3">
          Location change has been completed. The product is now at <strong>{request.newLocationString}</strong>.
        </div>
      )}

      {request.status === 'change_initiated' && (
        <button onClick={handleComplete} disabled={loading} className="w-full px-4 py-2 text-[13px] font-semibold text-white bg-green-600 rounded-md cursor-pointer hover:bg-green-700 disabled:opacity-50 disabled:cursor-default mb-2">
          {loading ? 'Completing...' : 'Mark as Completed'}
        </button>
      )}

      {request.status === 'request_completed' && request.vsmId && (
        <button onClick={handleCancel} disabled={cancelLoading} className="w-full px-4 py-2 text-[13px] font-semibold text-white bg-red-500 rounded-md cursor-pointer hover:bg-red-600 disabled:opacity-50 disabled:cursor-default">
          {cancelLoading ? 'Cancelling...' : 'Cancel Movement (undo)'}
        </button>
      )}

      {request.status !== 'request_completed' && request.status !== 'request_cancelled' && !request.vsmId && (
        <div className="bg-amber-50 border border-amber-200 rounded px-3 py-2 text-[11px] text-amber-800">
          A change request is in progress. Only the person who initiated it can complete or cancel it from their device.
        </div>
      )}
    </div>
  );
}

// ─── Removal Status Tracker ─────────────────────────────────────────────────
function RemovalStatusTracker({ status, reason, vsmId, onStatusChange }: {
  status: RemovalStatus;
  reason: RemovalReason;
  vsmId?: number;
  onStatusChange: (status: RemovalStatus) => void;
}) {
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const currentIdx = REMOVAL_STEPS.findIndex(s => s.key === status);
  const isPermanent = reason === 'discontinued_permanently';

  const handleComplete = async () => {
    if (!vsmId) {
      toast.show('This removal has no movement ID — reopen the product and initiate it again.', 'error');
      return;
    }
    setLoading(true);
    try {
      await completeMovement(vsmId);
      onStatusChange('removal_completed');
      toast.show('Removal completed');
    } catch (err: any) {
      toast.show(err.message || 'Failed to complete removal', 'error');
    } finally {
      setLoading(false);
    }
  };

  const statusColors: Record<RemovalStatus, string> = {
    removal_initiated: 'bg-amber-50 text-amber-700',
    removal_completed: 'bg-red-50 text-red-600',
  };

  return (
    <div className="bg-amber-50/40 border border-amber-200 rounded-lg p-4 mt-4">
      {toast.el}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-bold text-gray-800">Removal Status</span>
        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${statusColors[status]}`}>
          {REMOVAL_STEPS.find(s => s.key === status)?.label}
        </span>
      </div>

      <div className="text-[12px] mb-3">
        <span className="text-gray-400">Reason: </span>
        <span className="font-medium text-gray-700">{isPermanent ? 'Discontinued Permanently' : 'Removed Temporarily'}</span>
      </div>

      <StepLadder steps={REMOVAL_STEPS} currentIdx={currentIdx} />

      {status === 'removal_completed' && isPermanent && (
        <div className="bg-red-50 border border-red-200 rounded px-3 py-2 text-[11px] text-red-700 mb-3">
          This product will be marked as <strong>discontinued on the website</strong> as well.
        </div>
      )}
      {status === 'removal_completed' && !isPermanent && (
        <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2 text-[11px] text-blue-800 mb-3">
          Temporary removal completed. The product remains <strong>active on the website</strong>.
        </div>
      )}

      {status === 'removal_initiated' && (
        <button onClick={handleComplete} disabled={loading} className="w-full px-4 py-2 text-[13px] font-semibold text-white bg-green-600 rounded-md cursor-pointer hover:bg-green-700 disabled:opacity-50 disabled:cursor-default">
          {loading ? 'Completing...' : 'Mark as Completed'}
        </button>
      )}
    </div>
  );
}

// ─── Main Product Detail Panel ──────────────────────────────────────────────
function changeRequestKey(handle: string) { return `sd_change_${handle}`; }
function removalStateKey(handle: string) { return `sd_removal_${handle}`; }

function loadStored<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function ProductDetailPanel({ item: initialItem, storeName, onBack }: Props) {
  const [item] = useState(initialItem);
  const [changeLocationOpen, setChangeLocationOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [changeRequest, setChangeRequest] = useState<ChangeLocationRequest | null>(
    () => loadStored<ChangeLocationRequest>(changeRequestKey(initialItem.variant_handle))
  );
  const [removalState, setRemovalState] = useState<{ reason: RemovalReason; status: RemovalStatus; vsmId?: number } | null>(
    () => loadStored(removalStateKey(initialItem.variant_handle))
  );
  const toast = useToast();

  useEffect(() => {
    const key = changeRequestKey(item.variant_handle);
    if (changeRequest && changeRequest.status !== 'request_completed' && changeRequest.status !== 'request_cancelled') {
      localStorage.setItem(key, JSON.stringify(changeRequest));
    } else {
      localStorage.removeItem(key);
    }
  }, [changeRequest, item.variant_handle]);

  useEffect(() => {
    const key = removalStateKey(item.variant_handle);
    if (removalState && removalState.status !== 'removal_completed') {
      localStorage.setItem(key, JSON.stringify(removalState));
    } else {
      localStorage.removeItem(key);
    }
  }, [removalState, item.variant_handle]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await displayApi('fetch_movements');
        if (cancelled) return;
        const list = Array.isArray(data) ? data : (data?.data ?? data?.results ?? []);
        const active = list.find((m: any) =>
          m.variant?.product_name === item.product_name
          && m.from_location?.location_string === item.location_string
          && m.status !== 'completed' && m.status !== 'cancelled'
        );
        if (active) {
          const statusMap: Record<string, ChangeStatus> = {
            initiated: 'change_initiated',
            in_progress: 'change_in_progress',
          };
          const backendId = active.id ?? active.vsm_id;
          const stored = loadStored<ChangeLocationRequest>(changeRequestKey(item.variant_handle));
          setChangeRequest({
            status: statusMap[active.status] ?? 'change_initiated',
            vsmId: backendId ?? stored?.vsmId,
            newLocationString: active.to_location?.location_string ?? '',
            oldLocationString: active.from_location?.location_string ?? item.location_string,
            displayType: active.to_location?.display_type ?? item.display_type,
            quantity: active.quantity ?? item.quantity,
          });
        }
      } catch { /* non-critical — localStorage state is the fallback */ }
    })();
    return () => { cancelled = true; };
  }, [item.product_name, item.location_string, item.variant_handle, item.display_type, item.quantity]);

  const materialDepotUrl = `https://materialdepot.com/${item.variant_handle}/product`;

  const handleChangeLocationSave = async (data: { displayType: string; locationString: string; quantity: number }, positionChanged: boolean) => {
    if (!positionChanged) {
      /* There is no endpoint that persists a quantity-only edit — movement and
         removal are the only writes this screen has. */
      toast.show('Quantity is only editable through the bulk sheet upload in Admin — nothing was changed.', 'error');
      return;
    }
    try {
      const apiData = await initiateMovement({
        movement_type: 'move_display',
        variant_handle: item.variant_handle,
        from_location_id: item.location_id ?? item.id,
        quantity: data.quantity,
        display_type_to: data.displayType,
        location_string_to: data.locationString,
      });
      const vsmId = apiData?.vsm_id ?? apiData?.data?.vsm_id ?? apiData?.id;
      setChangeRequest({
        status: 'change_initiated',
        vsmId,
        newLocationString: data.locationString,
        oldLocationString: item.location_string,
        displayType: data.displayType,
        quantity: data.quantity,
      });
      toast.show('Change request initiated');
    } catch (err: any) {
      toast.show(err.message || 'Failed to save changes', 'error');
    }
  };

  const handleRemovalConfirm = async (reason: RemovalReason) => {
    try {
      /* Backend removal_reason vocabulary is {discontinued_permanently,
         retired_from_store_display}; "temporary" maps to the latter (removed
         from THIS store's display, not discontinued on the website). */
      const apiReason = reason === 'discontinued_permanently' ? 'discontinued_permanently' : 'retired_from_store_display';
      const apiData = await initiateMovement({
        movement_type: 'remove_display',
        variant_handle: item.variant_handle,
        location_id: item.location_id ?? item.id,
        removal_reason: apiReason,
        additional_remarks: reason === 'discontinued_permanently' ? 'Discontinued permanently' : 'Removed temporarily',
      });
      const vsmId = apiData?.vsm_id ?? apiData?.data?.vsm_id ?? apiData?.id;
      setRemovalState({ reason, status: 'removal_initiated', vsmId });
      toast.show('Removal initiated');
    } catch (err: any) {
      toast.show(err.message || 'Failed to initiate removal', 'error');
    }
  };

  return (
    <div className="px-6 py-4 max-w-3xl">
      {toast.el}
      <button onClick={onBack} className="text-[13px] text-gray-500 hover:text-gray-800 mb-4 cursor-pointer">
        ← Back to products
      </button>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Image + Info */}
        <div className="flex gap-6 p-6">
          <a href={materialDepotUrl} target="_blank" rel="noopener noreferrer" className="block w-48 h-48 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 hover:opacity-90 transition-opacity">
            {item.image_url ? (
              <img src={getImageUrl(item.image_url, 400)} alt={item.product_name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300 text-sm">No image</div>
            )}
          </a>

          <div className="flex-1">
            <h2 className="text-[15px] font-bold text-gray-800 leading-snug mb-2">{item.product_name}</h2>

            <div className="flex flex-wrap gap-2 mb-4">
              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700">{item.display_type}</span>
              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">{item.location_string}</span>
              {item.is_deleted && (
                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-red-50 text-red-600">Discontinued</span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px]">
              {item.sku && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">SKU</div>
                  <div className="font-mono text-gray-700">{item.sku}</div>
                </div>
              )}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Category</div>
                <div className="text-gray-700">{item.category}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Quantity</div>
                <div className="text-gray-700">{item.quantity}</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Display Type</div>
                <div className="text-gray-700">{item.display_type}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Private Label */}
        {(item.private_label_product_name || item.private_label_brand) && (
          <div className="border-t border-gray-100 px-6 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Private Label</div>
            <div className="grid grid-cols-2 gap-4 text-[13px]">
              {item.private_label_product_name && (
                <div>
                  <div className="text-gray-400 text-[11px]">Product Name</div>
                  <div className="text-gray-700">{item.private_label_product_name}</div>
                </div>
              )}
              {item.private_label_brand && (
                <div>
                  <div className="text-gray-400 text-[11px]">Brand</div>
                  <div className="text-gray-700">{item.private_label_brand}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Location */}
        <div className="border-t border-gray-100 px-6 py-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Full Location Path</div>
          <div className="bg-gray-50 rounded px-3 py-2 font-mono text-[13px] text-gray-700">
            {item.branch_name || storeName}/{item.category}/{item.location_string}
          </div>
        </div>

        {/* Status Trackers */}
        {changeRequest && (
          <div className="border-t border-gray-100 px-6 py-4">
            <ChangeLocationStatusTracker
              request={changeRequest}
              onStatusChange={(newStatus) => setChangeRequest(prev => prev ? { ...prev, status: newStatus } : prev)}
            />
          </div>
        )}

        {removalState && (
          <div className="border-t border-gray-100 px-6 py-4">
            <RemovalStatusTracker
              status={removalState.status}
              reason={removalState.reason}
              vsmId={removalState.vsmId}
              onStatusChange={(newStatus) => setRemovalState(prev => prev ? { ...prev, status: newStatus } : prev)}
            />
          </div>
        )}

        {/* Actions */}
        <div className="border-t border-gray-100 px-6 py-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-3">Actions</div>
          <div className="space-y-2">
            <button onClick={() => setChangeLocationOpen(true)} className="w-full flex items-center gap-3 px-4 py-3 text-left border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors bg-white">
              <span className="text-[16px]">📍</span>
              <div>
                <div className="text-[13px] font-medium text-gray-800">Change Location</div>
                <div className="text-[11px] text-gray-400">Move product to a different position</div>
              </div>
            </button>

            {!removalState && (
              <button onClick={() => setRemoveDialogOpen(true)} className="w-full flex items-center gap-3 px-4 py-3 text-left border border-red-200 rounded-lg cursor-pointer hover:bg-red-50 transition-colors bg-white">
                <span className="text-[16px]">🗑</span>
                <div>
                  <div className="text-[13px] font-medium text-red-600">Remove from Display</div>
                  <div className="text-[11px] text-gray-400">Remove product from this store</div>
                </div>
              </button>
            )}
          </div>
        </div>

        {/* Link */}
        <div className="border-t border-gray-100 px-6 py-4">
          <a href={materialDepotUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] text-blue-600 hover:text-blue-800 underline">
            View on Material Depot →
          </a>
        </div>
      </div>

      {/* Dialogs */}
      <ChangeLocationDialog
        open={changeLocationOpen}
        onClose={() => setChangeLocationOpen(false)}
        initialData={{ displayType: item.display_type, locationString: item.location_string, quantity: item.quantity }}
        onSave={handleChangeLocationSave}
      />

      <RemoveFromDisplayDialog
        open={removeDialogOpen}
        onClose={() => setRemoveDialogOpen(false)}
        productName={item.product_name}
        storeName={storeName}
        onConfirm={handleRemovalConfirm}
      />
    </div>
  );
}
