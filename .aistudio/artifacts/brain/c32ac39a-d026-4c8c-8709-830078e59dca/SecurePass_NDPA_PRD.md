# Product Requirement Document (PRD)
## SecurePass NDPA - Enterprise Visitor Access & Data Protection Governance System

- **Product Version:** 2.4 Enterprise Release
- **Target Deployment:** Zenith-Tower Holdings PLC, Victoria Island Corporate Tower, Lagos, Nigeria
- **Regulatory Jurisdiction:** Nigerian Data Protection Act (NDPA 2023) / Nigeria Data Protection Commission (NDPC)
- **NDPC Controller Reg:** `NDPC/DPCO/2024/0912`
- **Architect & Author:** Dr. Marcus Hale, Principal AI-Assisted Architect & Prompt Engineer
- **Document Status:** Approved for Production
- **Word Document Output:** `/SecurePass_NDPA_PRD.docx` (Available for direct download)

---

### 1. Executive Summary & Problem Statement

#### 1.1 Background
Across commercial office towers, corporate bank headquarters, and government facilities in Lagos, Abuja, and Port Harcourt, visitor registration has historically relied on physical paper ledger books placed on reception countertops. 

This archaic approach introduces severe compliance violations under the **Nigerian Data Protection Act (NDPA 2023)**:
1. **Lobby Shoulder-Surfing (NDPA Section 39):** Every subsequent guest entering the facility can openly read the names, private mobile numbers, home or corporate addresses, and visiting host details of all prior visitors who signed the book.
2. **Absence of Lawful Processing Consent (NDPA Section 25):** Visitors are forced to surrender personal telemetry without receiving a mandatory Privacy Notice detailing who the data controller is, why data is collected, or where to contact the Data Protection Officer (DPO).
3. **Coerced Biometric Collection (NDPA Section 30):** Facilities requiring guest photos or fingerprints without explicit, informed, and uncoerced consent violate Section 30, which classifies biometric data as *Sensitive Personal Data* requiring voluntary opt-in with zero penalty for refusal.
4. **Indefinite Data Hoarding (NDPA Section 24(1)(d)):** Paper books are kept for years in unmonitored storage rooms or disposed of in municipal waste without scheduled redaction or cryptographic destruction.

#### 1.2 The SecurePass Solution
**SecurePass NDPA** is an enterprise-grade digital visitor management, badge issuance, and access governance system designed from first principles to ensure 100% compliance with NDPA 2023. It replaces physical books with self-service touchscreen kiosks, touchless mobile smartphone check-in via reception QR standees, Avery/thermal badge printing, real-time access logs with PII masking, automated 60-day storage pruning, emergency evacuation muster roll-calls, and role-based access control (RBAC).

---

### 2. Strategic Objectives & North Star KPIs

| Objective | Target Metric | Strategic Rationale |
| :--- | :--- | :--- |
| **Zero Regulatory Penalties** | 100% Statutory NDPA Compliance | Full coverage of lawful basis, DPO disclosure, DSAR requests, and Section 30 biometrics. |
| **Expedited Check-In Throughput** | < 10 Seconds for Pre-Registered Guests | Eliminate lobby congestion during morning executive rush hours (08:00–10:00). |
| **Touchless Reception Option** | > 40% Mobile Check-In Adoption | Guests scan the reception standee to register on their personal smartphone. |
| **Real-Time Life Safety** | 100% Evacuation Headcount Visibility | Immediate muster roll-call grouped by floor/department for fire marshals. |
| **Strict Role Privilege Isolation** | 0 Privileged Escalation Incidents | Staff accounts are restricted to advance invitations; administrative logs are strictly protected. |

---

### 3. NDPA 2023 Regulatory Compliance Architecture

The system enforces compliance with the following articles of the Nigerian Data Protection Act 2023:

```
+-----------------------------------------------------------------------------------+
|                        NDPA 2023 REGULATORY ARCHITECTURE                          |
+-----------------------------------------------------------------------------------+
| 1. Lawful Basis & Transparency (Sec 24 & 25)                                      |
|    - Controller Identity: Zenith-Tower Holdings PLC (NDPC/DPCO/2024/0912)         |
|    - Multi-Clause Informed Consent Notice displayed prior to submission           |
|                                                                                   |
| 2. Sensitive Biometric Governance (Sec 30)                                        |
|    - Biometric facial photos classified as Sensitive Personal Data                |
|    - Prominent voluntary "Skip Photo (NDPA Sec 30)" opt-out with ZERO penalty      |
|                                                                                   |
| 3. Data Minimization & Privacy by Design (Sec 24(1)(c) & Sec 39)                  |
|    - Masked government identification numbers (e.g. •••• 9102)                    |
|    - Reception Lobby Privacy Mode masking phone/email to prevent shoulder-surfing |
|                                                                                   |
| 4. Storage Limitation & Automated Retention (Sec 24(1)(d))                        |
|    - Strict 60-day maximum retention lifecycle                                    |
|    - 1-Click Automated Retention Purge with permanent cryptographic redaction     |
|                                                                                   |
| 5. Data Subject Rights Desk (Sec 34 & 37)                                         |
|    - Section 34 Data Subject Access Request (DSAR) official disclosure export     |
|    - Section 37 Right to Erasure / Right to be Forgotten irreversible redaction   |
+-----------------------------------------------------------------------------------+
```

---

### 4. User Personas & Role-Based Access Control (RBAC)

The application enforces a granular Role-Based Access Control model:

#### 4.1 Personas
1. **Public Visitor / Guest (Unauthenticated):**
   - Arriving guest checking in via the Reception Kiosk or by scanning the Reception QR Standee on mobile.
   - Grants consent, fills personal telemetry, optionally snaps photo, and receives digital/printed badge.
2. **Corporate Host / Staff Member (Role: `staff`):**
   - Company employee (e.g., HR, Finance, IT staff).
   - Authorized **strictly** to access the **Guest Invitations** portal to pre-register visitors in advance, allocate VIP parking, and view invite status.
   - Blocked from accessing live visitor logs, compliance reports, muster lists, or user management.
3. **Facility Administrator / Super Admin (Role: `admin`):**
   - Reception managers, Chief Security Officers (CISO), and Data Protection Officers (DPO).
   - Unrestricted access to all areas: visitor telemetry, 1-click checkouts, DSAR disclosures, retention purge daemons, emergency muster sheets, and user profile management.

#### 4.2 RBAC Permission Matrix

| Module / Route | Public Visitor | Staff Member (`staff`) | Administrator (`admin`) |
| :--- | :---: | :---: | :---: |
| **Self-Service Kiosk (`kiosk`)** | ALLOWED | ALLOWED | ALLOWED |
| **Mobile Check-In (`mobile`)** | ALLOWED | ALLOWED | ALLOWED |
| **Reception QR Standee** | ALLOWED | ALLOWED | ALLOWED |
| **Guest Invitations (`invitations`)** | DENIED (Requires Auth) | **FULL ACCESS** | **FULL ACCESS** |
| **Live Access Logs (`access_logs`)** | DENIED | **BLOCKED (Role Guard)** | **FULL ACCESS** |
| **NDPA Compliance Hub (`compliance`)** | DENIED | **BLOCKED (Role Guard)** | **FULL ACCESS** |
| **Emergency Muster List (`muster`)** | DENIED | **BLOCKED (Role Guard)** | **FULL ACCESS** |
| **User Profile Management (`users`)** | DENIED | **BLOCKED (Role Guard)** | **FULL ACCESS** |

---

### 5. Detailed Functional Requirements (FR)

#### FR-1: Reception Visitor Self-Service Kiosk
- **FR-1.1:** Support walk-in visitor self-registration and express invite code redemption (`INV-XXXX`).
- **FR-1.2:** Capture Full Legal Name, official email, phone number (Nigerian `+234` format), organization representing, vehicle plate (optional), ID document type (NIN, Driver's License, Voter's Card, International Passport), and emergency next-of-kin contact.
- **FR-1.3:** Provide a searchable corporate host directory indicating staff name, title, department, and tower floor destination.

#### FR-2: Touchless Mobile Self Check-In via Reception QR Standee
- **FR-2.1:** Front-desk poster modal displaying a high-contrast scannable QR code that directs guests to the public Shared Preview URL (`?mode=mobile`), bypassing Google account sign-in.
- **FR-2.2:** Touch-first ergonomic layout with $\ge 44\text{px}$ hitboxes, 3-step express flow, and mobile selfie camera integration.
- **FR-2.3:** Generates an Apple/Google Wallet-style digital visitor pass with active turnstile QR token, guest Wi-Fi credentials (`Zenith-Guest`), and host floor guidance.

#### FR-3: Biometric Visual Studio & Section 30 Opt-Out
- **FR-3.1:** Integrated HTML5 webcam feed (`facingMode: 'user'`) supporting live snapshot, retake, image file upload, and verified sample portrait selection.
- **FR-3.2:** Prominent **"Skip Photo (NDPA Section 30 Voluntary Opt-Out)"** affordance with explicit legal notice that badge photos are voluntary and declining incurs no penalty or access delay.
- **FR-3.3:** When opted-out, issued badges display an authorized privacy avatar labeled `"PHOTO OPT-OUT / NDPA SEC 30"`.

#### FR-4: Enterprise Badge Issuance & Direct Thermal Printing
- **FR-4.1:** Render corporate lanyard/pouch badge format including organization header, NDPC verification mark, visitor category (Standard, VIP, Contractor), security clearance level, validity date/time, and Wi-Fi credentials.
- **FR-4.2:** Dynamic verification QR token encoding verified JSON payload for turnstile barcode scanners.
- **FR-4.3:** `@media print` CSS rules targeting solely the `#printable-badge-area` element, compatible with standard Avery label sheets or direct thermal ID badge printers.

#### FR-5: Real-Time Access Logs & Front-Desk PII Masking
- **FR-5.1:** High-density data grid displaying on-premises, expected, and checked-out visitors with status filters and search.
- **FR-5.2:** 1-Click **"Lobby Privacy Mode"** toggle masking phone numbers and emails (`+234 803 ••• ••67` / `f•••a@pwc.com.ng`) to prevent shoulder-surfing by visitors standing at reception.
- **FR-5.3:** 1-Click check-out recording departure timestamp and revoking physical security clearance.

#### FR-6: Emergency Evacuation & Muster Roll-Call
- **FR-6.1:** Real-time headcount of all individuals currently inside the building grouped by floor and department.
- **FR-6.2:** Interactive check-off boxes for Fire Marshals verifying personnel at Muster Points A & B.
- **FR-6.3:** 1-Click printable evacuation roll-call sheet formatted for emergency clipboards.

#### FR-7: NDPA Compliance Hub, Retention Purge & DSAR Desk
- **FR-7.1:** Real-time compliance scorecard measuring consent rates (100%), biometric opt-in/opt-out distributions, and retention calendar status.
- **FR-7.2:** Automated tracking of 60-day storage limitation with 1-click irreversible cryptographic anonymization for expired records.
- **FR-7.3:** Data Subject Access Request (DSAR) workbench allowing instant generation of certified Section 34 dossiers and execution of Section 37 Right-to-Erasure.
- **FR-7.4:** Exportable formal compliance audit summary report formatted for submission to the Nigeria Data Protection Commission (NDPC).

#### FR-8: Enterprise Authentication & User Profile Management (Admin & Staff RBAC)
- **FR-8.1:** Dedicated authentication login page supporting email/password validation, demo 1-click test profiles, and role-based redirect.
- **FR-8.2:** User Profile Management portal for administrators to create, update, suspend, or delete user accounts with role assignment (`admin` vs `staff`).
- **FR-8.3:** Immutable audit trail recording every user creation, modification, deletion, login, and logout under NDPA Section 39.

---

### 6. Technical Stack & Architecture

- **Frontend Core:** React 19 SPA, TypeScript 5+, Vite 8
- **Styling Architecture:** Tailwind CSS v4 (`@theme`, custom fonts, zero inline style debt)
- **Design Conventions:** Domain-native SaaS Slate theme (`#0F172A`), Top Bar Contract (3 zones), single-elevation depth, tabular figures (`font-mono tabular-nums`).
- **QR Code Engine:** `qrcode` npm package (client-side dynamic SVG/canvas rendering)
- **Typography:** `Plus Jakarta Sans` (Display/Body) + `JetBrains Mono` (Data/Telemetry)
- **Print Optimization:** Isolated CSS print media rules for badges, standees, and evacuation rosters.
- **MS Word Generation:** Programmatic `.docx` generation via `docx` library with custom styling, callout tables, and headers/footers.

---

### 7. File & Artifact Delivery

- **MS Word Document (.docx):** Generated and saved at `/public/SecurePass_NDPA_PRD.docx` (downloadable via in-app button) and `/SecurePass_NDPA_PRD.docx`.
- **Markdown Specification:** Saved at `.aistudio/artifacts/brain/c32ac39a-d026-4c8c-8709-830078e59dca/SecurePass_NDPA_PRD.md`.
