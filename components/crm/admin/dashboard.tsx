'use client';

import { addUser, fetchBranchList, fetchUsers, updateUser, updateUserBranches } from '../../../lib/api';
import { AppUser, Branch } from '../../../types/crm';
import { BranchManager } from './branches';
import { SITE_AUDIT_ROLES } from '../constants/crm';
import { BranchAccessDropdown, PermissionChecklist, RoleSelect } from './permissions';
import { defaultPermissionsForRole, roleLabel } from '../utils/crm';
import { isSiteAuditOversightRole, siteAuditRoleFromPermissions, upsertSiteAuditProfile } from '@/components/site-audit/shared';
import { Fragment, useEffect, useState } from 'react';

export function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'users' | 'branches'>('users');
  const [users, setUsers] = useState<AppUser[]>([]);
  const [branchList, setBranchList] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState('sales');
  const [newPermissions, setNewPermissions] = useState<string[]>(() => defaultPermissionsForRole('sales'));
  const [error, setError] = useState('');
  const [editId, setEditId] = useState<string | number | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editBranches, setEditBranches] = useState<string[]>([]);
  const [editPermissions, setEditPermissions] = useState<string[]>([]);
  const [usersPage, setUsersPage] = useState(1);
  const [userSearch, setUserSearch] = useState('');
  const USERS_PER_PAGE = 20;
  useEffect(() => {
    Promise.all([fetchUsers(), fetchBranchList().catch(() => [])]).then(([userData, branchData]) => {
      setUsers(userData);
      setBranchList(branchData);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const handleAdd = async () => {
    if (!newName.trim() || !newPhone.trim()) { setError('Name and phone are required'); return; }
    if (!/^\d{10}$/.test(newPhone.trim())) { setError('Phone must be 10 digits'); return; }
    if (users.some((u) => u.phone === newPhone.trim())) { setError('Phone already exists'); return; }
    const siteAuditRole = siteAuditRoleFromPermissions(newPermissions);

    if (siteAuditRole && !isSiteAuditOversightRole(siteAuditRole) && !newEmail.trim()) { setError('Email is required for a Site Audit role (Business Manager, Site Auditor, etc.)'); return; }
    setError('');
    try {
      const user = await addUser({ name: newName.trim(), phone: newPhone.trim(), role: newRole, individualPermissions: newPermissions });
      setUsers((prev) => [...prev, user]);

      if (siteAuditRole) {
        upsertSiteAuditProfile({ name: newName.trim(), email: newEmail.trim(), phone: newPhone.trim(), role: siteAuditRole })
          .catch((e) => console.error('[AdminDashboard] Site Audit profile sync failed', e));
      }
      setNewName(''); setNewPhone(''); setNewEmail(''); setNewRole('sales'); setNewPermissions([]);
    } catch (e: any) {
      setError(e.message || 'Failed to add user');
    }
  };

  const startEdit = (u: AppUser) => {
    setEditId(u.id); setEditName(u.name); setEditPhone(u.phone); setEditEmail(''); setEditRole(u.role); setEditBranches(u.allowedBranches || []);
    setEditPermissions(u.individualPermissions?.length ? u.individualPermissions : defaultPermissionsForRole(u.role));
  };

  const handleSaveEdit = async () => {
    if (!editName.trim() || !editPhone.trim()) { setError('Name and phone are required'); return; }
    if (!/^\d{10}$/.test(editPhone.trim())) { setError('Phone must be 10 digits'); return; }
    if (users.some((u) => u.phone === editPhone.trim() && u.id !== editId)) { setError('Phone already exists'); return; }
    setError('');
    try {
      await updateUser(editId!, { name: editName.trim(), phone: editPhone.trim(), role: editRole, individualPermissions: editPermissions });
      await updateUserBranches(editId!, editBranches);
      setUsers((prev) => prev.map((u) => u.id === editId ? { ...u, name: editName.trim(), phone: editPhone.trim(), role: editRole, allowedBranches: editBranches, individualPermissions: editPermissions } : u));

      const siteAuditRole = siteAuditRoleFromPermissions(editPermissions);
      if (siteAuditRole && editEmail.trim()) {
        upsertSiteAuditProfile({ name: editName.trim(), email: editEmail.trim(), phone: editPhone.trim(), role: siteAuditRole })
          .catch((e) => console.error('[AdminDashboard] Site Audit profile sync failed', e));
      }
      setEditId(null);
    } catch (e: any) {
      setError(e.message || 'Failed to update user');
    }
  };

  const filteredUsers = userSearch.trim()
    ? users.filter((u) => {
        const q = userSearch.trim().toLowerCase();
        return u.name.toLowerCase().includes(q) || u.phone.includes(q);
      })
    : users;

  const tabs = [
    { key: 'users' as const, label: 'Users' },
    { key: 'branches' as const, label: 'Branches' },
  ];

  return (
    <div className="bg-[#FAFAFA] flex flex-col">
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto w-full px-6 flex gap-0">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3 text-[13px] font-semibold border-b-2 cursor-pointer bg-transparent ${activeTab === tab.key ? 'border-[#EAB308] text-gray-800' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full px-6 py-8">
        {activeTab === 'users' && (
          <>
            <h1 className="text-lg font-bold text-gray-800 mb-6">User Management</h1>

            <div className="bg-white rounded-lg border border-gray-200 p-5 mb-6">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-4">Add New User</h2>
              <div className="flex gap-3 items-end flex-wrap">
                <div className="flex-1 min-w-[150px]">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Name</label>
                  <input className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Full name" />
                </div>
                <div className="w-[140px]">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Phone</label>
                  <input className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-mono w-full text-center" value={newPhone} onChange={(e) => setNewPhone(e.target.value.replace(/\D/g, ''))} placeholder="9876543210" maxLength={10} />
                </div>
                <div className="flex-1 min-w-[170px]">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Email (for Site Audit roles)</label>
                  <input type="email" className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="name@materialdepot.com" />
                </div>
                <div className="w-[130px]">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-1">Role</label>
                  <RoleSelect
                    className="px-2.5 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full"
                    value={newRole}
                    onChange={(role) => { setNewRole(role); setNewPermissions(defaultPermissionsForRole(role)); }}
                  />
                </div>
                <div className="w-[220px]">
                  <PermissionChecklist value={newPermissions} onChange={setNewPermissions} />
                </div>
                <button className="bg-[#EAB308] text-white border-none px-5 py-2 rounded-md text-[13px] font-semibold cursor-pointer" onClick={handleAdd}>Add User</button>
              </div>
              {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
            </div>

            <div className="mb-3">
              <input
                className="px-3 py-2 text-[13px] border border-gray-200 rounded-md outline-none font-sans w-full max-w-xs"
                placeholder="Search by name or phone..."
                value={userSearch}
                onChange={(e) => { setUserSearch(e.target.value); setUsersPage(1); }}
              />
            </div>

            <div className="bg-white rounded-lg border border-gray-200 overflow-visible">
              {loading ? (
                <div className="p-8 text-center text-gray-400 text-sm">Loading users...</div>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-[#FAFAFA]">
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left">Name</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left">Phone</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left">Role</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left">Branch Access</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-left">CRM Permissions</th>
                      <th className="px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.slice((usersPage - 1) * USERS_PER_PAGE, usersPage * USERS_PER_PAGE).map((u) => (
                      <Fragment key={u.id}>
                      <tr className="border-t border-gray-200 hover:bg-[#FFFAF7]">
                        {editId === u.id ? (
                          <>
                            <td className="px-4 py-2"><input className="px-2 py-1 text-[13px] border border-gray-200 rounded outline-none w-full" value={editName} onChange={(e) => setEditName(e.target.value)} /></td>
                            <td className="px-4 py-2"><input className="px-2 py-1 text-[13px] border border-gray-200 rounded outline-none font-mono w-full text-center" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} maxLength={10} /></td>
                            <td className="px-4 py-2">
                              <RoleSelect
                                className="px-2 py-1 text-[13px] border border-gray-200 rounded outline-none w-full"
                                value={editRole}
                                onChange={(role) => { setEditRole(role); setEditPermissions(defaultPermissionsForRole(role)); }}
                              />
                            </td>
                            <td className="px-4 py-2 min-w-[180px]">
                              <BranchAccessDropdown branchList={branchList} value={editBranches} onChange={setEditBranches} hideLabel />
                            </td>
                            <td className="px-4 py-2 min-w-[180px]">
                              <PermissionChecklist value={editPermissions} onChange={setEditPermissions} hideLabel />
                              {siteAuditRoleFromPermissions(editPermissions) ? (
                                <input
                                  type="email"
                                  className="mt-1.5 px-2 py-1 text-[11.5px] border border-gray-200 rounded outline-none w-full"
                                  value={editEmail}
                                  onChange={(e) => setEditEmail(e.target.value)}
                                  placeholder="email to (re)link Site Audit profile"
                                />
                              ) : null}
                            </td>
                            <td className="px-4 py-2 text-center whitespace-nowrap">
                              <button className="text-[#EAB308] text-xs font-semibold cursor-pointer bg-transparent border-none mr-2" onClick={handleSaveEdit}>Save</button>
                              <button className="text-gray-400 text-xs cursor-pointer bg-transparent border-none" onClick={() => setEditId(null)}>Cancel</button>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-2.5 text-[13px] font-medium">{u.name}</td>
                            <td className="px-4 py-2.5 text-[13px] font-mono">{u.phone}</td>
                            <td className="px-4 py-2.5">
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' : u.role === 'tech' ? 'bg-cyan-100 text-cyan-700' : u.role === 'manager' ? 'bg-blue-100 text-blue-700' : u.role === 'retail' ? 'bg-teal-100 text-teal-700' : u.role === 'sales' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                                {roleLabel(u.role)}
                              </span>
                            </td>
                            <td className="px-4 py-2.5">
                              {(u.allowedBranches || []).length === 0
                                ? <span className="text-[11px] text-gray-400">All branches</span>
                                : <div className="flex flex-wrap gap-1">{(u.allowedBranches!).map((b) => <span key={b} className="text-[11px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">{b}</span>)}</div>
                              }
                            </td>
                            <td className="px-4 py-2.5">
                              {(u.individualPermissions || []).length === 0
                                ? <span className="text-[11px] text-gray-400">Role-based</span>
                                : <span className="text-[11px] text-gray-600">{u.individualPermissions!.length} set</span>
                              }

                              {(u.individualPermissions || []).length > 0 && SITE_AUDIT_ROLES.has(u.role ?? '') && !u.individualPermissions!.includes('crm.site_audit')
                                ? <div className="mt-0.5 text-[10.5px] font-semibold text-amber-700">⚠ Missing Site Audit</div>
                                : null
                              }
                            </td>
                            <td className="px-4 py-2.5 text-center whitespace-nowrap">
                              <button className="text-gray-500 text-xs cursor-pointer bg-transparent border-none hover:text-[#EAB308]" onClick={() => startEdit(u)}>Edit</button>
                            </td>
                          </>
                        )}
                      </tr>
                      </Fragment>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan={6} className="p-8 text-center text-gray-400 text-sm">No users found</td></tr>
                    )}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex items-center justify-between mt-4">
              <p className="text-xs text-gray-400">{filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}{userSearch.trim() ? ` matching "${userSearch.trim()}"` : ' total'}</p>
              {filteredUsers.length > USERS_PER_PAGE && (
                <div className="flex items-center gap-2">
                  <button disabled={usersPage === 1} onClick={() => setUsersPage(p => p - 1)} className="px-3 py-1 text-[12px] border border-gray-200 rounded text-gray-500 disabled:opacity-40 cursor-pointer bg-white hover:border-[#EAB308]">Prev</button>
                  <span className="text-[12px] text-gray-500">{usersPage} / {Math.ceil(filteredUsers.length / USERS_PER_PAGE)}</span>
                  <button disabled={usersPage >= Math.ceil(filteredUsers.length / USERS_PER_PAGE)} onClick={() => setUsersPage(p => p + 1)} className="px-3 py-1 text-[12px] border border-gray-200 rounded text-gray-500 disabled:opacity-40 cursor-pointer bg-white hover:border-[#EAB308]">Next</button>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'branches' && (
          <>
            <h1 className="text-lg font-bold text-gray-800 mb-6">Branch Management</h1>
            <BranchManager branches={branchList} setBranches={setBranchList} />
          </>
        )}

      </div>
    </div>
  );
}
