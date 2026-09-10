'use client';

import { DISPLAY_TYPES } from '../constants';
import { RemovalReason } from '../types';
import { Modal } from '.';
import { useEffect, useState } from 'react';

export function ChangeLocationDialog({ open, onClose, initialData, onSave }: {
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

export function RemoveFromDisplayDialog({ open, onClose, productName, storeName, onConfirm }: {
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
