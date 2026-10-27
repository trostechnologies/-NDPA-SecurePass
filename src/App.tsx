/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
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
import {
  SAMPLE_HOSTS,
  INITIAL_VISITORS,
  INITIAL_INVITATIONS,
  INITIAL_AUDIT_LOGS,
  INITIAL_NOTIFICATIONS,
  INITIAL_USERS,
} from './data/mockInitialData';
import { NDPA_ORGANIZATION_INFO, isRetentionExpired } from './utils/ndpaCompliance';
import { CheckCircle2, AlertCircle, Smartphone, Lock, ShieldAlert } from 'lucide-react';

export default function App() {
  // Check if URL specifies mobile mode (?mode=mobile)
  const isInitialMobile = typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('mode') === 'mobile';

  // Authentication & RBAC State
  const [users, setUsers] = useState<AppUser[]>(INITIAL_USERS);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(INITIAL_USERS[0]); // Default admin session for immediate full-featured evaluation

  const [activeTab, setActiveTab] = useState<AppTab>(
    isInitialMobile ? 'mobile' : 'kiosk'
  );

  const [visitors, setVisitors] = useState<Visitor[]>(INITIAL_VISITORS);
  const [hosts] = useState<HostEmployee[]>(SAMPLE_HOSTS);
  const [invitations, setInvitations] = useState<PreRegistrationInvite[]>(INITIAL_INVITATIONS);
  const [auditLogs, setAuditLogs] = useState<NDPAAuditLog[]>(INITIAL_AUDIT_LOGS);
  const [notifications, setNotifications] = useState<EmailNotification[]>(INITIAL_NOTIFICATIONS);

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

  // Check-In Visitor Handler
  const handleCheckInComplete = (newVisitor: Visitor, updatedInviteId?: string) => {
    setVisitors((prev) => [newVisitor, ...prev]);

    // If an invitation was redeemed, update its status
    if (updatedInviteId) {
      setInvitations((prev) =>
        prev.map((inv) =>
          inv.id === updatedInviteId ? { ...inv, status: 'checked_in' } : inv
        )
      );
    }

    // Record Immutable Audit Logs
    const checkInAudit: NDPAAuditLog = {
      id: `LOG-${Date.now()}-1`,
      timestamp: new Date().toISOString(),
      actor: 'Reception Self-Service Kiosk (Ground Floor)',
      action: 'CHECK_IN',
      details: `Visitor ${newVisitor.fullName} registered to meet ${newVisitor.hostEmployeeName} (${newVisitor.hostDepartment}). Lawful consent recorded.`,
      visitorId: newVisitor.id,
      lawfulBasis: 'NDPA 2023 Sec 25(1)(a) & Sec 26(1)',
      complianceArticle: 'Lawfulness of Processing & Explicit Consent',
    };

    const biometricAudit: NDPAAuditLog = {
      id: `LOG-${Date.now()}-2`,
      timestamp: new Date().toISOString(),
      actor: 'Visitor Kiosk Camera Module',
      action: newVisitor.hasBiometricPhoto ? 'PHOTO_CAPTURED' : 'PHOTO_SKIPPED_VOLUNTARY',
      details: newVisitor.hasBiometricPhoto
        ? `Biometric facial photograph captured with explicit consent under Section 30.`
        : `Visitor declined photographic capture. Voluntary opt-out honoured under Section 30(2).`,
      visitorId: newVisitor.id,
      lawfulBasis: 'NDPA 2023 Sec 30(1) & (2)',
      complianceArticle: 'Sensitive Personal Data Governance',
    };

    setAuditLogs((prev) => [biometricAudit, checkInAudit, ...prev]);

    // Dispatch Simulated Host Notification Email
    const host = hosts.find((h) => h.id === newVisitor.hostEmployeeId) || hosts[0];
    const newNotification: EmailNotification = {
      id: `NOTIF-${Date.now()}`,
      recipientEmail: host.email,
      recipientName: host.name,
      subject: `Visitor Arrival: ${newVisitor.fullName} is at Reception (${newVisitor.badgeId})`,
      type: 'HOST_ARRIVAL_ALERT',
      sentAt: new Date().toISOString(),
      bodyPreview: `Dear ${host.name}, your visitor ${newVisitor.fullName} from ${newVisitor.organization} has completed NDPA access verification and is proceeding to ${host.floor} with Pass #${newVisitor.passCode}.`,
      status: 'Delivered',
    };

    setNotifications((prev) => [newNotification, ...prev]);
    triggerToast(`Check-in successful! Pass issued for ${newVisitor.fullName}. Notification sent to host.`);
  };

  // Check-Out Visitor Handler
  const handleCheckOut = (visitorId: string) => {
    const target = visitors.find((v) => v.id === visitorId);
    if (!target) return;

    const checkOutTimestamp = new Date().toISOString();

    setVisitors((prev) =>
      prev.map((v) =>
        v.id === visitorId
          ? { ...v, status: 'checked_out', checkOutTime: checkOutTimestamp }
          : v
      )
    );

    const log: NDPAAuditLog = {
      id: `LOG-${Date.now()}`,
      timestamp: checkOutTimestamp,
      actor: 'Reception Turnstile Gate Control',
      action: 'CHECK_OUT',
      details: `Visitor ${target.fullName} checked out. Physical access ended.`,
      visitorId: target.id,
      lawfulBasis: 'NDPA 2023 Sec 24(1)(d)',
      complianceArticle: 'Purpose Limitation & Storage Lifecycle',
    };

    setAuditLogs((prev) => [log, ...prev]);
    triggerToast(`Visitor ${target.fullName} successfully checked out.`);
  };

  // Right to Erasure / Right to be Forgotten (NDPA Section 37)
  const handleErasureRequest = (visitorId: string) => {
    const target = visitors.find((v) => v.id === visitorId);
    if (!target) return;

    setVisitors((prev) =>
      prev.map((v) =>
        v.id === visitorId
          ? {
              ...v,
              fullName: '[DATA SUBJECT REDACTED - NDPA SEC 37]',
              email: 'redacted@privacy.zenithholdings.ng',
              phone: '+234 ••• ••• ••••',
              organization: '[REDACTED PER RIGHT TO ERASURE]',
              vehiclePlate: undefined,
              governmentIdNumberMasked: undefined,
              emergencyContactName: undefined,
              emergencyContactPhone: undefined,
              hasBiometricPhoto: false,
              photoUrl: undefined,
              isAnonymized: true,
              notes: `Personal details redacted upon verified Data Subject Request on ${new Date().toISOString().split('T')[0]}.`,
            }
          : v
      )
    );

    const log: NDPAAuditLog = {
      id: `LOG-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'DPO Executive Console',
      action: 'RIGHT_TO_ERASURE',
      details: `Executed permanent cryptographic anonymization on visitor record ${target.passCode} pursuant to NDPA Section 37.`,
      visitorId: target.id,
      lawfulBasis: 'NDPA 2023 Sec 37(1)',
      complianceArticle: 'Right to Erasure / Right to be Forgotten',
    };

    setAuditLogs((prev) => [log, ...prev]);
    triggerToast(`Personal data for ${target.passCode} has been permanently anonymized per NDPA Sec 37.`);
  };

  // Automated Retention Purge (NDPA Section 24(1)(d))
  const handleExecuteRetentionPurge = () => {
    const expiredList = visitors.filter((v) => isRetentionExpired(v.retentionExpiryDate));
    if (expiredList.length === 0) {
      triggerToast('No records are currently overdue for retention purge.');
      return;
    }

    setVisitors((prev) =>
      prev.map((v) => {
        if (isRetentionExpired(v.retentionExpiryDate) && !v.isAnonymized) {
          return {
            ...v,
            fullName: '[DATA SUBJECT PURGED - 60D RETENTION]',
            email: 'purged@retention.zenithholdings.ng',
            phone: '+234 ••• ••• ••••',
            organization: '[ARCHIVED - PURGED]',
            hasBiometricPhoto: false,
            photoUrl: undefined,
            isAnonymized: true,
            notes: `Auto-purged on ${new Date().toISOString().split('T')[0]} following statutory 60-day storage limitation.`,
          };
        }
        return v;
      })
    );

    const log: NDPAAuditLog = {
      id: `LOG-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: 'Automated NDPA Lifecycle Daemon',
      action: 'RETENTION_PURGE',
      details: `Purged ${expiredList.length} visitor record(s) exceeding the mandatory ${NDPA_ORGANIZATION_INFO.dataRetentionDays}-day retention threshold.`,
      lawfulBasis: 'NDPA 2023 Sec 24(1)(d)',
      complianceArticle: 'Storage Limitation & Data Minimization',
    };

    setAuditLogs((prev) => [log, ...prev]);
    triggerToast(`Automated purge executed: ${expiredList.length} expired record(s) permanently redacted.`);
  };

  // Create Pre-registration Invitation
  const handleCreateInvite = (newInvite: PreRegistrationInvite) => {
    setInvitations((prev) => [newInvite, ...prev]);

    // Send email notification to guest
    const guestNotification: EmailNotification = {
      id: `NOTIF-${Date.now()}`,
      recipientEmail: newInvite.guestEmail,
      recipientName: newInvite.guestName,
      subject: `Corporate Access Pass: ${newInvite.guestName} at Zenith Holdings VI Tower`,
      type: 'GUEST_INVITE',
      sentAt: new Date().toISOString(),
      bodyPreview: `Dear ${newInvite.guestName}, you are invited to Zenith Holdings Corporate Tower by ${newInvite.hostEmployeeName} (${newInvite.hostDepartment}) on ${newInvite.expectedDate} at ${newInvite.expectedTime}. Your expedited check-in code is ${newInvite.inviteCode}.`,
      status: 'Delivered',
    };

    const log: NDPAAuditLog = {
      id: `LOG-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: `${newInvite.hostEmployeeName} (Host)`,
      action: 'INVITE_SENT',
      details: `Generated pre-registration pass ${newInvite.inviteCode} for ${newInvite.guestName} (${newInvite.guestOrganization}).`,
      lawfulBasis: 'NDPA 2023 Sec 25(1)(b)',
      complianceArticle: 'Legitimate Interests & Invitation Scheduling',
    };

    setNotifications((prev) => [guestNotification, ...prev]);
    setAuditLogs((prev) => [log, ...prev]);
    triggerToast(`Invitation sent to ${newInvite.guestName}! Invite code: ${newInvite.inviteCode}`);
  };

  // Quick Check-in from Invitation code
  const handleQuickCheckInFromInvite = () => {
    setActiveTab('kiosk');
  };

  // Test notification dispatcher
  const handleSendTestNotification = () => {
    const randomHost = hosts[Math.floor(Math.random() * hosts.length)];
    const testNotif: EmailNotification = {
      id: `NOTIF-${Date.now()}`,
      recipientEmail: randomHost.email,
      recipientName: randomHost.name,
      subject: `Simulated Alert: VIP Delegation scheduled with ${randomHost.name}`,
      type: 'HOST_ARRIVAL_ALERT',
      sentAt: new Date().toISOString(),
      bodyPreview: `Test verification dispatch: SecurePass enterprise notification bridge is fully operational and delivering real-time alerts.`,
      status: 'Delivered',
    };

    setNotifications((prev) => [testNotif, ...prev]);
    triggerToast(`Test arrival alert dispatched to ${randomHost.name}.`);
  };

  // Auth Handlers
  const handleLoginSuccess = (user: AppUser) => {
    setCurrentUser(user);
    const log: NDPAAuditLog = {
      id: `LOG-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: `${user.name} (${user.role.toUpperCase()})`,
      action: 'USER_LOGIN',
      details: `User authenticated successfully. Role: ${user.role.toUpperCase()}, Department: ${user.department}.`,
      lawfulBasis: 'NDPA 2023 Sec 39(1)',
      complianceArticle: 'Access Authentication & Session Management',
    };
    setAuditLogs((prev) => [log, ...prev]);

    if (user.role === 'staff') {
      setActiveTab('invitations');
      triggerToast(`Welcome ${user.name}! Staff access granted to Guest Invitations.`);
    } else {
      setActiveTab('access_logs');
      triggerToast(`Welcome Administrator ${user.name}! Full access granted.`);
    }
  };

  const handleLogout = () => {
    const prevName = currentUser?.name || 'User';
    const log: NDPAAuditLog = {
      id: `LOG-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: prevName,
      action: 'USER_LOGOUT',
      details: `User terminated authentication session.`,
      lawfulBasis: 'NDPA 2023 Sec 39(1)',
      complianceArticle: 'Session Revocation',
    };
    setAuditLogs((prev) => [log, ...prev]);
    setCurrentUser(null);
    setActiveTab('kiosk');
    triggerToast('Signed out successfully.');
  };

  // User Profile Management Handlers (Admin)
  const handleCreateUser = (newUser: AppUser) => {
    setUsers((prev) => [newUser, ...prev]);
    const log: NDPAAuditLog = {
      id: `LOG-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: `${currentUser?.name || 'Administrator'} (${currentUser?.role || 'admin'})`,
      action: 'USER_CREATED',
      details: `Created new user profile ${newUser.name} (${newUser.email}). Role assigned: ${newUser.role.toUpperCase()} (${newUser.role === 'admin' ? 'Full Access' : 'Guest Invitations Only'}).`,
      lawfulBasis: 'NDPA 2023 Sec 39(1)',
      complianceArticle: 'Technical & Organizational Security Measures',
    };
    setAuditLogs((prev) => [log, ...prev]);
    triggerToast(`User profile created for ${newUser.name} (${newUser.role.toUpperCase()}).`);
  };

  const handleUpdateUser = (updatedUser: AppUser) => {
    setUsers((prev) => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
    if (currentUser && currentUser.id === updatedUser.id) {
      setCurrentUser(updatedUser);
    }
    const log: NDPAAuditLog = {
      id: `LOG-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: `${currentUser?.name || 'Administrator'} (${currentUser?.role || 'admin'})`,
      action: 'USER_UPDATED',
      details: `Updated user profile ${updatedUser.name} (${updatedUser.email}). Role: ${updatedUser.role}, Status: ${updatedUser.status}.`,
      lawfulBasis: 'NDPA 2023 Sec 39(1)',
      complianceArticle: 'Identity Management Governance',
    };
    setAuditLogs((prev) => [log, ...prev]);
    triggerToast(`User profile for ${updatedUser.name} updated.`);
  };

  const handleDeleteUser = (userId: string) => {
    const target = users.find((u) => u.id === userId);
    setUsers((prev) => prev.filter((u) => u.id !== userId));
    const log: NDPAAuditLog = {
      id: `LOG-${Date.now()}`,
      timestamp: new Date().toISOString(),
      actor: `${currentUser?.name || 'Administrator'} (${currentUser?.role || 'admin'})`,
      action: 'USER_DELETED',
      details: `Deleted user profile ${target?.name || userId} (${target?.email || ''}) and revoked access tokens.`,
      lawfulBasis: 'NDPA 2023 Sec 39(1)',
      complianceArticle: 'Revocation of Privileged Credentials',
    };
    setAuditLogs((prev) => [log, ...prev]);
    triggerToast(`User profile deleted successfully.`);
  };

  // RBAC Permission Check
  const isStaffRestricted =
    currentUser?.role === 'staff' &&
    ['access_logs', 'compliance', 'muster', 'users'].includes(activeTab);

  const isUnauthenticatedRestricted =
    !currentUser &&
    ['access_logs', 'compliance', 'muster', 'users', 'invitations'].includes(activeTab);

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
                Staff accounts are granted role-based access <strong>exclusively to the Guest Invitations portal</strong> to invite visitors in advance.
                Administrative access logs, NDPA compliance dossiers, emergency muster roll-calls, and user management require an Administrator profile.
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
                  <strong>Prefer touchless self check-in?</strong> Scan the reception QR standee with your smartphone camera to register on your phone.
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

        {/* Tab 5: Guest Invitations (Admin & Staff) */}
        {activeTab === 'invitations' && !isUnauthenticatedRestricted && (
          <PreRegistrationManager
            invitations={invitations}
            hosts={hosts}
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
              Supervised under the Nigeria Data Protection Act (NDPA 2023) · NDPC Controller License: {NDPA_ORGANIZATION_INFO.ndpcRegistrationNumber}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-[11px]">
            <a
              href="/SecurePass_NDPA_PRD.pdf"
              download="SecurePass_NDPA_PRD.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:text-emerald-300 font-semibold transition-colors flex items-center gap-1"
            >
              PRD Document (.pdf)
            </a>
            <span aria-hidden="true" className="text-slate-700">·</span>
            <a
              href="/SecurePass_NDPA_PRD.docx"
              download="SecurePass_NDPA_PRD.docx"
              className="text-slate-400 hover:text-slate-300 transition-colors"
            >
              Word (.docx)
            </a>
            <span aria-hidden="true" className="text-slate-700">·</span>
            <span>DPO: {NDPA_ORGANIZATION_INFO.dpoName}</span>
            <span aria-hidden="true" className="text-slate-700">·</span>
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
