/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

export function buildPRDPdf(outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 0.5 inch margins = 36 points, or 40 points
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 45, bottom: 45, left: 45, right: 45 },
      bufferPages: true,
      info: {
        Title: 'SecurePass NDPA - Product Requirement Document (PRD)',
        Author: 'Dr. Marcus Hale, Principal AI-Assisted Architect',
        Subject: 'Enterprise Visitor Management System PRD compliant with NDPA 2023',
        Keywords: 'NDPA 2023, NDPC, Visitor Management, PRD, RBAC, Data Protection, Lagos',
      },
    });

    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const primaryColor = '#0F172A';
    const accentColor = '#059669';
    const textColor = '#334155';
    const mutedColor = '#64748B';
    const lightBg = '#F8FAFC';
    const borderColor = '#E2E8F0';

    // Helper: Section Heading
    function drawHeading1(title: string) {
      doc.moveDown(0.8);
      // Check page break if near bottom
      if (doc.y > 680) doc.addPage();
      
      const y = doc.y;
      doc.rect(45, y, 4, 18).fill(accentColor);
      doc.font('Helvetica-Bold').fontSize(14).fillColor(primaryColor).text(`  ${title}`, 52, y);
      doc.moveDown(0.4);
    }

    function drawHeading2(title: string) {
      doc.moveDown(0.5);
      if (doc.y > 700) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(11).fillColor(accentColor).text(title, 45);
      doc.moveDown(0.2);
    }

    function drawParagraph(text: string, bold = false) {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9.5).fillColor(textColor).text(text, {
        align: 'justify',
        lineGap: 2.5,
      });
      doc.moveDown(0.3);
    }

    function drawBullet(title: string, desc: string) {
      if (doc.y > 720) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(primaryColor).text(`• ${title} `, {
        continued: true,
      });
      doc.font('Helvetica').fontSize(9.5).fillColor(textColor).text(desc, {
        lineGap: 2,
      });
      doc.moveDown(0.2);
    }

    function drawCallout(title: string, desc: string) {
      if (doc.y > 670) doc.addPage();
      const startY = doc.y;
      const boxWidth = 505;
      
      // Calculate text height roughly
      doc.font('Helvetica-Bold').fontSize(9.5);
      doc.font('Helvetica').fontSize(9);

      // Draw background box
      doc.rect(45, startY, boxWidth, 54).fillAndStroke('#F0FDF4', '#86EFAC');
      doc.rect(45, startY, 4, 54).fill(accentColor);

      doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#065F46').text(title, 56, startY + 8);
      doc.font('Helvetica').fontSize(8.5).fillColor('#166534').text(desc, 56, startY + 22, {
        width: boxWidth - 24,
        lineGap: 1.5,
      });
      doc.y = startY + 62;
    }

    function drawTable(headers: string[], rows: string[][], colWidths: number[]) {
      if (doc.y > 640) doc.addPage();
      const startX = 45;
      const totalWidth = colWidths.reduce((a, b) => a + b, 0);

      // Header row
      let y = doc.y;
      doc.rect(startX, y, totalWidth, 20).fill('#0F172A');
      let currentX = startX;
      headers.forEach((h, i) => {
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF').text(h, currentX + 6, y + 5, {
          width: colWidths[i] - 12,
        });
        currentX += colWidths[i];
      });
      y += 20;

      // Data rows
      rows.forEach((row, rowIdx) => {
        if (y > 730) {
          doc.addPage();
          y = 50;
        }
        const bg = rowIdx % 2 === 0 ? '#FFFFFF' : '#F8FAFC';
        const rowHeight = 22;

        doc.rect(startX, y, totalWidth, rowHeight).fillAndStroke(bg, borderColor);
        currentX = startX;
        row.forEach((cell, i) => {
          doc.font('Helvetica').fontSize(8).fillColor(textColor).text(cell, currentX + 6, y + 5, {
            width: colWidths[i] - 12,
            ellipsis: true,
          });
          currentX += colWidths[i];
        });
        y += rowHeight;
      });

      doc.y = y + 8;
    }

    // --- COVER / HEADER BLOCK ---
    doc.rect(45, 45, 505, 4).fill(accentColor);
    doc.y = 55;

    doc.font('Helvetica-Bold').fontSize(10).fillColor(accentColor).text('OFFICIAL PRODUCT REQUIREMENT DOCUMENT (PRD)', 45);
    doc.moveDown(0.2);

    doc.font('Helvetica-Bold').fontSize(22).fillColor(primaryColor).text('SecurePass NDPA');
    doc.font('Helvetica').fontSize(12).fillColor(mutedColor).text('Enterprise Visitor Access & Data Protection Governance System');
    doc.moveDown(0.5);

    drawCallout(
      'MANDATORY STATUTORY REGULATION COMPLIANCE',
      'This product specification is formulated in compliance with the Nigeria Data Protection Act (NDPA) 2023 and guidelines of the Nigeria Data Protection Commission (NDPC). It enforces lawful consent (Sec 25), voluntary biometrics (Sec 30), 60-day storage limits, and Data Subject Rights.'
    );

    // Document Control Table
    drawTable(
      ['Document Metadata', 'Specification & System Attribution'],
      [
        ['Product Codename', 'SecurePass NDPA (Version 2.4 Enterprise Release)'],
        ['Architect & Author', 'Dr. Marcus Hale, Principal AI-Assisted Architect & Prompt Engineer'],
        ['Target Organization', 'Zenith-Tower Holdings PLC (Victoria Island Corporate Tower, Lagos)'],
        ['NDPC Registration', 'NDPC/DPCO/2024/0912 (Licensed Data Controller)'],
        ['Governing Standards', 'NDPA 2023 (Sections 24, 25, 26, 30, 34-39) & NDPR 2019 provisions'],
        ['Security Classification', 'Commercial Confidential - Production Architecture Blueprint'],
      ],
      [140, 365]
    );

    // SECTION 1
    drawHeading1('1. Executive Summary & Problem Statement');
    drawParagraph(
      'Across commercial towers, bank headquarters, and government institutions in Lagos, Abuja, and Port Harcourt, visitor logging has historically relied on physical paper ledger books placed at reception counters. This legacy approach directly breaches key provisions of the Nigerian Data Protection Act (NDPA 2023):'
    );
    drawBullet('Lobby Shoulder-Surfing (Sec 39):', 'Subsequent visitors can openly inspect the names, phone numbers, and organizations of prior guests, causing continuous unauthorized data disclosure.');
    drawBullet('Absence of Informed Consent (Sec 25):', 'Visitors are coerced into writing personal telemetry without any notice disclosing who the data controller is, why data is captured, or how to contact the DPO.');
    drawBullet('Coerced Biometrics (Sec 30):', 'Security desks demanding badge photos without voluntary opt-outs violate Section 30, which classifies biometric data as Sensitive Personal Data.');
    drawBullet('Indefinite Retention (Sec 24(1)(d)):', 'Paper logs are hoarded indefinitely in basements or discarded in public bins without cryptographic destruction.');
    drawParagraph(
      'SecurePass NDPA replaces this with a digital touchless kiosk, public mobile QR check-in, thermal badge issuance, automated 60-day storage pruning, emergency evacuation muster roll-calls, and strict Role-Based Access Control.'
    );

    // SECTION 2
    drawHeading1('2. Product Objectives & North Star KPIs');
    drawBullet('100% Statutory NDPA Compliance:', 'Zero exposure to regulatory sanctions, enforcement notices, or audits by the Nigeria Data Protection Commission.');
    drawBullet('Sub-10 Second Check-In Speed:', 'Pre-registered guests entering an invite code (e.g. INV-7821) complete check-in and receive active badges in under 10 seconds.');
    drawBullet('Touchless Reception Adoption:', 'Visitors scan a front-desk QR standee to register on their smartphones without touching shared kiosk screens.');
    drawBullet('Real-Time Emergency Life Safety:', 'Immediate manifest of all verified individuals on site, grouped by floor and department for building fire marshals.');
    drawBullet('Privileged Role Segregation:', 'Staff accounts are restricted strictly to advance guest invitations; admin areas are secured behind authentication.');

    // SECTION 3
    drawHeading1('3. NDPA 2023 Regulatory Architecture Mapping');
    drawParagraph('The system architecture enforces compliance with the core provisions of the NDPA 2023:');

    drawTable(
      ['NDPA Article', 'Legal Requirement', 'System Implementation Mechanism'],
      [
        ['Section 24(1)(a)', 'Fairness & Transparency', 'Interactive multi-clause Privacy Notice displayed before data capture, detailing controller and lawful basis.'],
        ['Section 25(1)(a)', 'Explicit Lawful Consent', 'Active checkbox consent required before badge creation; cryptographic timestamp recorded in audit log.'],
        ['Section 25(1)(d)', 'Vital Interests', 'Emergency muster headcount justified under life-safety during building evacuation drills.'],
        ['Section 30(1)-(2)', 'Sensitive Biometrics', 'Voluntary photo studio with prominent "Skip Photo" button. Zero penalty or entry delay for refusal.'],
        ['Section 24(1)(c)', 'Data Minimization', 'Government ID numbers masked (•••• 9102); lobby privacy masking prevents shoulder-surfing.'],
        ['Section 24(1)(d)', 'Storage Limitation', 'Strict 60-day retention calendar with automated compliance flags and 1-click irreversible cryptographic purge.'],
        ['Section 34 & 37', 'Data Subject Rights', '1-Click certified DSAR Dossier generation and instant Right-to-Erasure (anonymization) execution.'],
        ['Section 39', 'Security of Processing', 'Role-Based Access Control (RBAC), password authentication, and tamper-evident audit logs.'],
      ],
      [75, 120, 310]
    );

    // SECTION 4
    drawHeading1('4. Role-Based Access Control (RBAC) Architecture');
    drawParagraph('The platform defines three operating roles with strict operational privilege boundaries:');
    drawBullet('Public Visitor (Unauthenticated):', 'Self-service kiosk and mobile touchless registration. Restricted from all administrative records.');
    drawBullet('Staff Member (Role: staff):', 'Company employees authorized strictly to access the Guest Invitations portal to schedule visitors in advance. Blocked from administrative logs.');
    drawBullet('Administrator (Role: admin):', 'Facility management, DPO, and security officers with full access to visitor logs, compliance reports, muster, and user profiles.');

    drawTable(
      ['System Module / Route', 'Public Visitor', 'Staff Member (staff)', 'Administrator (admin)'],
      [
        ['Visitor Kiosk (Self-Service)', 'ALLOWED', 'ALLOWED', 'ALLOWED'],
        ['Mobile Check-In (?mode=mobile)', 'ALLOWED', 'ALLOWED', 'ALLOWED'],
        ['Reception QR Standee Preview', 'ALLOWED', 'ALLOWED', 'ALLOWED'],
        ['Guest Invitations Portal', 'DENIED (Requires Auth)', 'FULL ACCESS (Invite Guests)', 'FULL ACCESS'],
        ['Live Access Logs & Checkout', 'DENIED', 'BLOCKED (Role Guard Enforced)', 'FULL ACCESS (View, filter, checkout, print)'],
        ['NDPA Compliance Hub & DSAR', 'DENIED', 'BLOCKED (Role Guard Enforced)', 'FULL ACCESS (Exports, audit, erasure)'],
        ['Emergency Evacuation Muster', 'DENIED', 'BLOCKED (Role Guard Enforced)', 'FULL ACCESS (Muster roll-call & print)'],
        ['User Profile Management (RBAC)', 'DENIED', 'BLOCKED (Role Guard Enforced)', 'FULL ACCESS (Create, edit, delete users)'],
      ],
      [135, 110, 125, 135]
    );

    // SECTION 5
    drawHeading1('5. Detailed Functional Specifications (FR-1 to FR-10)');
    drawBullet('FR-1: Reception Visitor Self-Service Kiosk:', 'Multi-step walk-in flow and express invite code redemption with searchable host directory and floor routing.');
    drawBullet('FR-2: Touchless Mobile Check-In:', 'Reception QR Standee pointing to the public shared URL (bypassing Google login) with an Apple/Google Wallet-style digital pass.');
    drawBullet('FR-3: Biometric Visual Studio & Section 30 Opt-Out:', 'HTML5 camera stream with snapshot, upload, and prominent "Skip Photo" button ensuring voluntary biometrics.');
    drawBullet('FR-4: Enterprise Badge Issuance & Direct Printing:', 'Thermal/Avery badge layout with verification QR token, guest Wi-Fi code, and isolated print media CSS.');
    drawBullet('FR-5: Email & SMS Notification Bridge:', 'Immediate simulated transactional alerts notifying host staff upon guest arrival and sending guest invitations with QR codes.');
    drawBullet('FR-6: Pre-Registration & Scheduled Invites:', 'Staff creation of advance guest invitations with custom security notes and VIP parking stall reservations.');
    drawBullet('FR-7: Real-Time Access Logs & Lobby Privacy Mode:', 'Live attendance grid with 1-click PII masking to prevent bystander shoulder-surfing (NDPA Sec 24(1)(c)).');
    drawBullet('FR-8: Emergency Evacuation & Muster Roll-Call:', 'Floor-by-floor headcount manifest with fire marshal check-off boxes and 1-click printable evacuation sheet.');
    drawBullet('FR-9: NDPA Compliance Hub, Retention Daemon & DSAR:', 'Real-time compliance scorecard, automated 60-day purge daemon, and certified DSAR Section 34 dossier generation.');
    drawBullet('FR-10: Enterprise Authentication & User Management:', 'Dedicated login portal with role-based routing, user profile CRUD, and immutable NDPA audit logging under Sec 39.');

    // SECTION 6
    drawHeading1('6. Technical Stack & Security Architecture');
    drawTable(
      ['Architecture Layer', 'Technology Chosen', 'Design & Security Rationale'],
      [
        ['Frontend Framework', 'React 19 SPA + Vite 8', 'High-performance reactive rendering with sub-millisecond client state settling.'],
        ['Styling Engine', 'Tailwind CSS v4 (@theme)', 'Domain-native SaaS Slate theme (#0F172A), 60-30-10 color discipline, zero CSS debt.'],
        ['QR Code Engine', 'qrcode npm package', 'Client-side generation of cryptographic verification tokens for turnstile scanning.'],
        ['Typography & Metrics', 'Plus Jakarta Sans + JetBrains Mono', 'High legibility enterprise sans paired with tabular figures (tabular-nums) for timestamps.'],
        ['Print Pipeline', '@media print isolation', 'Isolated CSS print media rules for thermal ID cards, QR standees, and muster sheets.'],
        ['PDF & Doc Generation', 'pdfkit + docx', 'Programmatic generation of executive documentation submittable to corporate leadership.'],
      ],
      [105, 140, 260]
    );

    // SECTION 7
    drawHeading1('7. Formal Acceptance Checklist');
    drawBullet('Verification 1 (Consent):', 'Confirm 100% of registrants acknowledge lawful NDPA Section 25 consent prior to pass issuance.');
    drawBullet('Verification 2 (Biometrics):', 'Verify selecting "Skip Photo" completes check-in and renders an authorized privacy silhouette on badge.');
    drawBullet('Verification 3 (Public Mobile):', 'Scan reception QR standee from smartphone and verify public preview loads without Google login.');
    drawBullet('Verification 4 (RBAC Isolation):', 'Log in as Staff and verify that Access Logs, Compliance, Muster, and Users are blocked with role guards.');
    drawBullet('Verification 5 (User Administration):', 'Log in as Admin and verify creating, updating, and deleting user profiles with audit logging.');
    drawBullet('Verification 6 (DSAR & Erasure):', 'Execute Section 37 Right to Erasure and verify personal identifiers are permanently redacted.');
    drawBullet('Verification 7 (Printing):', 'Click "Print Badge" and "Print Muster Sheet" and verify dedicated print media CSS rendering.');

    doc.moveDown(0.8);
    drawCallout(
      'DOCUMENT CERTIFICATION & AUTHORIZATION',
      'This Product Requirement Document is certified for SecurePass NDPA. It represents the binding functional and technical baseline for enterprise visitor management and data privacy governance.'
    );

    // --- FINALIZE PAGES & NUMBERING ---
    const pageRange = doc.bufferedPageRange();
    for (let i = 0; i < pageRange.count; i++) {
      doc.switchToPage(i);
      
      // Running Top Header
      doc.font('Helvetica').fontSize(7.5).fillColor(mutedColor).text(
        'SecurePass NDPA | Enterprise Product Requirement Document (PRD)',
        45,
        28,
        { align: 'right', width: 505 }
      );
      doc.rect(45, 38, 505, 0.5).fill('#CBD5E1');

      // Running Bottom Footer
      doc.rect(45, 792, 505, 0.5).fill('#CBD5E1');
      doc.font('Helvetica').fontSize(7.5).fillColor(mutedColor).text(
        `Nigeria Data Protection Act (NDPA 2023) Compliant  |  Page ${i + 1} of ${pageRange.count}`,
        45,
        798,
        { align: 'center', width: 505 }
      );
    }

    doc.end();

    stream.on('finish', () => resolve());
    stream.on('error', (err) => reject(err));
  });
}

async function main() {
  const publicPdf = path.resolve('public', 'SecurePass_NDPA_PRD.pdf');
  const rootPdf = path.resolve('SecurePass_NDPA_PRD.pdf');

  fs.mkdirSync(path.dirname(publicPdf), { recursive: true });

  await buildPRDPdf(publicPdf);
  fs.copyFileSync(publicPdf, rootPdf);

  console.log(`PDF successfully generated at: ${publicPdf} and ${rootPdf}`);
}

main().catch(err => {
  console.error('Error generating PRD PDF:', err);
  process.exit(1);
});
