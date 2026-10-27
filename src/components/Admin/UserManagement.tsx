/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AppUser, UserRole } from '../../types/visitor';
import {
  Users,
  UserPlus,
  Search,
  Shield,
  ShieldCheck,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  KeyRound,
  X,
  Lock,
  Building,
  User,
  AlertTriangle,
} from 'lucide-react';

interface UserManagementProps {
  users: AppUser[];
  currentUser: AppUser | null;
  onCreateUser: (newUser: AppUser) => void;
  onUpdateUser: (updatedUser: AppUser) => void;
  onDeleteUser: (userId: string) => void;
}

export const UserManagement: React.FC<UserManagementProps> = ({
  users,
  currentUser,
  onCreateUser,
  onUpdateUser,
  onDeleteUser,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // Form state for Create/Edit
  const [formName, setFormName] = useState<string>('');
  const [formEmail, setFormEmail] = useState<string>('');
  const [formPassword, setFormPassword] = useState<string>('password123');
  const [formRole, setFormRole] = useState<UserRole>('staff');
  const [formDepartment, setFormDepartment] = useState<string>('Corporate Services');
  const [formTitle, setFormTitle] = useState<string>('Executive Host');
  const [formStatus, setFormStatus] = useState<'active' | 'suspended'>('active');

  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.department.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.title.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = roleFilter === 'all' || u.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  const adminCount = users.filter((u) => u.role === 'admin').length;
  const staffCount = users.filter((u) => u.role === 'staff').length;

  const handleOpenCreate = () => {
    setFormName('');
    setFormEmail('');
    setFormPassword('password123');
    setFormRole('staff');
    setFormDepartment('Corporate Services');
    setFormTitle('Executive Host');
    setFormStatus('active');
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (user: AppUser) => {
    setEditingUser(user);
    setFormName(user.name);
    setFormEmail(user.email);
    setFormRole(user.role);
    setFormDepartment(user.department);
    setFormTitle(user.title);
    setFormStatus(user.status);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName || !formEmail) {
      alert('Please fill in user name and email.');
      return;
    }

    const newUser: AppUser = {
      id: `USR-${Date.now()}`,
      name: formName.trim(),
      email: formEmail.trim().toLowerCase(),
      password: formPassword || 'password123',
      role: formRole,
      department: formDepartment.trim(),
      title: formTitle.trim(),
      status: formStatus,
      createdAt: new Date().toISOString(),
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    };

    onCreateUser(newUser);
    setIsCreateOpen(false);
  };

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    const updated: AppUser = {
      ...editingUser,
      name: formName.trim(),
      email: formEmail.trim().toLowerCase(),
      role: formRole,
      department: formDepartment.trim(),
      title: formTitle.trim(),
      status: formStatus,
    };

    onUpdateUser(updated);
    setEditingUser(null);
  };

  const confirmDelete = () => {
    if (!deletingUserId) return;
    if (currentUser && currentUser.id === deletingUserId) {
      alert('Security Protection: You cannot delete your own active administrator profile.');
      setDeletingUserId(null);
      return;
    }
    onDeleteUser(deletingUserId);
    setDeletingUserId(null);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
            <ShieldCheck className="w-4 h-4" />
            <span>Role-Based Access Control (RBAC) Governance</span>
          </div>
          <h2 className="text-lg font-bold text-slate-100 tracking-tight mt-0.5">
            Enterprise User Profile Management
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Administer system administrators with full platform privileges, and staff members with access
            restricted strictly to the Guest Invitations portal.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors shadow-sm self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" /> Add New User Profile
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 bg-slate-900 border border-slate-800 rounded-2xl">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by user name, email, department, or title..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400"
          />
        </div>

        {/* Role Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => setRoleFilter('all')}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              roleFilter === 'all'
                ? 'bg-slate-800 text-slate-100 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Accounts ({users.length})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('admin')}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              roleFilter === 'admin'
                ? 'bg-emerald-950/60 text-emerald-300 font-semibold border border-emerald-800 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Administrators ({adminCount})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('staff')}
            className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              roleFilter === 'staff'
                ? 'bg-sky-950/60 text-sky-300 font-semibold border border-sky-800 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Staff (Invites Only) ({staffCount})
          </button>
        </div>
      </div>

      {/* Users Data Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px] font-mono">
              <tr>
                <th className="py-3 px-4">User Profile</th>
                <th className="py-3 px-4">Assigned Role &amp; Access Scope</th>
                <th className="py-3 px-4">Department &amp; Title</th>
                <th className="py-3 px-4">Account Status</th>
                <th className="py-3 px-4">Last Login</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    No user profiles match the selected search or filter.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isAdmin = user.role === 'admin';
                  const isActive = user.status === 'active';
                  const isCurrent = currentUser?.id === user.id;

                  return (
                    <tr
                      key={user.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Name & Avatar */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={user.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                            alt={user.name}
                            className="w-8 h-8 rounded-full object-cover border border-slate-700"
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <div className="font-bold text-slate-100 flex items-center gap-1.5">
                              <span>{user.name}</span>
                              {isCurrent && (
                                <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950 px-1.5 py-0.2 rounded border border-emerald-800">
                                  YOU
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role & Access Scope */}
                      <td className="py-3 px-4">
                        {isAdmin ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-700">
                              <ShieldCheck className="w-3 h-3 text-emerald-400" />
                              ADMINISTRATOR
                            </span>
                            <div className="text-[10px] text-slate-400">
                              Full Unrestricted Access
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-mono font-bold text-sky-300 bg-sky-950/80 px-2 py-0.5 rounded border border-sky-700">
                              <Lock className="w-3 h-3 text-sky-400" />
                              STAFF MEMBER
                            </span>
                            <div className="text-[10px] text-slate-400">
                              Guest Invitations Only
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Department & Title */}
                      <td className="py-3 px-4">
                        <div className="text-slate-200 font-medium">{user.department}</div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                          {user.title}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <span
                          className={`text-[11px] font-semibold uppercase font-mono tracking-wider inline-flex items-center gap-1 ${
                            isActive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isActive ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" /> Active
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3" /> Suspended
                            </>
                          )}
                        </span>
                      </td>

                      {/* Last Login */}
                      <td className="py-3 px-4 font-mono text-[11px] text-slate-400 tabular-nums">
                        {user.lastLogin
                          ? new Date(user.lastLogin).toLocaleString('en-GB', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })
                          : 'Never logged in'}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(user)}
                            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Edit User Profile"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => setDeletingUserId(user.id)}
                            disabled={isCurrent}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isCurrent
                                ? 'text-slate-600 cursor-not-allowed'
                                : 'text-slate-400 hover:text-rose-400 hover:bg-slate-800'
                            }`}
                            title={isCurrent ? 'Cannot delete your own account' : 'Delete User Profile'}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE USER MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                <UserPlus className="w-4 h-4" />
                <span>Create New User Profile</span>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Babatunde Sanusi"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Corporate Email Address *</label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  placeholder="b.sanusi@zenithholdings.ng"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Password *</label>
                <input
                  type="password"
                  required
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Department</label>
                  <input
                    type="text"
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Job Title</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  Assigned RBAC Role &amp; Access Scope *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div
                    onClick={() => setFormRole('staff')}
                    className={`p-3 rounded-xl border cursor-pointer transition-colors ${
                      formRole === 'staff'
                        ? 'bg-sky-950/50 border-sky-500 text-sky-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" /> Staff Member
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Access strictly restricted to Guest Invitations only.
                    </p>
                  </div>

                  <div
                    onClick={() => setFormRole('admin')}
                    className={`p-3 rounded-xl border cursor-pointer transition-colors ${
                      formRole === 'admin'
                        ? 'bg-emerald-950/50 border-emerald-500 text-emerald-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Administrator
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Full access to all areas, logs, compliance, and users.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Account Status</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as 'active' | 'suspended')}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-400"
                >
                  <option value="active">Active (Granted Access)</option>
                  <option value="suspended">Suspended (Blocked Access)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-3.5 py-2 text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold rounded-xl shadow-sm"
                >
                  Create User Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT USER MODAL */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                <Edit2 className="w-4 h-4" />
                <span>Update User Profile: {editingUser.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Department</label>
                  <input
                    type="text"
                    value={formDepartment}
                    onChange={(e) => setFormDepartment(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Job Title</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-slate-300 font-semibold mb-1.5">
                  RBAC Role &amp; Permission Scope
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <div
                    onClick={() => setFormRole('staff')}
                    className={`p-3 rounded-xl border cursor-pointer transition-colors ${
                      formRole === 'staff'
                        ? 'bg-sky-950/50 border-sky-500 text-sky-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center gap-1">
                      <Lock className="w-3.5 h-3.5" /> Staff Member
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Guest Invitations portal only.
                    </p>
                  </div>

                  <div
                    onClick={() => setFormRole('admin')}
                    className={`p-3 rounded-xl border cursor-pointer transition-colors ${
                      formRole === 'admin'
                        ? 'bg-emerald-950/50 border-emerald-500 text-emerald-200'
                        : 'bg-slate-950 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="font-bold text-xs flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5" /> Administrator
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">
                      Full access across all areas.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Account Status</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as 'active' | 'suspended')}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-400"
                >
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-3.5 py-2 text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold rounded-xl shadow-sm"
                >
                  Save Profile Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingUserId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="w-10 h-10 rounded-xl bg-rose-950 border border-rose-800 text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-sm font-bold text-slate-100">Delete User Profile?</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                This action will permanently revoke this user&apos;s authentication credentials and delete their profile.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingUserId(null)}
                className="w-1/2 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="w-1/2 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-colors shadow-sm"
              >
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
