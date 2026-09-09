'use client';

import { fetchMovements, initiateMovement } from '../../../lib/store-display/displayApi';
import { getImageUrl } from '../../../lib/store-display/imageUrl';
import { ChangeLocationDialog, RemoveFromDisplayDialog } from './dialogs';
import { ChangeLocationStatusTracker, RemovalStatusTracker } from './trackers';
import { ChangeLocationRequest, Props, RemovalReason, RemovalStatus } from '../types/product-detail';
import { useToast } from './ui';
import { changeRequestKey, loadStored, removalStateKey } from '../utils/product-detail';
import { useEffect, useState } from 'react';

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
        const data = await fetchMovements();
        if (cancelled) return;
        const list = Array.isArray(data) ? data : (data?.data ?? data?.results ?? []);

        const active = list.find((m: any) =>
          m.change_request_type === 'move_display'
          && m.variant?.product_name === item.product_name
          && m.from_location?.location_string === item.location_string
          && m.status !== 'completed' && m.status !== 'cancelled'
        );
        if (active) {
          const backendId = active.id ?? active.vsm_id;
          const stored = loadStored<ChangeLocationRequest>(changeRequestKey(item.variant_handle));
          setChangeRequest({

            status: 'change_initiated',
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

        <div className="border-t border-gray-100 px-6 py-4">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Full Location Path</div>
          <div className="bg-gray-50 rounded px-3 py-2 font-mono text-[13px] text-gray-700">
            {item.branch_name || storeName}/{item.category}/{item.location_string}
          </div>
        </div>

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

        <div className="border-t border-gray-100 px-6 py-4">
          <a href={materialDepotUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] text-blue-600 hover:text-blue-800 underline">
            View on Material Depot →
          </a>
        </div>
      </div>

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
