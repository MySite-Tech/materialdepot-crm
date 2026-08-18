'use client';
import { useState, useEffect } from 'react';
import { displayApi } from '../../lib/displayApi';

interface VariantLocationRow {
  id: number;
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
}

interface Props {
  item: VariantLocationRow;
  storeName: string;
  onBack: () => void;
}

type RemovalReason = 'discontinued_permanently' | 'removed_temporarily';
type RemovalStatus = 'removal_initiated' | 'removal_in_progress' | 'removal_completed';
type ChangeStatus = 'change_initiated' | 'change_in_progress' | 'request_completed';

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
  { key: 'change_in_progress', label: 'In Progress' },
  { key: 'request_completed', label: 'Completed' },
];

const REMOVAL_STEPS: { key: RemovalStatus; label: string }[] = [
  { key: 'removal_initiated', label: 'Initiated' },
  { key: 'removal_in_progress', label: 'In Progress' },
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

  const positionChanged = locationString !== initialData.locationString;

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
              Position is changing from <strong>{initialData.locationString}</strong> to <strong>{locationString}</strong>. This will initiate a tracked change request that the store manager must complete.
            </div>
          )}

          {!positionChanged && (
            <div className="bg-blue-50 border border-blue-200 rounded px-3 py-2 text-[11px] text-blue-800">
              Only display type or quantity is changing — this will be saved directly.
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

// ─── Change Location Status Tracker ─────────────────────────────────────────
function ChangeLocationStatusTracker({ request, onStatusChange }: {
  request: ChangeLocationRequest;
  onStatusChange: (status: ChangeStatus, vsmId?: number) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const toast = useToast();

  const currentIdx = CHANGE_STEPS.findIndex(s => s.key === request.status);
  const nextStep = currentIdx < CHANGE_STEPS.length - 1 ? CHANGE_STEPS[currentIdx + 1] : null;

  const handleAdvance = async () => {
    if (!nextStep) return;
    setLoading(true);
    try {
      console.log('Advancing movement, vsmId:', request.vsmId, 'nextStep:', nextStep.key);
      if (nextStep.key === 'change_in_progress' && request.vsmId) {
        const res = await displayApi('movement_in_progress', { vsm_id: request.vsmId });
        console.log('movement_in_progress response:', JSON.stringify(res, null, 2));
      } else if (nextStep.key === 'request_completed' && request.vsmId) {
        const res = await displayApi('movement_complete', { vsm_id: request.vsmId });
        console.log('movement_complete response:', JSON.stringify(res, null, 2));
      }
      onStatusChange(nextStep.key);
      toast.show(`Status updated to "${nextStep.label}"`);
    } catch (err: any) {
      toast.show(err.message || 'Failed to advance status', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!request.vsmId) return;
    setCancelLoading(true);
    try {
      await displayApi('cancel_movement', { vsm_id: request.vsmId });
      toast.show('Movement cancelled');
      onStatusChange('request_completed');
    } catch (err: any) {
      toast.show(err.message || 'Failed to cancel', 'error');
    } finally {
      setCancelLoading(false);
    }
  };

  const statusColors: Record<ChangeStatus, string> = {
    change_initiated: 'bg-amber-50 text-amber-700',
    change_in_progress: 'bg-blue-50 text-blue-700',
    request_completed: 'bg-green-50 text-green-700',
  };

  return (
    <div className="bg-blue-50/40 border border-blue-200 rounded-lg p-4 mt-4">
      {toast.el}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[13px] font-bold text-gray-800">Location Change Status</span>
        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${statusColors[request.status]}`}>
          {CHANGE_STEPS.find(s => s.key === request.status)?.label}
        </span>
      </div>

      <div className="text-[12px] space-y-1 mb-3">
        <div><span className="text-gray-400">From: </span><span className="font-mono font-medium text-gray-700">{request.oldLocationString}</span></div>
        <div><span className="text-gray-400">To: </span><span className="font-mono font-medium text-gray-700">{request.newLocationString}</span></div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-1 mb-3">
        {CHANGE_STEPS.map((step, i) => {
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
              {i < CHANGE_STEPS.length - 1 && <div className={`h-0.5 w-4 ${i < currentIdx ? 'bg-green-500' : 'bg-gray-200'}`} />}
            </div>
          );
        })}
      </div>

      {request.status === 'request_completed' && (
        <div className="bg-green-50 border border-green-200 rounded px-3 py-2 text-[11px] text-green-800 mb-3">
          Location change has been completed. The product is now at <strong>{request.newLocationString}</strong>.
        </div>
      )}

      {nextStep && (
        <button onClick={handleAdvance} disabled={loading || cancelLoading} className="w-full px-4 py-2 text-[13px] font-semibold text-gray-700 bg-white border border-gray-200 rounded-md cursor-pointer hover:bg-gray-50 disabled:opacity-50 disabled:cursor-default mb-2">
          {loading ? 'Updating...' : `Mark as "${nextStep.label}"`}
        </button>
      )}

      {request.vsmId && request.status !== 'request_completed' && (
        <button onClick={handleCancel} disabled={loading || cancelLoading} className="w-full px-4 py-2 text-[13px] font-semibold text-white bg-red-500 rounded-md cursor-pointer hover:bg-red-600 disabled:opacity-50 disabled:cursor-default">
          {cancelLoading ? 'Cancelling...' : 'Cancel Movement'}
        </button>
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
  const nextStep = currentIdx < REMOVAL_STEPS.length - 1 ? REMOVAL_STEPS[currentIdx + 1] : null;
  const isPermanent = reason === 'discontinued_permanently';

  const handleAdvance = async () => {
    if (!nextStep) return;
    setLoading(true);
    try {
      if (nextStep.key === 'removal_in_progress' && vsmId) {
        await displayApi('removal_in_progress', { vsm_id: vsmId });
      } else if (nextStep.key === 'removal_completed' && vsmId) {
        await displayApi('removal_complete', { vsm_id: vsmId });
      }
      onStatusChange(nextStep.key);
      toast.show(`Status updated to "${nextStep.label}"`);
    } catch (err: any) {
      toast.show(err.message || 'Failed to advance status', 'error');
    } finally {
      setLoading(false);
    }
  };

  const statusColors: Record<RemovalStatus, string> = {
    removal_initiated: 'bg-amber-50 text-amber-700',
    removal_in_progress: 'bg-blue-50 text-blue-700',
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

      {/* Progress Steps */}
      <div className="flex items-center gap-1 mb-3">
        {REMOVAL_STEPS.map((step, i) => {
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
              {i < REMOVAL_STEPS.length - 1 && <div className={`h-0.5 w-4 ${i < currentIdx ? 'bg-green-500' : 'bg-gray-200'}`} />}
            </div>
          );
        })}
      </div>

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

      {nextStep && (
        <button onClick={handleAdvance} disabled={loading} className="w-full px-4 py-2 text-[13px] font-semibold text-gray-700 bg-white border border-gray-200 rounded-md cursor-pointer hover:bg-gray-50 disabled:opacity-50 disabled:cursor-default">
          {loading ? 'Updating...' : `Mark as "${nextStep.label}"`}
        </button>
      )}
    </div>
  );
}

// ─── Main Product Detail Panel ──────────────────────────────────────────────
export function ProductDetailPanel({ item: initialItem, storeName, onBack }: Props) {
  const [item, setItem] = useState(initialItem);
  const [changeLocationOpen, setChangeLocationOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [changeRequest, setChangeRequest] = useState<ChangeLocationRequest | null>(null);
  const [removalState, setRemovalState] = useState<{ reason: RemovalReason; status: RemovalStatus; vsmId?: number } | null>(null);
  const toast = useToast();

  const materialDepotUrl = `https://materialdepot.com/${item.variant_handle}/product`;

  const handleChangeLocationSave = async (data: { displayType: string; locationString: string; quantity: number }, positionChanged: boolean) => {
    try {
      if (positionChanged) {
        const apiData = await displayApi('movement_initiate', {
          variant_handle: item.variant_handle,
          from_location_id: item.location_id ?? item.id,
          quantity: data.quantity,
          display_type_to: data.displayType,
          location_string_to: data.locationString,
        });
        console.log('movement_initiate response:', JSON.stringify(apiData, null, 2));
        const inner = apiData?.data ?? apiData;
        const vsmId = inner?.vsm_id || inner?.id || apiData?.vsm_id || apiData?.id;
        console.log('Extracted vsmId:', vsmId);
        setChangeRequest({
          status: 'change_initiated',
          vsmId,
          newLocationString: data.locationString,
          oldLocationString: item.location_string,
          displayType: data.displayType,
          quantity: data.quantity,
        });
        toast.show('Change request initiated');
      } else {
        setItem(prev => ({ ...prev, quantity: data.quantity, display_type: data.displayType }));
        toast.show('Changes saved successfully');
      }
    } catch (err: any) {
      toast.show(err.message || 'Failed to save changes', 'error');
    }
  };

  const handleRemovalConfirm = async (reason: RemovalReason) => {
    try {
      const apiReason = reason === 'discontinued_permanently' ? 'retired_from_store_display' : 'removed_temporarily';
      const apiData = await displayApi('removal_initiate', {
        variant_handle: item.variant_handle,
        location_id: item.location_id ?? item.id,
        removal_reason: apiReason,
        additional_remarks: reason === 'discontinued_permanently' ? 'Discontinued permanently' : 'Removed temporarily',
      });
      const inner = apiData?.data ?? apiData;
      const vsmId = inner?.vsm_id || inner?.id || apiData?.vsm_id || apiData?.id;
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
              <img src={item.image_url} alt={item.product_name} className="w-full h-full object-cover" />
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

      {/* Status Trackers */}
      {changeRequest && (
        <ChangeLocationStatusTracker
          request={changeRequest}
          onStatusChange={(newStatus) => setChangeRequest(prev => prev ? { ...prev, status: newStatus } : prev)}
        />
      )}

      {removalState && (
        <RemovalStatusTracker
          status={removalState.status}
          reason={removalState.reason}
          vsmId={removalState.vsmId}
          onStatusChange={(newStatus) => setRemovalState(prev => prev ? { ...prev, status: newStatus } : prev)}
        />
      )}

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
