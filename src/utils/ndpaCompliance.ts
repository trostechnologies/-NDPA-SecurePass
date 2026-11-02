import { csvCell } from './security';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Visitor, NDPAAuditLog } from '../types/visitor';

export const NDPA_ORGANIZATION_INFO = {
  companyName:'Development controller',facilityName:'Development facility',address:'Not configured',
  ndpcRegistrationNumber:'Not configured',dpoName:'Privacy contact',dpoEmail:'',dpoPhone:'',
  dataRetentionDays:60,lawfulBasisNotice:'Refer to the controller-approved privacy notice',
  noticeVersion:'development-1',privacyNoticeText:'Loading facility privacy notice',
};

export function generatePassCode(): string {
  const num = crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
  return `NG-VIS-${num}`;
}

export function generateBadgeId(): string {
  const num = crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
  return `BDG-${num}`;
}

export function generateWifiCode(): string {
  const code = crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase();
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

  const rows = visitors.map(v => [v.passCode,v.fullName,v.email,v.phone,v.organization,v.hostEmployeeName,v.hostDepartment,v.purpose,v.visitType,v.checkInTime,v.checkOutTime||'Active',v.status,v.hasBiometricPhoto?'Yes':'No',v.generalConsentGranted?'Yes':'No',v.vehiclePlate||'',v.securityClearance,v.retentionExpiryDate]);
  const csvContent=[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n');
  const dateStr = new Date().toISOString().split('T')[0];
  downloadFile(csvContent, `NDPA_Visitor_Access_Log_${dateStr}.csv`, 'text/csv;charset=utf-8;');
}

export function exportDSARReport(visitor: Visitor): void {
  const dateStr = new Date().toLocaleDateString('en-NG', { dateStyle: 'full' });
  const content = `
================================================================================
             NIGERIA DATA PROTECTION ACT (NDPA 2023) - SECTION 34
             DATA SUBJECT ACCESS REQUEST (DSAR) OPERATIONAL EXPORT
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
- Lawful Basis:      Refer to the controller-approved privacy notice
- Notice acknowledgement:   ${visitor.generalConsentGranted ? 'RECORDED' : 'NOT RECORDED'} (Recorded: ${visitor.consentTimestamp})
- Sensitive Data:    Photo collection disabled in this release
- Photo Stored:      ${visitor.hasBiometricPhoto ? 'Photo state reported by record; storage controls require verification' : 'None stored (Voluntary opt-out honoured)'}

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
Scheduled Purge:     Primary database deletion after the configured retention period. Backups require independent lifecycle management.
Right to Erasure:    Data subject may contact ${NDPA_ORGANIZATION_INFO.dpoEmail} to demand prior deletion.

================================================================================
EXPORT LIMITATIONS:
Operational data export for controller review. Identity verification and disclosure approval are handled by the controller. This is not a compliance certification.
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
Legacy records marked anonymized:     ${anonymized}
Records Overdue for Retention Purge: ${overduePrune}
Configured Retention Window:           ${NDPA_ORGANIZATION_INFO.dataRetentionDays} Days

2. OPERATIONAL LIMITATIONS
--------------------------------------------------------------------------------
Primary records are deleted on expiry. Backups and exported copies require separate management.
The application does not provide database encryption or immutable audit storage.
Photo and government-ID collection are disabled pending an approved lifecycle.
These metrics do not establish legal compliance or certification.

3. RECENT OPERATIONAL AUDIT ENTRIES (LAST ${Math.min(auditLogs.length,10)})
--------------------------------------------------------------------------------
${auditLogs.slice(0, 10).map(log => `[${log.timestamp.slice(0, 19).replace('T', ' ')}] ${log.action.padEnd(20)} | Actor: ${log.actor.padEnd(30)} | Legal Basis: ${log.lawfulBasis}`).join('\n')}

================================================================================
END OF OPERATIONAL SUMMARY — CONTROLLER REVIEW REQUIRED
================================================================================
`;

  const dateStr = new Date().toISOString().split('T')[0];
  downloadFile(content.trim(), `NDPC_Audit_Compliance_Report_${dateStr}.txt`, 'text/plain');
}
