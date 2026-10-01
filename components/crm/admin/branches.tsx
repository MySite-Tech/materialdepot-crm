'use client';

import { addBranch, BRANCH_DETAIL_FIELDS, BranchDetail, fetchBranchDetail, saveBranchDetail } from '../../../lib/api';
import { useRef, useState } from 'react';

import { BranchManagerProps } from '../types';

const EMPTY_DETAIL: BranchDetail = { branch_name: '', city: '', address: '', map_link: '' };

const inputClass = 'px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full';
const labelClass = 'block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1';

function trimDetail(d: BranchDetail): BranchDetail {
  return Object.fromEntries(BRANCH_DETAIL_FIELDS.map((f) => [f, d[f].trim()])) as BranchDetail;
}

function isValidUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function BranchFields({ value, onChange }: { value: BranchDetail; onChange: (d: BranchDetail) => void }) {
  const set = (field: keyof BranchDetail) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ ...value, [field]: e.target.value });
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <div>
        <label className={labelClass}>Branch Name</label>
        <input className={inputClass} value={value.branch_name} onChange={set('branch_name')} placeholder="e.g. Koramangala" />
      </div>
      <div>
        <label className={labelClass}>City</label>
        <input className={inputClass} value={value.city} onChange={set('city')} placeholder="e.g. Bangalore" />
      </div>
      <div className="md:col-span-2">
        <label className={labelClass}>Address</label>
        <textarea className={`${inputClass} resize-y`} rows={2} value={value.address} onChange={set('address')} placeholder="Full store address" />
      </div>
      <div className="md:col-span-2">
        <label className={labelClass}>Map Link</label>
        <input className={inputClass} value={value.map_link} onChange={set('map_link')} placeholder="https://maps.app.goo.gl/..." />
      </div>
    </div>
  );
}

type ModalState = { mode: 'add' } | { mode: 'edit'; id: string | number } | null;

export function BranchManager({ branches, setBranches }: BranchManagerProps) {
  const [modal, setModal] = useState<ModalState>(null);
  const [original, setOriginal] = useState<BranchDetail | null>(null);
  const [detail, setDetail] = useState<BranchDetail>(EMPTY_DETAIL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const editRequest = useRef<string | number | null>(null);

  const validate = (d: BranchDetail, id: string | number | null) => {
    if (!d.branch_name) return 'Branch name is required';
    if (branches.some((b) => b.name.toLowerCase() === d.branch_name.toLowerCase() && b.id !== id)) return 'Branch already exists';
    if (d.map_link && !isValidUrl(d.map_link)) return 'Map link must be a full http(s) URL';
    return '';
  };

  const openAdd = () => {
    editRequest.current = null;
    setModal({ mode: 'add' });
    setOriginal(null);
    setDetail(EMPTY_DETAIL);
    setError('');
    setLoading(false);
  };

  const openEdit = async (id: string | number) => {
    editRequest.current = id;
    setModal({ mode: 'edit', id });
    setOriginal(null);
    setDetail(EMPTY_DETAIL);
    setError('');
    setLoading(true);
    try {
      const d = await fetchBranchDetail(id);
      if (editRequest.current !== id) return;
      setOriginal(d);
      setDetail(d);
    } catch (e: any) {
      if (editRequest.current !== id) return;
      setError(e.message || 'Failed to load branch');
    } finally {
      if (editRequest.current === id) setLoading(false);
    }
  };

  const closeModal = () => {
    if (saving) return;
    editRequest.current = null;
    setModal(null);
    setOriginal(null);
    setError('');
  };

  const handleSave = async () => {
    if (!modal) return;
    const d = trimDetail(detail);
    const id = modal.mode === 'edit' ? modal.id : null;
    const err = validate(d, id);
    if (err) { setError(err); return; }

    if (modal.mode === 'add') {
      setError('');
      setSaving(true);
      try {
        const b = await addBranch(d);
        setBranches((prev) => [...prev, b]);
        setSaving(false);
        editRequest.current = null;
        setModal(null);
      } catch (e: any) {
        setError(e.message || 'Failed to add branch');
        setSaving(false);
      }
      return;
    }

    if (!original) return;
    const changes = Object.fromEntries(
      BRANCH_DETAIL_FIELDS.filter((f) => d[f] !== (original[f] || '').trim()).map((f) => [f, d[f]]),
    ) as Partial<BranchDetail>;
    if (Object.keys(changes).length === 0) { closeModal(); return; }
    setError('');
    setSaving(true);
    try {
      await saveBranchDetail(modal.id, changes);
      if (changes.branch_name !== undefined) {
        setBranches((prev) => prev.map((b) => b.id === modal.id ? { ...b, name: d.branch_name } : b));
      }
      setSaving(false);
      editRequest.current = null;
      setModal(null);
    } catch (e: any) {
      setError(e.message || 'Failed to update branch');
      setSaving(false);
    }
  };

  const isEdit = modal?.mode === 'edit';
  const formReady = modal?.mode === 'add' || (isEdit && original !== null);

  return (
    <>
      <div className="flex justify-end mb-4">
        <button className="bg-[#EAB308] text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer" onClick={openAdd}>+ Add Branch</button>
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-[1000]" onClick={closeModal}>
          <div className="bg-white rounded-lg overflow-hidden w-[90%] shadow-[0_20px_60px_rgba(0,0,0,0.15)] max-w-[560px]" onClick={(e) => e.stopPropagation()}>
            <div className="bg-[#1A1A1A] text-white px-5 py-3 flex justify-between items-center">
              <span className="font-semibold text-sm">{isEdit ? 'Edit Branch' : 'Add New Branch'}</span>
              <button className="bg-transparent border-none text-gray-400 text-xl cursor-pointer leading-none" onClick={closeModal}>&times;</button>
            </div>
            <div className="p-5">
              {loading && <p className="text-xs text-gray-400">Loading branch…</p>}
              {formReady && <BranchFields value={detail} onChange={setDetail} />}
              {error && <p className="text-red-500 text-xs mt-3">{error}</p>}
              <div className="flex justify-end gap-3 mt-4">
                <button className="text-gray-500 text-[13px] cursor-pointer bg-transparent border-none" onClick={closeModal} disabled={saving}>Cancel</button>
                {formReady && (
                  <button className="bg-[#EAB308] text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer disabled:opacity-60" onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving…' : isEdit ? 'Save' : 'Add Branch'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-[#FAFAFA]">
              <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left">Branch Name</th>
              <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-center w-[120px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {branches.map((b) => (
              <tr key={b.id} className="border-t border-gray-200 hover:bg-[#FFFAF7]">
                <td className="px-4 py-2.5 text-[13px] font-medium">{b.name}</td>
                <td className="px-4 py-2.5 text-center whitespace-nowrap">
                  <button className="text-gray-500 text-xs cursor-pointer bg-transparent border-none hover:text-[#EAB308]" onClick={() => openEdit(b.id)}>Edit</button>
                </td>
              </tr>
            ))}
            {branches.length === 0 && (
              <tr><td colSpan={2} className="p-8 text-center text-gray-400 text-sm">No branches found</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-4 mb-8 text-center">{branches.length} branch{branches.length !== 1 ? 'es' : ''} total</p>
    </>
  );
}
