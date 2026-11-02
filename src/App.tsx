import { AccountSecurity } from './components/Auth/AccountSecurity';
import { GovernancePanel } from './components/Admin/GovernancePanel';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { api, jsonBody, receptionProof } from './api';
import { Header } from './components/Header';
import { VisitorKiosk } from './components/Kiosk/VisitorKiosk';
import { LiveAccessLogs } from './components/Admin/LiveAccessLogs';
import { NDPAComplianceHub } from './components/Admin/NDPAComplianceHub';
import { PreRegistrationManager } from './components/Admin/PreRegistrationManager';
import { EmergencyMusterList } from './components/Admin/EmergencyMusterList';
import { NotificationAndAudit } from './components/Admin/NotificationAndAudit';
import { VisitorBadgeModal } from './components/Badge/VisitorBadgeModal';
import { MobileSelfCheckIn } from './components/Mobile/MobileSelfCheckIn';
import { ReceptionQRPosterModal } from './components/Mobile/ReceptionQRPosterModal';
import { LoginPage } from './components/Auth/LoginPage';
import { UserManagement } from './components/Admin/UserManagement';
import { AppTab } from './components/Header';

import {
  Visitor,
  HostEmployee,
  PreRegistrationInvite,
  NDPAAuditLog,
  EmailNotification,
  AppUser,
} from './types/visitor';
import { NDPA_ORGANIZATION_INFO } from './utils/ndpaCompliance';
import { CheckCircle2, AlertCircle, Smartphone, Lock, ShieldAlert } from 'lucide-react';

export default function App() {
  // Check if URL specifies mobile mode (?mode=mobile)
  const isInitialMobile =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('mode') === 'mobile';

  // Authentication & RBAC State
  const [users, setUsers] = useState<AppUser[]>([]);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);

  const [activeTab, setActiveTab] = useState<AppTab>(isInitialMobile ? 'mobile' : 'kiosk');

  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [hosts, setHosts] = useState<HostEmployee[]>([]);
  const [invitations, setInvitations] = useState<PreRegistrationInvite[]>([]);
  const [auditLogs, setAuditLogs] = useState<NDPAAuditLog[]>([]);
  const [notifications, setNotifications] = useState<EmailNotification[]>([]);

  const submission = useRef<{ fingerprint: string; key: string } | null>(null);
  const [pendingInviteCode, setPendingInviteCode] = useState('');
  const [startupError, setStartupError] = useState('');
  const [ready, setReady] = useState(false);
  const loadPrivate = async () => {
    const all = {
      visitors: [] as Visitor[],
      invitations: [] as PreRegistrationInvite[],
      auditLogs: [] as NDPAAuditLog[],
      users: [] as AppUser[],
    };
    for (let offset = 0; offset < 1000000; offset += 500) {
      const page = await api<typeof all>(`/data?offset=${offset}`);
      all.visitors.push(...page.visitors);
      all.invitations.push(...page.invitations);
      all.auditLogs.push(...page.auditLogs);
      if (!offset) all.users = page.users;
      if (Math.max(page.visitors.length, page.invitations.length, page.auditLogs.length) < 500)
        break;
    }
    setVisitors(all.visitors);
    setInvitations(all.invitations);
    setAuditLogs(all.auditLogs);
    setUsers(all.users);
  };
  useEffect(() => {
    (async () => {
      try {
        Object.assign(
          NDPA_ORGANIZATION_INFO,
          await api<Partial<typeof NDPA_ORGANIZATION_INFO>>('/config'),
        );
        const publicHosts = await api<HostEmployee[]>('/hosts');
        setHosts(publicHosts);
        try {
          const session = await api<{ user: AppUser }>('/session');
          setCurrentUser(session.user);
          await loadPrivate();
        } catch {
          setCurrentUser(null);
        }
      } catch (e) {
        setStartupError('SecurePass is unavailable. Contact reception and retry later.');
      } finally {
        setReady(true);
      }
    })();
  }, []);
  const run = async (task: () => Promise<unknown>) => {
    try {
      await task();
    } catch (e) {
      triggerToast(e instanceof Error ? e.message : 'Operation failed');
    }
  };

  // Badge Modal State
  const [badgeVisitor, setBadgeVisitor] = useState<Visitor | null>(null);
  const [isBadgeOpen, setIsBadgeOpen] = useState<boolean>(false);

  // Reception QR Poster Modal State
  const [isQrPosterOpen, setIsQrPosterOpen] = useState<boolean>(false);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Open badge modal
  const handleOpenBadge = (visitor: Visitor) => {
    setBadgeVisitor(visitor);
    setIsBadgeOpen(true);
  };

  // All writes are authorized and persisted by the backend; never trust browser state.
  const handleCheckInComplete = async (visitor: Visitor, inviteCode?: string): Promise<Visitor> => {
    const body = {
      fullName: visitor.fullName,
      email: visitor.email,
      phone: visitor.phone,
      organization: visitor.organization,
      purpose: visitor.purpose,
      hostEmployeeId: visitor.hostEmployeeId,
      generalConsentGranted: visitor.generalConsentGranted,
      noticeVersion: NDPA_ORGANIZATION_INFO.noticeVersion,
      inviteCode,
    };
    const fingerprint = JSON.stringify(body);
    if (submission.current?.fingerprint !== fingerprint)
      submission.current = { fingerprint, key: crypto.randomUUID() };
    const proof = await receptionProof();
    const saved = await api<Visitor>('/checkin', {
      method: 'POST',
      body: jsonBody({ ...body, idempotencyKey: submission.current!.key, proof }),
    });
    submission.current = null;
    setPendingInviteCode('');
    if (currentUser?.role === 'admin') setVisitors((v) => [saved, ...v]);
    triggerToast('Visitor registered.');
    return saved;
  };
  const handleCheckOut = (id: string) => {
    void run(async () => {
      const saved = await api<Visitor>(`/visitors/${encodeURIComponent(id)}/checkout`, {
        method: 'PATCH',
      });
      setVisitors((v) => v.map((x) => (x.id === id ? saved : x)));
      triggerToast('Checkout saved.');
    });
  };
  const handleErasureRequest = (visitorId: string) => {
    void run(async () => {
      await api('/privacy/requests', {
        method: 'POST',
        body: jsonBody({ visitorId, type: 'erase' }),
      });
      triggerToast(
        'Erasure requested. A different administrator must verify identity before deletion.',
      );
    });
  };
  const handleAccessRequest = (visitorId: string) => {
    void run(async () => {
      await api('/privacy/requests', {
        method: 'POST',
        body: jsonBody({ visitorId, type: 'access' }),
      });
      triggerToast(
        'Disclosure requested. A different administrator must verify identity before export.',
      );
    });
  };
  const handleExecuteRetentionPurge = () => {
    void run(async () => {
      await api('/purge', { method: 'POST' });
      await loadPrivate();
      triggerToast('Retention job completed against primary database.');
    });
  };
  const handleCreateInvite = async (
    invite: PreRegistrationInvite,
  ): Promise<PreRegistrationInvite> => {
    const saved = await api<PreRegistrationInvite>('/invitations', {
      method: 'POST',
      body: jsonBody(invite),
    });
    setInvitations((v) => [saved, ...v]);
    triggerToast('Invitation saved. Email delivery is not configured.');
    return saved;
  };

  // Quick Check-in from Invitation code
  const handleQuickCheckInFromInvite = (code: string) => {
    setPendingInviteCode(code);
    setActiveTab('kiosk');
  };

  const handleSendTestNotification = () =>
    triggerToast('Email provider is not configured; no message was sent.');

  // Auth state is derived only from a server-validated session.
  const handleLoginSuccess = (user: AppUser) => {
    setCurrentUser(user);
    void run(async () => {
      await loadPrivate();
      setHosts(await api<HostEmployee[]>('/hosts'));
    });
    setActiveTab(user.role === 'admin' ? 'access_logs' : 'invitations');
  };
  const clearPrivate = () => {
    setCurrentUser(null);
    setUsers([]);
    setVisitors([]);
    setInvitations([]);
    setAuditLogs([]);
    setBadgeVisitor(null);
    setIsBadgeOpen(false);
    setActiveTab('login');
    void api<HostEmployee[]>('/hosts')
      .then(setHosts)
      .catch(() => setHosts([]));
  };
  useEffect(() => {
    const expired = () => {
      if (currentUser) clearPrivate();
    };
    window.addEventListener('securepass:session-expired', expired);
    return () => window.removeEventListener('securepass:session-expired', expired);
  }, [currentUser]);
  useEffect(() => {
    if (!currentUser) return;
    const timer = setInterval(() => {
      void api('/session').catch(() => {});
    }, 60000);
    return () => clearInterval(timer);
  }, [currentUser]);
  const handleLogout = () => {
    void run(async () => {
      await api('/logout', { method: 'POST' });
      clearPrivate();
      setActiveTab('kiosk');
    });
  };
  const handleCreateUser = async (user: AppUser): Promise<void> => {
    const saved = await api<AppUser>('/users', { method: 'POST', body: jsonBody(user) });
    setUsers((v) => [saved, ...v]);
    setHosts(await api<HostEmployee[]>('/hosts'));
    triggerToast('User created.');
  };
  const handleUpdateUser = async (user: AppUser): Promise<void> => {
    const saved = await api<AppUser>(`/users/${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      body: jsonBody(user),
    });
    setUsers((v) => v.map((x) => (x.id === saved.id ? saved : x)));
    setHosts(await api<HostEmployee[]>('/hosts'));
    triggerToast('User updated.');
  };
  const handleDeleteUser = async (id: string): Promise<void> => {
    await api(`/users/${encodeURIComponent(id)}`, { method: 'DELETE' });
    setUsers((v) => v.filter((x) => x.id !== id));
    setHosts(await api<HostEmployee[]>('/hosts'));
    triggerToast('Site membership removed.');
  };

  // RBAC Permission Check
  const isStaffRestricted =
    currentUser?.role === 'staff' &&
    ['access_logs', 'compliance', 'muster', 'users'].includes(activeTab);

  const isUnauthenticatedRestricted =
    !currentUser &&
    ['access_logs', 'compliance', 'muster', 'users', 'invitations'].includes(activeTab);

  if (startupError)
    return (
      <div role="alert" className="p-8 bg-slate-950 text-red-200 min-h-screen">
        {startupError}
      </div>
    );
  if (!ready)
    return (
      <div className="p-8 text-slate-200 bg-slate-950 min-h-screen">Connecting to SecurePass…</div>
    );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Bar Header strictly conforming to contract */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        currentUser={currentUser}
        onLogout={handleLogout}
        onOpenReceptionQR={() => setIsQrPosterOpen(true)}
      />

      {/* Main Viewport */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
        {currentUser && <AccountSecurity onSignedOut={clearPrivate} />}
        {['kiosk', 'mobile'].includes(activeTab) && (
          <section
            aria-label="Facility privacy notice"
            className="p-4 rounded-xl border border-slate-800 text-sm space-y-2"
          >
            <h2 className="font-semibold">{NDPA_ORGANIZATION_INFO.companyName} · Privacy notice</h2>
            <p>{NDPA_ORGANIZATION_INFO.privacyNoticeText}</p>
            <p>
              Contact: {NDPA_ORGANIZATION_INFO.dpoEmail || 'Reception'}. Version:{' '}
              {NDPA_ORGANIZATION_INFO.noticeVersion}. Retention:{' '}
              {NDPA_ORGANIZATION_INFO.dataRetentionDays} days.
            </p>
          </section>
        )}
        {/* Toast Alert */}
        {toastMessage && (
          <div className="p-3.5 bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 text-xs font-medium rounded-xl flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span>{toastMessage}</span>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="text-emerald-400 hover:text-emerald-200 text-xs ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ACCESS DENIED: STAFF ROLE RESTRICTION GUARD */}
        {isStaffRestricted && (
          <div className="max-w-xl mx-auto py-12 text-center space-y-4 bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl animate-in fade-in">
            <div className="w-12 h-12 rounded-2xl bg-amber-950/80 border border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div className="space-y-1.5">
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-amber-400 bg-amber-950 px-2 py-0.5 rounded border border-amber-800">
                ROLE RESTRICTION ENFORCED
              </span>
              <h2 className="text-xl font-bold text-white tracking-tight">
                Staff Access Restricted
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed max-w-md mx-auto">
                Staff accounts are granted role-based access{' '}
                <strong>exclusively to the Guest Invitations portal</strong> to invite visitors in
                advance. Administrative access logs, NDPA compliance dossiers, emergency muster
                roll-calls, and user management require an Administrator profile.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setActiveTab('invitations')}
                className="px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors shadow-sm"
              >
                Go to Guest Invitations Portal
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('login')}
                className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
              >
                Sign In as Administrator
              </button>
            </div>
          </div>
        )}

        {/* ACCESS DENIED: UNAUTHENTICATED GUARD */}
        {isUnauthenticatedRestricted && (
          <LoginPage
            users={users}
            onLoginSuccess={handleLoginSuccess}
            onCancelToKiosk={() => setActiveTab('kiosk')}
          />
        )}

        {/* Tab: LOGIN PAGE */}
        {activeTab === 'login' && !isUnauthenticatedRestricted && (
          <LoginPage
            users={users}
            onLoginSuccess={handleLoginSuccess}
            onCancelToKiosk={() => setActiveTab('kiosk')}
          />
        )}

        {/* Tab 1: Visitor Kiosk */}
        {activeTab === 'kiosk' && (
          <div className="space-y-4">
            {/* Unobtrusive Touchless Mobile QR Banner */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3.5 bg-emerald-950/20 border border-emerald-800/40 rounded-xl text-xs">
              <div className="flex items-center gap-2 text-emerald-300">
                <Smartphone className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                <span>
                  <strong>Prefer touchless self check-in?</strong> Scan the reception QR standee
                  with your smartphone camera to register on your phone.
                </span>
              </div>
              <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setIsQrPosterOpen(true)}
                  className="px-3 py-1.5 bg-emerald-400 text-slate-950 font-semibold rounded-lg hover:bg-emerald-300 transition-colors shadow-sm"
                >
                  View QR Standee
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('mobile')}
                  className="px-3 py-1.5 bg-slate-800 text-slate-200 font-medium rounded-lg hover:bg-slate-700 transition-colors"
                >
                  Open Mobile Page
                </button>
              </div>
            </div>

            <VisitorKiosk
              hosts={hosts}
              invitations={invitations}
              onCheckInComplete={handleCheckInComplete}
              onOpenBadge={handleOpenBadge}
              initialInviteCode={pendingInviteCode}
            />
          </div>
        )}

        {/* Tab 2: Mobile Self Check-In Page */}
        {activeTab === 'mobile' && (
          <MobileSelfCheckIn
            hosts={hosts}
            invitations={invitations}
            onCheckInComplete={handleCheckInComplete}
            onExitMobileView={() => setActiveTab('kiosk')}
          />
        )}

        {/* Tab 3: Live Access Logs (Admin Only) */}
        {activeTab === 'access_logs' && !isStaffRestricted && !isUnauthenticatedRestricted && (
          <LiveAccessLogs
            visitors={visitors}
            onCheckOut={handleCheckOut}
            onPrintBadge={handleOpenBadge}
            onErasureRequest={handleErasureRequest}
          />
        )}

        {/* Tab 4: NDPA Compliance Hub (Admin Only) */}
        {activeTab === 'compliance' && !isStaffRestricted && !isUnauthenticatedRestricted && (
          <div className="space-y-8">
            <NDPAComplianceHub
              visitors={visitors}
              auditLogs={auditLogs}
              onRequestAccess={handleAccessRequest}
              onExecuteRetentionPurge={handleExecuteRetentionPurge}
              onErasureRequest={handleErasureRequest}
            />
            <div className="pt-6 border-t border-slate-900">
              <NotificationAndAudit
                notifications={notifications}
                auditLogs={auditLogs}
                onSendTestNotification={handleSendTestNotification}
              />
            </div>
          </div>
        )}

        {currentUser?.role === 'admin' && ['compliance', 'access_logs'].includes(activeTab) && (
          <GovernancePanel visitors={visitors} userId={currentUser.id} onChanged={loadPrivate} />
        )}

        {/* Tab 5: Guest Invitations (Admin & Staff) */}
        {activeTab === 'invitations' && !isUnauthenticatedRestricted && (
          <PreRegistrationManager
            invitations={invitations}
            hosts={
              currentUser?.role === 'staff'
                ? hosts.filter((h) => h.userId === currentUser.id)
                : hosts
            }
            onCreateInvite={handleCreateInvite}
            onQuickCheckIn={handleQuickCheckInFromInvite}
          />
        )}

        {/* Tab 6: Emergency Evacuation Muster List (Admin Only) */}
        {activeTab === 'muster' && !isStaffRestricted && !isUnauthenticatedRestricted && (
          <EmergencyMusterList visitors={visitors} />
        )}

        {/* Tab 7: Enterprise User Profile Management (Admin Only) */}
        {activeTab === 'users' && !isStaffRestricted && !isUnauthenticatedRestricted && (
          <UserManagement
            users={users}
            currentUser={currentUser}
            onCreateUser={handleCreateUser}
            onUpdateUser={handleUpdateUser}
            onDeleteUser={handleDeleteUser}
          />
        )}
      </main>

      {/* Visitor Badge Modal for Printing & Sharing */}
      <VisitorBadgeModal
        visitor={badgeVisitor}
        isOpen={isBadgeOpen}
        onClose={() => setIsBadgeOpen(false)}
      />

      {/* Reception Desk QR Standee Modal */}
      <ReceptionQRPosterModal
        isOpen={isQrPosterOpen}
        onClose={() => setIsQrPosterOpen(false)}
        onOpenMobileView={() => setActiveTab('mobile')}
      />

      {/* Corporate Compliance Footer */}
      <footer className="mt-auto border-t border-slate-900 bg-slate-950 py-6 px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <span className="font-semibold text-slate-400">
              {NDPA_ORGANIZATION_INFO.companyName}
            </span>{' '}
            · {NDPA_ORGANIZATION_INFO.facilityName}
            <div className="text-[11px] text-slate-600 mt-0.5">
              Controller registration (as configured):{' '}
              {NDPA_ORGANIZATION_INFO.ndpcRegistrationNumber}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <span aria-hidden="true" className="text-slate-700">
              ·
            </span>

            <span aria-hidden="true" className="text-slate-700">
              ·
            </span>
            <span>DPO: {NDPA_ORGANIZATION_INFO.dpoName}</span>
            <span aria-hidden="true" className="text-slate-700">
              ·
            </span>
            <a
              href={`mailto:${NDPA_ORGANIZATION_INFO.dpoEmail}`}
              className="text-emerald-400/80 hover:text-emerald-300 transition-colors"
            >
              {NDPA_ORGANIZATION_INFO.dpoEmail}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
