'use client';

import { cancelMovement, completeMovement } from '../../../lib/store-display/displayApi';
import { CHANGE_STEPS, REMOVAL_STEPS } from '../constants/product-detail';
import { ChangeLocationRequest, ChangeStatus, RemovalReason, RemovalStatus } from '../types/product-detail';
import { StepLadder, useToast } from './ui';
import { useState } from 'react';

export function ChangeLocationStatusTracker({ request, onStatusChange }: {
  request: ChangeLocationRequest;
  onStatusChange: (status: ChangeStatus) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [revertLoading, setRevertLoading] = useState(false);
  const toast = useToast();

  const currentIdx = CHANGE_STEPS.findIndex(s => s.key === request.status);

  const handleComplete = async () => {

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

  const handleCancel = async () => {
    if (!request.vsmId) return;
    setRevertLoading(true);
    try {
      await cancelMovement(request.vsmId);
      onStatusChange('request_cancelled');
      toast.show('Movement cancelled — product returned to its original location');
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
        <button onClick={handleCancel} disabled={revertLoading} className="w-full px-4 py-2 text-[13px] font-semibold text-white bg-red-500 rounded-md cursor-pointer hover:bg-red-600 disabled:opacity-50 disabled:cursor-default">
          {revertLoading ? 'Cancelling...' : 'Cancel Movement (undo)'}
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

export function RemovalStatusTracker({ status, reason, vsmId, onStatusChange }: {
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
