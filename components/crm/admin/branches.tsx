'use client';

import { addBranch, updateBranch } from '../../../lib/api';
import { useState } from 'react';

import { BranchManagerProps } from '../types/crm';

export function BranchManager({ branches, setBranches }: BranchManagerProps) {
  const [newBranch, setNewBranch] = useState('');
  const [editBranchId, setEditBranchId] = useState<string | number | null>(null);
  const [editBranchName, setEditBranchName] = useState('');
  const [branchError, setBranchError] = useState('');

  const handleAddBranch = async () => {
    const name = newBranch.trim();
    if (!name) { setBranchError('Branch name is required'); return; }
    if (branches.some((b) => b.name.toLowerCase() === name.toLowerCase())) { setBranchError('Branch already exists'); return; }
    setBranchError('');
    try {
      const b = await addBranch(name);
      setBranches((prev) => [...prev, b]);
      setNewBranch('');
    } catch (e: any) {
      setBranchError(e.message || 'Failed to add branch');
    }
  };

  const handleSaveBranch = async () => {
    const name = editBranchName.trim();
    if (!name) { setBranchError('Branch name is required'); return; }
    if (branches.some((b) => b.name.toLowerCase() === name.toLowerCase() && b.id !== editBranchId)) { setBranchError('Branch already exists'); return; }
    setBranchError('');
    try {
      await updateBranch(editBranchId!, name);
      setBranches((prev) => prev.map((b) => b.id === editBranchId ? { ...b, name } : b));
      setEditBranchId(null);
    } catch (e: any) {
      setBranchError(e.message || 'Failed to update branch');
    }
  };

  return (
    <>
      <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">Add New Branch</h2>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Branch Name</label>
            <input className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} placeholder="e.g. Koramangala" onKeyDown={(e) => { if (e.key === 'Enter') handleAddBranch(); }} />
          </div>
          <button className="bg-[#EAB308] text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer" onClick={handleAddBranch}>Add Branch</button>
        </div>
        {branchError && <p className="text-red-500 text-xs mt-2">{branchError}</p>}
      </div>

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
                {editBranchId === b.id ? (
                  <>
                    <td className="px-4 py-2"><input className="px-2 py-1 text-[13px] border border-gray-200 rounded outline-none w-full" value={editBranchName} onChange={(e) => setEditBranchName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSaveBranch(); }} autoFocus /></td>
                    <td className="px-4 py-2 text-center whitespace-nowrap">
                      <button className="text-[#EAB308] text-xs font-semibold cursor-pointer bg-transparent border-none mr-2" onClick={handleSaveBranch}>Save</button>
                      <button className="text-gray-400 text-xs cursor-pointer bg-transparent border-none" onClick={() => setEditBranchId(null)}>Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-2.5 text-[13px] font-medium">{b.name}</td>
                    <td className="px-4 py-2.5 text-center whitespace-nowrap">
                      <button className="text-gray-500 text-xs cursor-pointer bg-transparent border-none hover:text-[#EAB308]" onClick={() => { setEditBranchId(b.id); setEditBranchName(b.name); setBranchError(''); }}>Edit</button>
                    </td>
                  </>
                )}
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
