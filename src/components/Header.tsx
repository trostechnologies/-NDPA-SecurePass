/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AppUser } from '../types/visitor';
import { LogIn, LogOut, User, ShieldCheck, Lock } from 'lucide-react';

export type AppTab =
  | 'kiosk'
  | 'mobile'
  | 'login'
  | 'access_logs'
  | 'compliance'
  | 'invitations'
  | 'muster'
  | 'users';

interface HeaderProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  currentUser: AppUser | null;
  onLogout: () => void;
  onOpenReceptionQR: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  currentUser,
  onLogout,
  onOpenReceptionQR,
}) => {
  const isAdmin = currentUser?.role === 'admin';
  const isStaff = currentUser?.role === 'staff';

  return (
    <header className="flex items-center justify-between gap-8 px-6 py-4 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md sticky top-0 z-40">
      {/* Zone 1: Brand wordmark (single text element) */}
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          if (isStaff) {
            setActiveTab('invitations');
          } else {
            setActiveTab('kiosk');
          }
        }}
        className="text-lg font-bold tracking-tight text-white whitespace-nowrap shrink-0"
      >
        SecurePass NDPA
      </a>

      {/* Zone 2: 4-5 concise single-line navigation links based on RBAC role */}
      <nav className="hidden lg:flex items-center gap-6 text-xs font-medium text-slate-400">
        {/* PUBLIC / VISITOR VIEW */}
        {!currentUser && (
          <>
            <button
              type="button"
              onClick={() => setActiveTab('kiosk')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'kiosk' ? 'text-emerald-400 font-semibold' : ''
              }`}
            >
              Visitor Kiosk
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('mobile')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'mobile' ? 'text-emerald-400 font-semibold' : ''
              }`}
            >
              Mobile Self Check-In
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('login')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'login' ? 'text-emerald-400 font-semibold' : ''
              }`}
            >
              Staff &amp; Admin Sign In
            </button>
          </>
        )}

        {/* STAFF MEMBER VIEW (Restricted to Guest Invitations) */}
        {isStaff && (
          <>
            <button
              type="button"
              onClick={() => setActiveTab('invitations')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'invitations' ? 'text-sky-400 font-semibold' : ''
              }`}
            >
              Guest Invitations
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('kiosk')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'kiosk' ? 'text-slate-300 font-medium' : ''
              }`}
            >
              Visitor Kiosk Preview
            </button>
          </>
        )}

        {/* ADMINISTRATOR VIEW (Full Access to all areas + User Profiles) */}
        {isAdmin && (
          <>
            <button
              type="button"
              onClick={() => setActiveTab('kiosk')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'kiosk' ? 'text-emerald-400 font-semibold' : ''
              }`}
            >
              Visitor Kiosk
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('access_logs')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'access_logs' ? 'text-emerald-400 font-semibold' : ''
              }`}
            >
              Live Access Logs
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('compliance')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'compliance' ? 'text-emerald-400 font-semibold' : ''
              }`}
            >
              NDPA Compliance Hub
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('invitations')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'invitations' ? 'text-emerald-400 font-semibold' : ''
              }`}
            >
              Guest Invitations
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('muster')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'muster' ? 'text-emerald-400 font-semibold' : ''
              }`}
            >
              Emergency Muster
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('users')}
              className={`hover:text-white transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'users' ? 'text-emerald-400 font-semibold' : ''
              }`}
            >
              User Management
            </button>
          </>
        )}
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="flex items-center gap-3 shrink-0">
        {currentUser ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl">
              <div className="w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 text-[10px] font-bold">
                {currentUser.name[0]}
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-xs font-semibold text-slate-200 leading-none">
                  {currentUser.name}
                </div>
                <div className="text-[10px] font-mono text-emerald-400 mt-0.5 leading-none">
                  {isAdmin ? 'ADMIN' : 'STAFF (INVITES ONLY)'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-100 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl transition-colors whitespace-nowrap"
              title="Sign Out"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenReceptionQR}
              className="hidden sm:inline-flex px-3 py-2 text-xs font-medium text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors whitespace-nowrap"
            >
              Reception QR
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('login')}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors whitespace-nowrap shadow-sm"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Staff Login</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
