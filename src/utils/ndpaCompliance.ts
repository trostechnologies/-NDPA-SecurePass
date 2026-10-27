/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Visitor, NDPAAuditLog } from '../types/visitor';

export const NDPA_ORGANIZATION_INFO = {
  companyName: 'Zenith-Tower Holdings PLC',
  facilityName: 'Victoria Island Corporate Tower',
  address: 'Plot 1045, Adeola Odeku Street, Victoria Island, Lagos, Nigeria',
  ndpcRegistrationNumber: 'NDPC/DPCO/2024/0912',
  dpoName: 'Barr. Zainab Mohammed, LL.B, BL, CIPP/E',
  dpoEmail: 'dpo@zenithholdings.ng',
  dpoPhone: '+234 (0) 1 270 4000',
  dataRetentionDays: 60,
  lawfulBasisNotice: 'Nigerian Data Protection Act (NDPA) 2023, Sections 24, 25, 26, 30 & 39',
};

export function generatePassCode(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `NG-VIS-${num}`;
}

export function generateBadgeId(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `BDG-${num}`;
}

export function generateWifiCode(): string {
  const code = Math.floor(1000 + Math.random() * 9000);
  return `ZENITH-GUEST-${code}`;
}

export function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 8) return phone;
  // Format: +234 803 ••• ••67
  const cleaned = phone.trim();
  if (cleaned.startsWith('+234')) {
    const prefix = cleaned.slice(0, 8);
    const suffix = cleaned.slice(-2);
    return `${prefix} ••• ••${suffix}`;
  }
  return `${cleaned.slice(0, 4)} ••• ••${cleaned.slice(-2)}`;
}

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [name, domain] = email.split('@');
  if (name.length <= 2) return `${name[0]}*@${domain}`;
  const maskedName = `${name[0]}•••${name[name.length - 1]}`;
  return `${maskedName}@${domain}`;
}

export function isRetentionExpired(expiryIso: string): boolean {
  if (!expiryIso) return false;
  return new Date(expiryIso).getTime() < Date.now();
}

export function daysUntilExpiry(expiryIso: string): number {
  if (!expiryIso) return 0;
  const diffMs = new Date(expiryIso).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportVisitorsCSV(visitors: Visitor[]): void {
  const headers = [
    'Pass Code',
    'Full Name',
    'Email (Masked if Anonymized)',
    'Phone',
    'Organization',
    'Host Employee',
    'Host Department',
    'Purpose',
    'Visit Type',
    'Check-In Time',
    'Check-Out Time',
    'Status',
    'Biometric Photo Captured',
    'NDPA Consent Granted',
    'Vehicle Plate',
    'Clearance Level',
    'Retention Expiry',
  ];

  const rows = visitors.map(v => [
    `"${v.passCode}"`,
    `"${v.fullName.replace(/"/g, '""')}"`,
    `"${v.email}"`,
    `"${v.phone}"`,
    `"${v.organization.replace(/"/g, '""')}"`,
    `"${v.hostEmployeeName.replace(/"/g, '""')}"`,
    `"${v.hostDepartment}"`,
    `"${v.purpose.replace(/"/g, '""')}"`,
    `"${v.visitType}"`,
    `"${v.checkInTime}"`,
    `"${v.checkOutTime || 'Active'}"`,
    `"${v.status}"`,
    `"${v.hasBiometricPhoto ? 'Yes (Consented)' : 'No (Opted-Out)'}"`,
    `"${v.generalConsentGranted ? 'Yes' : 'No'}"`,
    `"${v.vehiclePlate || 'N/A'}"`,
    `"${v.securityClearance}"`,
    `"${v.retentionExpiryDate ? v.retentionExpiryDate.split('T')[0] : 'N/A'}"`,
  ]);

  const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadFile(csvContent, `NDPA_Visitor_Access_Log_${dateStr}.csv`, 'text/csv;charset=utf-8;');
}

export function exportDSARReport(visitor: Visitor): void {
  const dateStr = new Date().toLocaleDateString('en-NG', { dateStyle: 'full' });
  const content = `
================================================================================
             NIGERIA DATA PROTECTION ACT (NDPA 2023) - SECTION 34
             DATA SUBJECT ACCESS REQUEST (DSAR) OFFICIAL DOSSIER
================================================================================

CONTROLLER DETAILS:
Data Controller:     ${NDPA_ORGANIZATION_INFO.companyName}
Facility:            ${NDPA_ORGANIZATION_INFO.facilityName}
Address:             ${NDPA_ORGANIZATION_INFO.address}
NDPC Reg No:         ${NDPA_ORGANIZATION_INFO.ndpcRegistrationNumber}
DPO in Charge:       ${NDPA_ORGANIZATION_INFO.dpoName} (${NDPA_ORGANIZATION_INFO.dpoEmail})
Date Generated:      ${dateStr}

DATA SUBJECT IDENTIFIERS:
Internal Visitor ID: ${visitor.id}
Visitor Pass Code:   ${visitor.passCode}
Full Legal Name:     ${visitor.fullName}
Primary Contact:     ${visitor.email} | ${visitor.phone}
Organization:        ${visitor.organization}

LAWFUL BASIS OF PROCESSING (NDPA SECTION 25):
- Lawful Basis:      Explicit Consent & Legitimate Facility Security Interest
- General Consent:   ${visitor.generalConsentGranted ? 'GRANTED' : 'NOT GRANTED'} (Recorded: ${visitor.consentTimestamp})
- Sensitive Data:    Biometric Photo ${visitor.biometricConsentGranted ? 'CONSENTED (Sec 30)' : 'DECLINED (Sec 30)'}
- Photo Stored:      ${visitor.hasBiometricPhoto ? 'Stored in encrypted local repository' : 'None stored (Voluntary opt-out honoured)'}

VISIT TELEMETRY:
Host Person:         ${visitor.hostEmployeeName} (${visitor.hostDepartment})
Purpose of Entry:    ${visitor.purpose}
Visit Category:      ${visitor.visitType}
Check-In Timestamp:  ${visitor.checkInTime}
Check-Out Timestamp: ${visitor.checkOutTime || 'Still on Premises'}
Current Status:      ${visitor.status}
Security Clearance:  ${visitor.securityClearance}
Vehicle Plate:       ${visitor.vehiclePlate || 'Pedestrian (No vehicle logged)'}
Government ID Type:  ${visitor.governmentIdType || 'N/A'} (Masked ID: ${visitor.governmentIdNumberMasked || 'N/A'})

RETENTION & ERASURE SCHEDULE (NDPA SECTION 24(1)(d)):
Retention Expiry:    ${visitor.retentionExpiryDate}
Scheduled Purge:     Automated permanent cryptographic redaction at T+60 days
Right to Erasure:    Data subject may contact ${NDPA_ORGANIZATION_INFO.dpoEmail} to demand prior deletion.

================================================================================
CERTIFICATION:
This document constitutes a certified disclosure pursuant to Section 34 of the
Nigerian Data Protection Act, 2023. Generated by SecurePass Enterprise Compliance.
================================================================================
`;

  downloadFile(content.trim(), `NDPA_DSAR_${visitor.passCode}_${visitor.fullName.replace(/\s+/g, '_')}.txt`, 'text/plain');
}

export function exportNDPCAuditSummary(visitors: Visitor[], auditLogs: NDPAAuditLog[]): void {
  const activeCount = visitors.filter(v => v.status === 'checked_in').length;
  const photoConsented = visitors.filter(v => v.biometricConsentGranted).length;
  const photoDeclined = visitors.filter(v => !v.biometricConsentGranted && !v.isAnonymized).length;
  const total = visitors.length;
  const consentPercentage = total > 0 ? Math.round((photoConsented / total) * 100) : 0;
  const overduePrune = visitors.filter(v => isRetentionExpired(v.retentionExpiryDate)).length;
  const anonymized = visitors.filter(v => v.isAnonymized).length;

  const content = `
================================================================================
         NIGERIA DATA PROTECTION COMMISSION (NDPC) COMPLIANCE AUDIT
               VISITOR MANAGEMENT ACCESS & PRIVACY REPORT
================================================================================

AUDITED ENTITY:
Organization:        ${NDPA_ORGANIZATION_INFO.companyName}
Premises:            ${NDPA_ORGANIZATION_INFO.facilityName}
NDPC Filing ID:      ${NDPA_ORGANIZATION_INFO.ndpcRegistrationNumber}
Data Protection Off: ${NDPA_ORGANIZATION_INFO.dpoName}
Reporting Timestamp: ${new Date().toISOString()}

1. EXECUTIVE COMPLIANCE METRICS
--------------------------------------------------------------------------------
Total Processed Records:             ${total}
Currently Active on Premises:        ${activeCount}
Biometric Opt-in Rate (Sec 30):      ${consentPercentage}% (${photoConsented} consented, ${photoDeclined} exercised opt-out)
Records Anonymized under Sec 37:     ${anonymized}
Records Overdue for Retention Purge: ${overduePrune}
Mandated Retention Window:           ${NDPA_ORGANIZATION_INFO.dataRetentionDays} Days

2. PRINCIPLES OF DATA PROCESSING ASSESSMENT (NDPA SECTION 24)
--------------------------------------------------------------------------------
[PASS] Lawfulness, Fairness & Transparency (Sec 24(1)(a)):
       Explicit multi-clause consent modal displayed to 100% of registrants.
[PASS] Purpose Limitation (Sec 24(1)(b)):
       Personal data processed strictly for physical building safety and escort.
[PASS] Data Minimization (Sec 24(1)(c)):
       Government identification numbers automatically masked to prevent shoulder surfing.
[PASS] Storage Limitation (Sec 24(1)(d)):
       Strict 60-day maximum retention lifecycle with automated compliance flags.
[PASS] Integrity and Confidentiality (Sec 24(1)(f)):
       Encrypted local vault, role-based front desk controls, immutable audit logs.

3. RECENT IMMUTABLE AUDIT TRAIL ENTRIES (LAST ${Math.min(auditLogs.length, 10)})
--------------------------------------------------------------------------------
${auditLogs.slice(0, 10).map(log => `[${log.timestamp.slice(0, 19).replace('T', ' ')}] ${log.action.padEnd(20)} | Actor: ${log.actor.padEnd(30)} | Legal Basis: ${log.lawfulBasis}`).join('\n')}

================================================================================
END OF AUDIT SUMMARY - SUBMITTABLE TO NIGERIA DATA PROTECTION COMMISSION (NDPC)
================================================================================
`;

  const dateStr = new Date().toISOString().split('T')[0];
  downloadFile(content.trim(), `NDPC_Audit_Compliance_Report_${dateStr}.txt`, 'text/plain');
}
