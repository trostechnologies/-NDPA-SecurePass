/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AppUser } from '../../types/visitor';
import { NDPA_ORGANIZATION_INFO } from '../../utils/ndpaCompliance';
import {
  Lock,
  Mail,
  ShieldCheck,
  ArrowRight,
  AlertCircle,
  Eye,
  EyeOff,
  UserCheck,
  Building,
  KeyRound,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';

interface LoginPageProps {
  users: AppUser[];
  onLoginSuccess: (user: AppUser) => void;
  onCancelToKiosk: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  users,
  onLoginSuccess,
  onCancelToKiosk,
}) => {
  const [email, setEmail] = useState<string>('admin@zenithholdings.ng');
  const [password, setPassword] = useState<string>('password123');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const user = users.find(
      (u) => u.email.toLowerCase() === email.trim().toLowerCase()
    );

    if (!user) {
      setError('Invalid credentials. User email not registered in the system.');
      return;
    }

    if (user.status === 'suspended') {
      setError('This user profile is currently suspended. Please contact the Facility Administrator.');
      return;
    }

    // Check password (simple check for demo/mock auth)
    if (password !== user.password && password !== 'password123') {
      setError('Incorrect password. Please try again or use the 1-click demo profiles below.');
      return;
    }

    // Record login
    const updatedUser: AppUser = {
      ...user,
      lastLogin: new Date().toISOString(),
    };

    onLoginSuccess(updatedUser);
  };

  const handleQuickLogin = (demoUser: AppUser) => {
    setEmail(demoUser.email);
    setPassword(demoUser.password || 'password123');
    onLoginSuccess({
      ...demoUser,
      lastLogin: new Date().toISOString(),
    });
  };

  return (
    <div className="max-w-xl mx-auto py-4 space-y-6 animate-in fade-in zoom-in-95 duration-200">
      {/* Return to Kiosk Top Bar */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onCancelToKiosk}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Return to Public Visitor Kiosk
        </button>
        <span className="text-[11px] font-mono text-emerald-400">
          RBAC · ACCESS CONTROL
        </span>
      </div>

      {/* Main Login Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="space-y-1.5 text-center">
          <div className="w-12 h-12 rounded-2xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto mb-2 shadow-inner">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            SecurePass Enterprise Login
          </h2>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            Role-Based Access Control for Facility Administrators and Staff members.
          </p>
        </div>

        {/* Error Notice */}
        {error && (
          <div className="p-3 bg-rose-950/50 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-start gap-2 animate-in fade-in">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-medium text-slate-300 mb-1.5">
              Enterprise Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@zenithholdings.ng"
                className="w-full pl-9 pr-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block font-medium text-slate-300">
                Password
              </label>
              <span className="text-[11px] text-slate-500">Default demo: password123</span>
            </div>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-9 pr-10 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="p-1.5 text-slate-500 hover:text-slate-300 absolute right-2.5 top-2"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full h-11 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-transform active:scale-[0.98] shadow-lg shadow-emerald-500/10"
          >
            <span>Authenticate Session</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* 1-Click Demo Profiles */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              1-Click Demo Role Accounts
            </span>
            <span className="text-[10px] text-slate-500 font-mono">SELECT TO TEST RBAC</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {users.slice(0, 4).map((u) => {
              const isAdmin = u.role === 'admin';
              return (
                <div
                  key={u.id}
                  onClick={() => handleQuickLogin(u)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    isAdmin
                      ? 'bg-slate-950 hover:bg-emerald-950/20 border-slate-800 hover:border-emerald-500/50'
                      : 'bg-slate-950 hover:bg-sky-950/20 border-slate-800 hover:border-sky-500/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[9px] font-mono font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border ${
                        isAdmin
                          ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                          : 'bg-sky-950 text-sky-300 border-sky-800'
                      }`}
                    >
                      {isAdmin ? 'ADMIN (FULL ACCESS)' : 'STAFF (INVITES ONLY)'}
                    </span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-200 mt-1 truncate">{u.name}</h4>
                  <p className="text-[10px] text-slate-400 truncate">{u.title}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Role Permissions Legend */}
        <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-2xl text-[11px] text-slate-400 space-y-1.5">
          <div className="font-semibold text-slate-300 text-xs">Role Permissions Architecture:</div>
          <div className="flex items-start gap-1.5">
            <strong className="text-emerald-400 flex-shrink-0">Admin:</strong>
            <span>Unrestricted access to all areas (Access Logs, Compliance, Emergency Muster, User Profiles, Guest Invites).</span>
          </div>
          <div className="flex items-start gap-1.5">
            <strong className="text-sky-400 flex-shrink-0">Staff:</strong>
            <span>Restricted strictly to the &quot;Guest Invitations&quot; portal to schedule visitors in advance. Blocked from administrative records.</span>
          </div>
        </div>
      </div>
    </div>
  );
};
