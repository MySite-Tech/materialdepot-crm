'use client';

import { Lead } from '../../types/crm';

import { DateEditPopupProps, DeleteConfirmProps, FollowUpRemarkPromptProps } from './types/crm';
import { fmtDate } from './utils/crm';
import { useState } from 'react';
import { DayPicker } from 'react-day-picker';

function FollowUpRemarkPrompt({ oldDate, newDate, onConfirm, onCancel }: FollowUpRemarkPromptProps) {
  const [text, setText] = useState('');
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[1000]">
      <div className="bg-white rounded-lg overflow-hidden w-[90%] shadow-[0_20px_60px_rgba(0,0,0,0.15)] max-w-[400px]">
        <div className="bg-[#1A1A1A] text-white px-5 py-3 flex justify-between items-center">
          <span className="font-semibold text-sm">Follow-up Date Changed</span>
        </div>
        <div className="p-5">
          <p className="mb-3 text-[13px]">
            <span className="text-gray-400">{fmtDate(oldDate)}</span>
            {' → '}
            <span className="font-semibold">{fmtDate(newDate)}</span>
          </p>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">REASON FOR CHANGE *</label>
          <textarea
            className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full min-h-[80px] mt-1 resize-y"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Enter reason for changing follow-up date..."
            autoFocus
          />
          <div className="flex gap-2 mt-4 justify-end">
            <button className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-md text-[13px] font-medium cursor-pointer" onClick={onCancel}>Cancel</button>
            <button className={`bg-[#EAB308] text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer ${text.trim() ? 'opacity-100' : 'opacity-50'}`} disabled={!text.trim()} onClick={() => onConfirm(text.trim())}>Confirm</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DateEditPopup({ field, currentDate, followUpDate, closureDate, assignedTo, onSave, onCancel }: DateEditPopupProps) {
  const label = field === 'followUpDate' ? 'Follow-up Date' : 'Closure Date';
  const [newDate, setNewDate] = useState(currentDate || '');
  const [remark, setRemark] = useState('');
  const [warning, setWarning] = useState('');
  const [autoUpdateNote, setAutoUpdateNote] = useState('');

  const toDateObj = (s: string): Date | undefined => {
    if (!s) return undefined;
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const toStr = (d: Date | undefined): string => {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const validate = (date: string): string => {
    setAutoUpdateNote('');
    if (field === 'closureDate' && followUpDate && date && date < followUpDate) {
      return 'Closure date cannot be earlier than follow-up date (' + fmtDate(followUpDate) + ')';
    }
    if (field === 'followUpDate' && closureDate && date && date > closureDate) {
      setAutoUpdateNote('Closure date will be automatically updated to ' + fmtDate(date));
    }
    return '';
  };

  const handleDateSelect = (date: Date | undefined) => {
    const dateStr = toStr(date);
    setNewDate(dateStr);
    setWarning(validate(dateStr));
  };

  const remarkRequired = true;

  const handleSave = () => {
    const w = validate(newDate);
    if (w) { setWarning(w); return; }
    if (!remark.trim()) { setWarning('Remark is required.'); return; }
    onSave(newDate, remark.trim());
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[1000]" onClick={onCancel}>
      <div className="bg-white rounded-lg overflow-hidden w-[90%] shadow-[0_20px_60px_rgba(0,0,0,0.15)] max-w-[380px]" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#1A1A1A] text-white px-5 py-3 flex justify-between items-center">
          <span className="font-semibold text-sm">Update {label}</span>
          <button className="bg-transparent border-none text-gray-400 text-xl cursor-pointer leading-none" onClick={onCancel}>&times;</button>
        </div>
        <div className="p-4">
          {currentDate && (
            <div className="text-xs text-gray-400 mb-2">
              Current: <span className="font-semibold text-gray-700">{fmtDate(currentDate)}</span>
            </div>
          )}
          {newDate && newDate !== currentDate && (
            <div className="text-xs text-[#EAB308] mb-2">
              New: <span className="font-semibold">{fmtDate(newDate)}</span>
            </div>
          )}
          <div className="flex justify-center">
            <DayPicker
              className="rdp-compact"
              mode="single"
              selected={toDateObj(newDate)}
              onSelect={handleDateSelect}
            />
          </div>
          {warning && <div className="text-[11px] text-red-500 mt-1 mb-1">{warning}</div>}
          {autoUpdateNote && <div className="text-[11px] text-[#EAB308] mt-1 mb-1">{autoUpdateNote}</div>}
          <div className="mt-2">
            <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: remarkRequired ? '#EF4444' : '#9CA3AF' }}>
              REMARK {remarkRequired ? <span className="text-red-500">*</span> : '(OPTIONAL)'}
            </label>
            <textarea
              className={`px-2.5 py-2 text-xs rounded-md outline-none font-sans w-full min-h-[50px] resize-y border ${remarkRequired && !remark.trim() ? 'border-red-400 bg-red-50' : 'border-gray-200'}`}
              value={remark}
              onChange={(e) => { setRemark(e.target.value); if (warning === 'Remark is required when changing the date.') setWarning(''); }}
              placeholder={'Reason for changing ' + label.toLowerCase() + '...'}
            />
            {remarkRequired && !remark.trim() && (
              <div className="text-[10px] text-red-500 mt-0.5">Please enter a reason for this date change.</div>
            )}
          </div>
          <div className="flex gap-2 mt-3">
            <button className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-md text-[13px] font-medium cursor-pointer" onClick={onCancel}>Cancel</button>
            <button className={`bg-[#EAB308] text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer flex-1 ${warning || !newDate || (remarkRequired && !remark.trim()) ? 'opacity-50' : 'opacity-100'}`} disabled={!!warning || !newDate || (remarkRequired && !remark.trim())} onClick={handleSave}>Save</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirm({ leadId, onConfirm, onCancel }: DeleteConfirmProps) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[1000]">
      <div className="bg-white rounded-lg overflow-hidden w-[90%] shadow-[0_20px_60px_rgba(0,0,0,0.15)] max-w-[360px]">
        <div className="bg-[#1A1A1A] text-white px-5 py-3 flex justify-between items-center">
          <span className="font-semibold text-sm">Delete Lead</span>
        </div>
        <div className="p-5 text-center">
          <p className="mb-4 text-[13px]">Are you sure you want to delete lead <strong>{leadId}</strong>? This action cannot be undone.</p>
          <div className="flex gap-2 justify-center">
            <button className="bg-white text-gray-700 border border-gray-200 px-5 py-2 rounded-md text-[13px] font-medium cursor-pointer" onClick={onCancel}>Cancel</button>
            <button className="bg-red-500 text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer" onClick={onConfirm}>Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}
