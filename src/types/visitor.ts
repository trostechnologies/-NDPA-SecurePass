/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type VisitType = 'walk_in' | 'pre_registered' | 'contractor' | 'vip' | 'delivery';
export type VisitorStatus = 'checked_in' | 'checked_out' | 'expected' | 'cancelled';
export type SecurityClearance = 'Standard' | 'Escort Required' | 'Level 1 High Security' | 'Data Center Restricted';
export type GovernmentIdType = 'NIN' | 'Voters Card' | 'Drivers License' | 'International Passport' | 'Corporate ID';

export interface HostEmployee {
  id: string;
  name: string;
  email: string;
  phone: string;
  department: string;
  floor: string;
  title: string;
  avatar: string;
}

export interface Visitor {
  id: string;
  passCode: string;
  fullName: string;
  email: string;
  phone: string;
  organization: string;
  hostEmployeeId: string;
  hostEmployeeName: string;
  hostDepartment: string;
  purpose: string;
  visitType: VisitType;
  checkInTime: string;
  checkOutTime?: string;
  status: VisitorStatus;
  hasBiometricPhoto: boolean;
  photoUrl?: string;
  biometricConsentGranted: boolean; // NDPA 2023 Section 30
  generalConsentGranted: boolean;   // NDPA 2023 Section 25 & 26
  consentTimestamp: string;
  vehiclePlate?: string;
  governmentIdType?: GovernmentIdType;
  governmentIdNumberMasked?: string;
  emergencyContactName?: string;
  emergencyContactPhone?: string;
  badgePrinted: boolean;
  isAnonymized?: boolean; // Right to Erasure / Anonymization
  retentionExpiryDate: string; // ISO date
  securityClearance: SecurityClearance;
  wifiAccessGranted: boolean;
  wifiCode?: string;
  badgeId: string;
  notes?: string;
}

export interface PreRegistrationInvite {
  id: string;
  inviteCode: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  guestOrganization: string;
  hostEmployeeId: string;
  hostEmployeeName: string;
  hostDepartment: string;
  expectedDate: string;
  expectedTime: string;
  purpose: string;
  status: 'pending' | 'checked_in' | 'cancelled' | 'expired';
  createdAt: string;
  specialInstructions?: string;
  parkingReserved: boolean;
}

export type UserRole = 'admin' | 'staff';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  department: string;
  title: string;
  status: 'active' | 'suspended';
  avatar?: string;
  lastLogin?: string;
  createdAt: string;
}

export interface NDPAAuditLog {
  id: string;
  timestamp: string;
  actor: string;
  action: 
    | 'CHECK_IN'
    | 'CHECK_OUT'
    | 'PHOTO_CAPTURED'
    | 'PHOTO_SKIPPED_VOLUNTARY'
    | 'BADGE_PRINTED'
    | 'DATA_EXPORTED'
    | 'RIGHT_TO_ERASURE'
    | 'RETENTION_PURGE'
    | 'INVITE_SENT'
    | 'CONSENT_RECORDED'
    | 'USER_CREATED'
    | 'USER_UPDATED'
    | 'USER_DELETED'
    | 'USER_LOGIN'
    | 'USER_LOGOUT';
  details: string;
  visitorId?: string;
  lawfulBasis: string;
  complianceArticle: string;
  ipAddress?: string;
}

export interface EmailNotification {
  id: string;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  type: 'HOST_ARRIVAL_ALERT' | 'GUEST_INVITE' | 'CHECKOUT_CONFIRMATION' | 'DPO_DSAR_NOTICE';
  sentAt: string;
  bodyPreview: string;
  status: 'Delivered' | 'Pending';
}

export interface NDPAComplianceMetrics {
  totalRegisteredVisitors: number;
  activeCheckedIn: number;
  biometricConsentRate: number; // percentage who opted-in for photo
  recordsDueForRetentionPurge: number;
  dsarRequestsHandled: number;
  anonymizedRecords: number;
  dpoName: string;
  dpoEmail: string;
  ndpcRegistrationNumber: string;
  retentionPolicyDays: number;
}
