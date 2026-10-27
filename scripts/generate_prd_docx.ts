/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  Header,
  Footer,
  PageNumber,
  ShadingType,
} from 'docx';
import * as fs from 'fs';
import * as path from 'path';

function createHeading(text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel], spaceBefore = 300, spaceAfter = 120) {
  return new Paragraph({
    text: text,
    heading: level,
    spacing: { before: spaceBefore, after: spaceAfter },
  });
}

function createParagraph(text: string, options: { bold?: boolean; italic?: boolean; spaceAfter?: number } = {}) {
  return new Paragraph({
    spacing: { before: 60, after: options.spaceAfter ?? 120, line: 276 },
    children: [
      new TextRun({
        text,
        bold: options.bold,
        italics: options.italic,
        font: 'Plus Jakarta Sans',
        size: 22, // 11pt
        color: '1E293B',
      }),
    ],
  });
}

function createBullet(text: string, prefixBold = '', level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { before: 40, after: 60, line: 260 },
    children: [
      ...(prefixBold ? [new TextRun({ text: prefixBold + ' ', bold: true, font: 'Plus Jakarta Sans', size: 21, color: '0F172A' })] : []),
      new TextRun({ text, font: 'Plus Jakarta Sans', size: 21, color: '334155' }),
    ],
  });
}

function createCallout(title: string, body: string) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: '10B981' },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: '10B981' },
      left: { style: BorderStyle.SINGLE, size: 24, color: '059669' },
      right: { style: BorderStyle.SINGLE, size: 6, color: '10B981' },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: 'F0FDF4' },
            margins: { top: 160, bottom: 160, left: 240, right: 240 },
            children: [
              new Paragraph({
                spacing: { after: 60 },
                children: [
                  new TextRun({ text: title, bold: true, font: 'Plus Jakarta Sans', size: 22, color: '065F46' }),
                ],
              }),
              new Paragraph({
                children: [
                  new TextRun({ text: body, font: 'Plus Jakarta Sans', size: 20, color: '166534' }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

function createTable(headers: string[], rows: string[][]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: 'E2E8F0' },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map(
          h =>
            new TableCell({
              shading: { type: ShadingType.CLEAR, fill: '0F172A' },
              margins: { top: 140, bottom: 140, left: 160, right: 160 },
              children: [
                new Paragraph({
                  children: [new TextRun({ text: h, bold: true, font: 'Plus Jakarta Sans', size: 20, color: 'FFFFFF' })],
                }),
              ],
            })
        ),
      }),
      ...rows.map(
        (row, idx) =>
          new TableRow({
            children: row.map(
              cell =>
                new TableCell({
                  shading: { type: ShadingType.CLEAR, fill: idx % 2 === 0 ? 'FFFFFF' : 'F8FAFC' },
                  margins: { top: 120, bottom: 120, left: 160, right: 160 },
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: cell, font: 'Plus Jakarta Sans', size: 20, color: '334155' })],
                    }),
                  ],
                })
            ),
          })
      ),
    ],
  });
}

export async function generatePRDDocument() {
  const doc = new Document({
    creator: 'Dr. Marcus Hale, Principal AI-Assisted Architect',
    title: 'SecurePass NDPA - Product Requirement Document',
    description: 'Enterprise Visitor Access & Data Protection Governance System PRD compliant with NDPA 2023',
    styles: {
      default: {
        document: {
          run: { font: 'Plus Jakarta Sans', color: '1E293B', size: 22 },
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          run: { font: 'Plus Jakarta Sans', size: 36, bold: true, color: '0F172A' },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          run: { font: 'Plus Jakarta Sans', size: 28, bold: true, color: '047857' },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          run: { font: 'Plus Jakarta Sans', size: 24, bold: true, color: '334155' },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 }, // 1 inch margins
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({ text: 'SecurePass NDPA | Enterprise Product Requirement Document (PRD)', font: 'Plus Jakarta Sans', size: 16, color: '94A3B8' }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({ text: 'Nigeria Data Protection Act (NDPA 2023) Compliant  |  Page ', font: 'Plus Jakarta Sans', size: 16, color: '94A3B8' }),
                  new TextRun({ children: [PageNumber.CURRENT], font: 'Plus Jakarta Sans', size: 16, color: '94A3B8' }),
                  new TextRun({ text: ' of ', font: 'Plus Jakarta Sans', size: 16, color: '94A3B8' }),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES], font: 'Plus Jakarta Sans', size: 16, color: '94A3B8' }),
                ],
              }),
            ],
          }),
        },
        children: [
          // Title Cover Block
          new Paragraph({
            spacing: { before: 400, after: 120 },
            children: [
              new TextRun({ text: 'PRODUCT REQUIREMENT DOCUMENT (PRD)', font: 'Plus Jakarta Sans', size: 20, bold: true, color: '059669' }),
            ],
          }),
          new Paragraph({
            spacing: { before: 0, after: 180 },
            children: [
              new TextRun({ text: 'SecurePass NDPA', font: 'Plus Jakarta Sans', size: 48, bold: true, color: '0F172A' }),
            ],
          }),
          new Paragraph({
            spacing: { before: 0, after: 280 },
            children: [
              new TextRun({ text: 'Enterprise Visitor Access & Data Protection Governance System', font: 'Plus Jakarta Sans', size: 26, color: '475569' }),
            ],
          }),

          createCallout(
            'REGULATORY COMPLIANCE MANDATE',
            'This application specification complies with the Nigerian Data Protection Act (NDPA) 2023 enacted on June 12, 2023, and guidelines issued by the Nigeria Data Protection Commission (NDPC). It enforces principles of lawful consent, biometric voluntary opt-outs (Sec 30), purpose limitation, data minimization, 60-day storage lifecycle, and Data Subject Access Requests (DSAR).'
          ),

          new Paragraph({ spacing: { after: 200 } }),

          createTable(
            ['Document Attribute', 'Specification Details'],
            [
              ['Project Codename', 'SecurePass NDPA (Version 2.4 Enterprise)'],
              ['Document Owner', 'Dr. Marcus Hale, Principal AI-Assisted Architect & Prompt Engineer'],
              ['Target Organization', 'Zenith-Tower Holdings PLC (Victoria Island Corporate Tower)'],
              ['NDPC Registration', 'NDPC/DPCO/2024/0912 (Licensed Data Controller)'],
              ['Applicable Laws', 'NDPA 2023 (Sections 24, 25, 26, 30, 34-39), NDPR 2019 provisions'],
              ['Status & Classification', 'Approved for Production Implementation - Enterprise Confidential'],
            ]
          ),

          createHeading('1. Executive Summary & Problem Statement', HeadingLevel.HEADING_1, 400, 140),
          createParagraph(
            'In Nigerian commercial and corporate real estate, visitor logging has historically relied on physical paper ledger books placed at security gates and reception desks. This legacy approach violates core tenants of the Nigerian Data Protection Act (NDPA 2023):'
          ),
          createBullet('Public Ledger Shoulder-Surfing: Previous visitors’ names, personal phone numbers, and organizations are openly visible to anyone signing the log, breaching Section 39 (Confidentiality & Integrity).', 'Breach of Confidentiality:'),
          createBullet('Absence of Informed Consent: Visitors are forced to provide personal telemetry without clear notices regarding data controllers, retention, or lawful processing basis (Section 25).', 'Lack of Lawful Basis:'),
          createBullet('Mandatory Unchecked Biometrics: Facilities capturing photographs or fingerprints without providing voluntary opt-outs violate Section 30 (Sensitive Personal Data).', 'Coerced Biometrics:'),
          createBullet('Permanent Data Hoarding: Paper logs are stored indefinitely or disposed of carelessly, defying statutory storage limitation principles (Section 24(1)(d)).', 'Indefinite Retention:'),
          createParagraph(
            'SecurePass NDPA solves this through an enterprise digital platform featuring dual self-service kiosks, touchless mobile smartphone check-in via reception QR standees, scannable Avery/thermal badge issuance, instant host alerts, emergency evacuation muster tracking, and a dedicated NDPA Compliance Desk.'
          ),

          createHeading('2. Core Product Objectives & North Star KPIs', HeadingLevel.HEADING_1, 350, 140),
          createBullet('100% Statutory NDPA Compliance: Complete coverage of lawful consent, voluntary biometrics, and automated 60-day data lifecycle.', 'Objective 1:'),
          createBullet('Sub-10 Second Check-In: Invite-only pre-registered guests complete check-in and receive their security pass in under 10 seconds.', 'Objective 2:'),
          createBullet('Touchless Reception Entry: Arriving visitors scan a front-desk QR standee to complete check-in on their personal smartphones without touching shared kiosk screens.', 'Objective 3:'),
          createBullet('Zero-Latency Life Safety: Real-time emergency evacuation roll-call providing building fire marshals with immediate headcount and contact details of all souls in the tower.', 'Objective 4:'),
          createBullet('Strict Role-Based Access Control: Staff members can solely invite guests, while administrative features (access logs, compliance reports, user administration) are locked behind enterprise authentication.', 'Objective 5:'),

          createHeading('3. NDPA 2023 Regulatory Architecture', HeadingLevel.HEADING_1, 350, 140),
          createParagraph(
            'The system architecture is engineered from first principles around the Nigeria Data Protection Act 2023:'
          ),
          createTable(
            ['NDPA 2023 Article', 'Legal Requirement', 'System Implementation Mechanism'],
            [
              ['Section 24(1)(a)', 'Fairness & Transparency', 'Interactive Privacy Notice displayed prior to data collection detailing controller identity and purpose.'],
              ['Section 25(1)(a)', 'Explicit Consent', 'Active checkbox consent required before badge creation; cryptographic timestamp recorded.'],
              ['Section 25(1)(d)', 'Vital Interests', 'Emergency muster headcount justified under life-safety during building evacuation drills.'],
              ['Section 30(1)-(2)', 'Sensitive Biometrics', 'Voluntary photo capture studio with a prominent "Skip Photo" button. Zero penalty or access refusal for declining.'],
              ['Section 24(1)(c)', 'Data Minimization', 'Government ID numbers automatically masked (e.g. •••• 9102); lobby privacy masking prevents shoulder surfing.'],
              ['Section 24(1)(d)', 'Storage Limitation', 'Strict 60-day retention calendar with automated compliance flags and 1-click irreversible cryptographic purge.'],
              ['Section 34 & 37', 'Data Subject Rights', '1-Click certified DSAR Dossier generation and instant Right-to-Erasure (anonymization) execution.'],
              ['Section 39', 'Security of Processing', 'Role-Based Access Control (RBAC), password authentication, and tamper-evident audit logs.'],
            ]
          ),

          createHeading('4. User Personas & Role-Based Access Matrix', HeadingLevel.HEADING_1, 350, 140),
          createParagraph('The platform defines three distinct operating roles with granular access boundaries:'),
          createTable(
            ['Feature / Module', 'Public Visitor (Unauth)', 'Staff Member (Role: Staff)', 'Administrator (Role: Admin)'],
            [
              ['Self-Service Kiosk Check-In', 'ALLOWED', 'ALLOWED', 'ALLOWED'],
              ['Touchless Mobile Check-In', 'ALLOWED', 'ALLOWED', 'ALLOWED'],
              ['Reception QR Standee Preview', 'ALLOWED', 'ALLOWED', 'ALLOWED'],
              ['Guest Invitations Portal', 'DENIED (Requires Login)', 'FULL ACCESS (Invite guests in advance)', 'FULL ACCESS'],
              ['Live Access Logs & Check-Out', 'DENIED', 'BLOCKED (Role Guard Enforced)', 'FULL ACCESS (View, filter, checkout, print)'],
              ['NDPA Compliance & DSAR Desk', 'DENIED', 'BLOCKED (Role Guard Enforced)', 'FULL ACCESS (Exports, audit, erasure)'],
              ['Emergency Evacuation Muster', 'DENIED', 'BLOCKED (Role Guard Enforced)', 'FULL ACCESS (Muster roll-call & print)'],
              ['User Profile Management (RBAC)', 'DENIED', 'BLOCKED (Role Guard Enforced)', 'FULL ACCESS (Create, edit, delete users)'],
            ]
          ),

          createHeading('5. Comprehensive Functional Requirements (FR)', HeadingLevel.HEADING_1, 350, 140),

          createHeading('FR-1: Reception Self-Service Kiosk', HeadingLevel.HEADING_2, 200, 100),
          createBullet('Support walk-in guest registration and express redemption of pre-registered invitation codes (e.g. INV-7821).', 'Flow Modalities:'),
          createBullet('Captures Full Legal Name, official email, phone number (+234 format), company, vehicle plate, ID type, and emergency next-of-kin.', 'Fields Captured:'),
          createBullet('Searchable corporate employee directory with real-time department and floor destination routing.', 'Host Selection:'),

          createHeading('FR-2: Touchless Mobile Check-In via Reception QR Standee', HeadingLevel.HEADING_2, 200, 100),
          createBullet('Front desk poster modal generating a dynamic QR code pointing to the public preview URL (bypassing Google login).', 'Standee Generation:'),
          createBullet('Mobile-first responsive layout (375px–430px) optimized for one-handed thumb interaction with 48px hitboxes.', 'Touch Ergonomics:'),
          createBullet('Renders an Apple/Google Wallet-style digital pass with live turnstile QR token, Wi-Fi code, and host floor directions.', 'Digital Wallet Pass:'),

          createHeading('FR-3: Biometric Visual Studio & Section 30 Opt-Out', HeadingLevel.HEADING_2, 200, 100),
          createBullet('HTML5 video stream with facingMode: "user" for live badge portrait capture, retake, or image upload.', 'Camera Studio:'),
          createBullet('Prominent button allowing visitors to decline photographic capture without delay or penalty per NDPA Sec 30.', 'Voluntary Opt-Out:'),
          createBullet('Visitors who opt out receive an official security pass displaying "NDPA SEC 30 OPT-OUT" with an authorized security silhouette.', 'Pass Integrity:'),

          createHeading('FR-4: Enterprise Badge Issuance & Thermal Printing', HeadingLevel.HEADING_2, 200, 100),
          createBullet('Standards-compliant badge format with corporate header, clearance ribbon, photo/avatar, host details, and validity window.', 'Card Layout:'),
          createBullet('Dynamic cryptographic QR token encoded with visitor pass code, timestamp, and clearance level.', 'Scannable Token:'),
          createBullet('@media print styling optimized for direct Avery label sheets or direct thermal ID badge printers.', 'Direct Printing:'),

          createHeading('FR-5: Email & SMS Notification Bridge', HeadingLevel.HEADING_2, 200, 100),
          createBullet('Immediate simulated email dispatch notifying host staff upon visitor check-in at reception.', 'Host Arrival Alert:'),
          createBullet('Rich transactional invitation emails containing scheduled date/time, VIP parking allocation, and check-in QR code.', 'Guest Invitations:'),
          createBullet('Interactive inspection drawer allowing administrators to review delivered emails and trigger verification test alerts.', 'Delivery Inspector:'),

          createHeading('FR-6: Pre-Registration & Scheduled Invitations', HeadingLevel.HEADING_2, 200, 100),
          createBullet('Staff and administrators can issue advance guest invitations with custom security notes and VIP parking reservations.', 'Invitation Hub:'),
          createBullet('Unique invitation pass code (e.g. INV-8840) generated with 1-click clipboard copy and modal QR preview.', 'Pass Generation:'),
          createBullet('Guests arriving with an invite code redeem it in under 10 seconds with pre-populated credentials.', 'Express Redemption:'),

          createHeading('FR-7: Real-Time Access Logs & Lobby Privacy Mode', HeadingLevel.HEADING_2, 200, 100),
          createBullet('Tabular data grid displaying all active on-premises, expected, and checked-out visitors.', 'Telemetry Grid:'),
          createBullet('1-Click toggle masking visitor phone numbers and email addresses on reception screens to prevent lobby shoulder-surfing (NDPA Sec 24(1)(c)).', 'PII Masking:'),
          createBullet('One-click checkout recording timestamp and terminating physical access authorization.', 'Access Revocation:'),

          createHeading('FR-8: Emergency Evacuation & Muster Roll-Call', HeadingLevel.HEADING_2, 200, 100),
          createBullet('Live headcount manifest of every visitor currently verified inside the building, grouped by floor and department.', 'Real-Time Manifest:'),
          createBullet('Interactive check-off checkboxes for building fire marshals conducting safety roll-calls at Muster Points A & B.', 'Marshal Checklists:'),
          createBullet('1-Click printable evacuation muster sheet formatted for emergency clipboards.', 'Printable Manifest:'),

          createHeading('FR-9: NDPA Compliance Hub, Retention Daemon & DSAR Desk', HeadingLevel.HEADING_2, 200, 100),
          createBullet('Real-time analytics tracking general consent rates, biometric opt-in vs. opt-out distributions, and retention status.', 'Compliance KPIs:'),
          createBullet('Automated tracking of 60-day storage lifecycle with a 1-click purge tool permanently anonymizing expired records.', 'Retention Daemon:'),
          createBullet('Searchable Data Subject Access Request (DSAR) desk to export certified Section 34 dossiers or execute Section 37 Right-to-Erasure.', 'DSAR Workbench:'),
          createBullet('Downloadable formal compliance audit summary report formatted for submission to the Nigeria Data Protection Commission (NDPC).', 'NDPC Audit Report:'),

          createHeading('FR-10: Enterprise Authentication & User Profile Management', HeadingLevel.HEADING_2, 200, 100),
          createBullet('Dedicated login page with role-based routing and pre-seeded enterprise accounts (Admin & Staff).', 'Authentication Gate:'),
          createBullet('Admin portal to create, update, or delete user accounts, assign roles, and manage active/suspended states.', 'User Administration:'),
          createBullet('Tamper-evident chronological log of all access events, user creations, deletions, logins, and logouts under NDPA Sec 39.', 'Immutable Audit Trail:'),

          createHeading('6. Technical Architecture & Data Schema', HeadingLevel.HEADING_1, 350, 140),
          createParagraph('The software architecture utilizes a secure, zero-dependency client-authoritative state model:'),
          createTable(
            ['Architectural Layer', 'Technology Stack', 'Design & Security Role'],
            [
              ['Frontend Framework', 'React 19 (SPA) + Vite 8', 'High-performance reactive rendering with zero-latency updates.'],
              ['Styling Engine', 'Tailwind CSS v4 + @theme', 'Domain-native SaaS dark slate theme with strict 60-30-10 color discipline.'],
              ['QR Engine', 'qrcode npm package', 'Dynamic client-side generation of cryptographic SVG/canvas tokens.'],
              ['Typography', 'Plus Jakarta Sans + JetBrains Mono', 'High legibility enterprise sans paired with tabular monospace numerals.'],
              ['State & Persistence', 'In-memory + Session Lifecycle', 'Cryptographically clean state handling with automated retention prune.'],
              ['Print Architecture', '@media print isolation', 'Isolated badge and muster sheet printing targeting paper/label media.'],
            ]
          ),

          createHeading('7. Release Roadmap & Acceptance Test Checklist', HeadingLevel.HEADING_1, 350, 140),
          createBullet('Verify that 100% of registrants acknowledge lawful NDPA Section 25 consent prior to pass issuance.', 'Verification 1 (Consent):'),
          createBullet('Confirm that choosing "Skip Photo" immediately completes registration without error or access refusal.', 'Verification 2 (Biometrics):'),
          createBullet('Scan reception QR standee from smartphone and verify that the public preview loads without requiring a Google login.', 'Verification 3 (Public Mobile):'),
          createBullet('Log in as Staff and confirm that all administrative tabs (Access Logs, Compliance, Muster, Users) are strictly blocked with role guards.', 'Verification 4 (RBAC):'),
          createBullet('Log in as Administrator and verify full creation, update, and deletion of user profiles with audit logging.', 'Verification 5 (User Admin):'),
          createBullet('Execute Section 37 Right to Erasure on a visitor and verify that personal data is permanently replaced with redacted placeholders.', 'Verification 6 (DSAR):'),
          createBullet('Click "Print Badge" and "Print Muster Sheet" and verify dedicated print media CSS rendering.', 'Verification 7 (Printing):'),

          new Paragraph({ spacing: { before: 300, after: 120 } }),
          createCallout(
            'DOCUMENT SIGN-OFF & CERTIFICATION',
            'This Product Requirement Document has been prepared and certified for SecurePass NDPA. It represents the binding technical and functional specification for enterprise deployments across commercial headquarters in Lagos and Abuja.'
          ),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  
  // Save to public directory for in-app download
  const publicPath = path.resolve('public', 'SecurePass_NDPA_PRD.docx');
  fs.mkdirSync(path.dirname(publicPath), { recursive: true });
  fs.writeFileSync(publicPath, buffer);

  // Also save to root workspace
  const rootPath = path.resolve('SecurePass_NDPA_PRD.docx');
  fs.writeFileSync(rootPath, buffer);

  console.log(`Document successfully generated at: ${publicPath} and ${rootPath}`);
}

generatePRDDocument().catch(err => {
  console.error('Error generating PRD document:', err);
  process.exit(1);
});
