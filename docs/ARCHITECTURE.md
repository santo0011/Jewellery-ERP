# Jewellery ERP — System Architecture

Status: **Phases 1–4 implemented** · Owner: Product/Engineering · Last updated: 2026-10-07

This document is the source of truth for architectural decisions. Every phase builds on it; changes to it should be deliberate and recorded in §12 (Decision Log).

---

## 1. System Architecture

### 1.1 Shape: a modular monolith

A single Node.js API process composed of strongly separated **domain modules** (sales, inventory, accounting, …), plus a React SPA. Not microservices: a jewellery ERP's core value is *consistency between stock, money and metal*, which needs multi-collection ACID transactions — trivial inside one process and one database, painful across services. Module boundaries are enforced in code so that any module can later be extracted if scale demands it.

```
                ┌──────────────────────────────────────────────────────────┐
  Browser /     │  React SPA (Vite)  — MUI · Redux Toolkit · RHF · Axios   │
  Tablet /      │  Tenant app  (/app/*)        Super Admin app (/admin/*)  │
  Mobile        └───────────────┬──────────────────────────────────────────┘
                                │ HTTPS · JSON · Bearer access token
                                │ + httpOnly refresh cookie (auth routes only)
                ┌───────────────▼──────────────────────────────────────────┐
                │  Express API  /api/v1                                    │
                │  helmet · cors · rate-limit · sanitize · requestId       │
                │  authenticate → tenantContext → authorize → validate     │
                │  ┌────────────── Domain modules ───────────────────────┐ │
                │  │ auth  org  branch  users/roles  customers  products │ │
                │  │ rates inventory sales purchase orders oldgold       │ │
                │  │ karigar repairs hr expenses accounting reports ...  │ │
                │  └─────────────────────────────────────────────────────┘ │
                │  ┌────────────── Core services (shared) ───────────────┐ │
                │  │ PricingEngine  StockLedger  JournalPosting          │ │
                │  │ DocNumbering   Approvals    AuditLog   EventBus     │ │
                │  │ FileStorage    Notifications(channels)  Limits      │ │
                │  └─────────────────────────────────────────────────────┘ │
                └───────┬───────────────────────┬──────────────────────────┘
                        │                       │
               ┌────────▼────────┐     ┌────────▼────────┐    ┌──────────────┐
               │ MongoDB         │     │ Job runner      │    │ Object store │
               │ (replica set —  │     │ (cron / queue)  │    │ (local → S3) │
               │ required for    │     │ reminders, MRR, │    └──────────────┘
               │ transactions)   │     │ notifications   │
               └─────────────────┘     └─────────────────┘
```

### 1.2 Request lifecycle

```
request
 → requestId + logger
 → security middleware (helmet, cors allowlist, rate limit, body size limit, sanitize)
 → authenticate      : verify access JWT → load user (cached) → reject if disabled / org suspended
 → tenantContext     : AsyncLocalStorage { organisationId, userId, branchIds, permissions, ip }
 → authorize(perm)   : permission check (+ branch scope check if route carries branch)
 → validate(schema)  : Zod parse of params/query/body (unknown keys stripped)
 → controller        : HTTP only — map req → service call → response
 → service           : business rules, transactions, audit, events
 → repository/model  : tenant-scoped data access
 → response envelope / central error handler
```

**Golden rule:** `organisationId`, `userId`, `createdBy`, permissions and computed prices/totals are **never** trusted from the request body. They come from the server-side context or are recomputed by services. A `branchId` in a request is accepted only after checking it against the user's allowed branches.

### 1.3 Technology choices

| Concern | Choice | Reason |
|---|---|---|
| Runtime | Node.js 22 LTS | Installed; native `--watch`, stable ESM |
| API | Express 5 | Async error propagation built-in |
| DB | MongoDB 7+ (replica set) + Mongoose 8 | Transactions for stock/money consistency |
| Validation | **Zod** (backend + frontend via `@hookform/resolvers/zod`) | One schema style across the stack; enums shared |
| Auth | `jsonwebtoken`, `bcryptjs` (cost 12) | Proven; pure JS, so no native build tools needed on Windows |
| Security | `helmet`, `cors`, `express-rate-limit`, custom body sanitizer + strict Zod parsing of every input | `express-mongo-sanitize` is incompatible with Express 5; Mongoose `sanitizeFilter` would break legitimate `$in` queries |
| Logging | `pino` + `pino-http` | Structured logs with requestId |
| Jobs | `node-cron` (Phase ≤13) → BullMQ + Redis (Phase 14) | Don't add Redis until notifications need a queue |
| PDF | `pdfmake` (server-side) | No headless Chrome; deterministic invoice layout |
| Excel | `exceljs` | Streaming export for large reports |
| Barcode/QR | `bwip-js` (server labels/PDF), `react-barcode`, `qrcode.react` (UI) | |
| Scanning | USB/Bluetooth scanner as keyboard wedge; `@zxing/browser` for camera on mobile | |
| Thermal print | Browser print with `@page { size: 80mm auto }` via `react-to-print`; ESC/POS (QZ Tray) adapter later | Works with any installed 80mm driver |
| Frontend | React 19 + Vite 8, MUI 9, Redux Toolkit + **RTK Query**, React Hook Form, Recharts, react-hot-toast, SweetAlert2 (destructive confirms only) | RTK Query removes hand-written loading/caching code; Axios is used as its base query |
| Testing | Vitest + Supertest + `mongodb-memory-server` (replica-set mode) | Calculation engine gets exhaustive unit tests |
| Repo | npm workspaces monorepo | `backend`, `frontend`, `packages/shared` |

### 1.4 Numeric representation (critical for financial & stock accuracy)

Floating-point errors are unacceptable in weights and money. All stored quantities are **integers in the smallest unit**:

| Quantity | Stored as | Example |
|---|---|---|
| Money | integer **paise** | ₹ 72,450.50 → `7245050` |
| Metal weight | integer **milligrams** | 12.345 g → `12345` |
| Stone weight | integer **milli-carats** (1 ct = 1000) | 0.75 ct → `750` |
| Purity | integer **parts per thousand (fineness)** | 22K → `916`, 18K → `750`, 24K → `999`/`995` |
| Rates | integer **paise per gram** (metal) / per carat (stones) | ₹ 7,250/g → `725000` |
| Percentages | integer **basis points** | 3% GST → `300`, 12.5% wastage → `1250` |

- `fineWeightMg = round(netWeightMg × purity / 1000)`
- Rounding happens **only** inside the PricingEngine, at defined steps, using org-configured rules (e.g. round invoice total to nearest rupee, record round-off separately).
- Conversion to display units happens only in formatting utilities (`formatINR`, `formatWeight`) in `packages/shared`.
- `Number` holds integers exactly up to 9×10¹⁵ paise (₹ 90 lakh crore) — sufficient. No Decimal128 conversions needed.

### 1.5 Time & financial year

- All timestamps stored in UTC. Each organisation has a `timezone` (default `Asia/Kolkata`).
- Every financial/stock document also stores `businessDate` (`YYYY-MM-DD` in org timezone) — day-wise reports group on it, avoiding midnight-UTC bugs.
- Indian financial year (Apr–Mar) is the default, configurable per org. Document numbers reset per FY.

---

## 2. Database Relationship Overview

### 2.1 Tenancy hierarchy

```
Platform
 ├── Plan ─────────────────────────────┐
 ├── PlatformAdmin (Super Admin users)  │
 └── Organisation ── Subscription ──────┘
      ├── Branch (1..n)
      ├── Role (system templates cloned per org + custom roles)
      ├── User ── roleIds[] ── branchAccess{ all | branchIds[] }
      ├── Settings (invoice, tax, jewellery, pricing profile, barcode, approval policies, notifications)
      ├── Masters: Customer · Supplier · Karigar · Employee · Category · Account (chart of accounts)
      ├── GoldRate (rate history)
      ├── Inventory: Product (tagged / lot) · MetalStock (bullion & old-gold pools) · StockMovement
      ├── Transactions: Sale · SalesReturn · Purchase · PurchaseReturn · CustomerOrder · OldGoldTransaction
      │                 KarigarJob · Repair · StockTransfer · Expense · Payment · Receipt · Payroll
      ├── Accounting: JournalEntry (lines → Account, optional party)
      ├── Support: ApprovalRequest · Notification · AuditLog · Counter · FileAsset · Session
      └── Loyalty: LoyaltyAccount · LoyaltyTransaction
```

### 2.2 Core relationships

```
Customer 1─* Sale 1─* (embedded) SaleItem *─1 Product
Sale     1─* SalePayment (embedded)            ─→ Receipt / JournalEntry
Sale     0─1 OldGoldTransaction (exchange)
Sale     *─0..1 CustomerOrder (order fulfilment, advance adjusted)

Supplier 1─* Purchase 1─* PurchaseItem (embedded) ─→ creates Product / MetalStock
Supplier 1─* Payment

Product  1─* StockMovement *─1 Branch           (tagged item history)
MetalStock (org, branch, metal, purity, kind) 1─* StockMovement   (weight pools)

CustomerOrder 1─* OrderItem (embedded) 1─0..* KarigarJob
Karigar 1─* KarigarJob ─→ metal issue/return StockMovements + KarigarLedger
Repair  1─* RepairItem (embedded) ─0..1 KarigarJob

Employee 1─* Attendance · Leave · Payroll ; Employee 0..1─1 User (login is optional)

Every money event ─→ JournalEntry (balanced Dr/Cr lines → Account, party {type,id})
Every stock event ─→ StockMovement (immutable) + StockBalance projection
Every sensitive action ─→ AuditLog
```

### 2.3 Collections and design notes

All tenant collections carry `organisationId` (required, indexed first in compound indexes). Branch-owned collections also carry `branchId`.

| Collection | Key fields / notes | Important indexes |
|---|---|---|
| **Organisation** | name, legalName, logo, gstin, pan, address, phone, email, currency, timezone, fyStartMonth, status (`active/suspended`), `settings` refs | `slug` unique |
| **Branch** | organisationId, code (`BR01`), name, address, gstin (state-wise GST), isHeadOffice, active | `{org, code}` unique |
| **User** | organisationId, name, email, mobile, passwordHash, roleIds[], branchAccess `{all:bool, branchIds[]}`, defaultBranchId, status, tokenVersion, passwordChangedAt, failedLoginCount, lockedUntil, employeeId? | `email` **globally** unique (one login = one organisation, so sign-in needs no shop code) |
| **Role** | organisationId, name, key, permissions[] (strings), isSystem, description | `{org, key}` unique |
| **Permission** | *Code registry, not a collection* (see §6). Served via `/meta/permissions`. | — |
| **Session** | userId, organisationId, refreshTokenHash, familyId, userAgent, ip, expiresAt, revokedAt | `refreshTokenHash`, TTL on `expiresAt` |
| **PlatformAdmin** | Super Admin users — **separate collection**, never mixed with tenant users | `email` unique |
| **Plan / Subscription** | plan limits (users, branches, products, monthly txns, storage MB, AI queries), subscription status (`trial/active/past_due/expired/suspended`), periods, gateway refs | `{org}` |
| **Settings** | one doc per org, sub-objects: invoice, tax, jewellery, pricingProfile, barcode, notifications, approvals | `{org}` unique |
| **Customer** | code, name, mobile, email, address, dob, anniversary, gstin, pan, kyc{type,number,fileId,verified}, preferences, segment, tags, openingBalance, loyalty summary, *derived* totals (lifetimeValue, lastPurchaseAt, outstanding — maintained by services) | `{org, mobile}` unique, `{org, code}` unique, text index name |
| **Supplier** | code, companyName, contact, gstin, pan, address, bankDetails, openingBalance (money and metal), paymentTerms | `{org, code}` unique |
| **Category** | name, parentId (subcategory), metal default, hsnCode, isSystem, sortOrder | `{org, parentId, name}` unique |
| **GoldRate** | metal, purity, ratePerGramPaise, unit, effectiveFrom, businessDate, source (`manual/api`), createdBy. **Append-only** — corrections create a new record | `{org, metal, purity, effectiveFrom:-1}` |
| **Product** | sku, barcode, name, categoryId, subcategoryId, jewelleryType, metal, purity, **stockType `tagged`/`lot`**, qty, weights{gross, stone, net, fine}, stones[] {type, carat, count, rate, certificate}, wastage{mode, value}, making{type, value}, charges{stone, other}, hsn, huid, hallmark{bisCentre, date}, certificateNo, costPrice, pricingMode (`rate-based`/`fixed-MRP`), fixedPrice, status (`in_stock/reserved/sold/issued_karigar/in_repair/in_transit/returned/melted`), branchId, supplierId, purchaseRef, images[], isDeleted | `{org, sku}` unique, `{org, barcode}` unique, `{org, branchId, status}`, `{org, huid}` sparse |
| **MetalStock** | Weight pools that aren't tagged pieces: fine gold bars, old gold, silver, scrap, loose stones. Key `{org, branch, metal, purity, kind}` with balance {grossMg, fineMg, qty} | unique on the key |
| **StockMovement** | **Immutable ledger.** type (purchase, sale, sales_return, purchase_return, adjustment, transfer_out, transfer_in, karigar_issue, karigar_return, repair_issue, repair_return, oldgold_purchase, oldgold_exchange, melt), direction ±, productId *or* metalStockId, branchId, qty, grossMg, netMg, fineMg, valuePaise, source{docType, docId, docNo}, businessDate, createdBy, reversalOf | `{org, productId, createdAt}`, `{org, branchId, businessDate}`, `{org, source.docId}` |
| **Sale** | invoiceNo, branchId, customerId (snapshot of name/mobile/gstin/address), items[] (**SaleItem** embedded with full **calculation snapshot**), oldGold ref & value, orderId?, discounts, taxBreakup {cgst, sgst, igst}, roundOff, grandTotal, payments[] {mode, amount, ref}, advanceAdjusted, creditAmount, status (`draft/pending_approval/completed/cancelled`), rateSnapshot, pricingProfileVersion, cancelledBy/reason | `{org, invoiceNo}` unique, `{org, branchId, businessDate}`, `{org, customerId, businessDate}` |
| **SalesReturn** | against saleId, items, refund mode, credit note no | `{org, docNo}` unique |
| **Purchase** | type (`order/invoice`), poRef, supplierId, supplierInvoiceNo, items[] (**PurchaseItem**: metal, purity, gross/net, rate, making, wastage, gst, creates products or metal stock), status with approval, payment status | `{org, docNo}` unique, `{org, supplierId}` |
| **PurchaseReturn** | against purchaseId, items, debit note | |
| **CustomerOrder** | orderNo, customerId, items[] (**OrderItem**: design, referenceImages, metal, purity, expectedWeight, targetBudget, making, stoneRequirement), stage (inquiry → … → final payment), status (`draft/confirmed/in_production/quality_check/ready/delivered/cancelled`), deliveryDate, assignedStaffId, karigarJobIds[], estimate snapshot, **rate-lock** option, advances (via Receipts), balance | `{org, orderNo}`, `{org, status, deliveryDate}` |
| **OldGoldTransaction** | docNo, type (`purchase/exchange`), customerId, items[] {description, gross, stone, net, purity (tested), fine, rate, deductionBps, meltingLossBps, value}, testedBy, total, linkedSaleId, approval status, payout mode | `{org, docNo}` unique |
| **Karigar** | name, mobile, address, specialization[], paymentType (`per_gram/per_piece/fixed`), rate, metal balance (fine mg) & money balance (derived), active | `{org, mobile}` |
| **KarigarJob** | jobNo, karigarId, source (order/repair/stock), issues[] {metal, purity, grossMg, fineMg, date}, returns[] {productId?, grossMg, fineMg}, allowedWastageBps, actualWastageMg, differenceMg, makingCharges, qc{result, by, notes}, status (`issued/in_production/returned/verified/qc_passed/approved/paid/cancelled`) | `{org, karigarId, status}` |
| **KarigarLedger** | **Not a separate store of truth** — a view over JournalEntry lines (money) + StockMovement (metal) filtered by party = karigar. Materialised only for reporting performance if needed. | |
| **Repair** | repairNo, customerId, items[] (**RepairItem**: description, beforeWeight, afterWeight, damage, repairType, materialsUsed[], estimate, finalCost, photos), stage, karigarJobId?, promisedDate, deliveredAt, status | `{org, repairNo}`, `{org, status}` |
| **StockTransfer** | fromBranchId, toBranchId, items, status (`dispatched/in_transit/received/rejected`), dispatchedBy, receivedBy | |
| **Employee** | personal, joiningDate, department, designation, branchId, salary structure {basic, allowances[], deductions[]}, documents[], emergencyContact, userId? | `{org, code}` unique |
| **Attendance** | employeeId, date, status (`present/absent/late/half_day/leave`), inAt, outAt | `{org, employeeId, date}` unique |
| **Leave** | employeeId, type, from, to, days, status, approvedBy | |
| **Payroll** | employeeId, period (`YYYY-MM`), basic, allowances, deductions, advanceRecovery, bonus, net, status (`draft/approved/paid`) | `{org, employeeId, period}` unique |
| **Expense** | category, branchId, amount, gst, payee, mode, attachments, approval status | `{org, branchId, businessDate}` |
| **Payment / Receipt** | Money out / money in. partyType (`customer/supplier/karigar/employee/other`), partyId, amount, mode(s), against[] {docType, docId, amount} (bill-wise allocation), status | `{org, docNo}` unique, `{org, partyType, partyId}` |
| **Account** | Chart of accounts: code, name, group (`asset/liability/income/expense/equity`), subGroup (cash, bank, sundry debtors, …), isSystem, branchId? | `{org, code}` unique |
| **JournalEntry** | voucherNo, voucherType (`sale/purchase/receipt/payment/journal/contra/expense/payroll/…`), date, lines[] {accountId, debit, credit, party{type,id}, branchId}, source{docType, docId}, narration. **Σdebit = Σcredit enforced** | `{org, date}`, `{org, lines.accountId, date}`, `{org, lines.party.id}` |
| **LoyaltyAccount / LoyaltyTransaction** | tier, points balance; earn/redeem/expire transactions (ledger, never edited) | |
| **ApprovalRequest** | module, docType, docId, ruleKey, reason (e.g. "discount 12% > 5%"), requestedBy, status, decidedBy, decidedAt, comment | `{org, status}` |
| **Notification** | userId or audience, type, title, body, link, channel deliveries[] {channel, status, providerRef}, readAt | `{org, userId, readAt}` |
| **AuditLog** | userId, action, module, recordType, recordId, changes (field-level diff), ip, userAgent, requestId, at. Append-only | `{org, at:-1}`, `{org, recordId}` |
| **Counter** | `{org, branchId, docType, fy}` → seq. Atomic `$inc` inside the transaction that creates the doc | unique on key |
| **FileAsset** | org, owner ref, storage key, mime (magic-byte verified), size, uploadedBy | |

### 2.4 Integrity rules

1. **Embedded line items** (`SaleItem`, `PurchaseItem`, `OrderItem`, `RepairItem`) live inside their parent document — they are bounded, always read together, and get atomic writes for free. They are defined as separate sub-schemas for reuse.
2. **Financial and stock documents are never hard-deleted or edited after completion.** Corrections are cancellations/returns that create reversing StockMovements and JournalEntries.
3. **Master data** (customer, product, supplier…) uses soft delete and is blocked from deletion when referenced by transactions.
4. **Snapshots over references** on completed documents: a Sale stores the customer's name/GSTIN/address and every price input as they were at the time.
5. **Derived balances** (product status, MetalStock balances, customer outstanding) are projections updated inside the same transaction as the ledger entry, and can be rebuilt from ledgers by a maintenance job.
6. **Transactions (`session.withTransaction`)** wrap every operation touching more than one of: stock, money, document number, approval state.

---

## 3. Folder Structure

npm workspaces monorepo:

```
jewellery-erp/
├── package.json                    # workspaces: backend, frontend, packages/*
├── .editorconfig  .gitignore  .nvmrc
├── docker-compose.yml              # MongoDB single-node replica set for local dev
├── docs/
│   ├── ARCHITECTURE.md
│   └── adr/                        # architecture decision records
├── packages/
│   └── shared/                     # pure JS, no DB / no React
│       └── src/
│           ├── permissions.js      # permission registry (single source of truth)
│           ├── roles.js            # system role templates
│           ├── enums.js            # statuses, metals, purities, payment modes
│           ├── units.js            # paise/mg/bps conversions + formatters
│           └── schemas/            # Zod schemas shared by API validators & forms
├── backend/
│   ├── package.json  .env.example
│   ├── src/
│   │   ├── app.js                  # express app (no listen)
│   │   ├── server.js               # bootstrap: db, jobs, listen, graceful shutdown
│   │   ├── config/                 # env (Zod-validated), db, logger, cors
│   │   ├── middleware/             # authenticate, tenantContext, authorize, validate,
│   │   │                           # rateLimit, sanitize, errorHandler, notFound, upload
│   │   ├── utils/                  # ApiError, asyncHandler, response, pagination, dates
│   │   ├── core/                   # cross-cutting domain services
│   │   │   ├── context/            # AsyncLocalStorage request context
│   │   │   ├── tenancy/            # tenant-scope Mongoose plugin
│   │   │   ├── pricing/            # PricingEngine (+ tests)
│   │   │   ├── stock/              # StockLedgerService
│   │   │   ├── ledger/             # JournalPostingService
│   │   │   ├── numbering/          # DocNumberService
│   │   │   ├── approvals/          # ApprovalService + policy evaluator
│   │   │   ├── audit/              # AuditService
│   │   │   ├── events/             # in-process EventBus (domain events)
│   │   │   ├── notifications/      # NotificationService + channel interfaces
│   │   │   ├── storage/            # FileStorage interface (local, s3)
│   │   │   └── limits/             # subscription limit checks
│   │   ├── modules/                # one folder per domain
│   │   │   ├── auth/
│   │   │   │   ├── auth.routes.js
│   │   │   │   ├── auth.controller.js
│   │   │   │   ├── auth.service.js
│   │   │   │   ├── auth.validator.js
│   │   │   │   └── session.model.js
│   │   │   ├── organisations/  branches/  users/  roles/  settings/
│   │   │   ├── customers/  suppliers/  categories/  products/
│   │   │   ├── rates/  inventory/  sales/  purchases/  orders/  old-gold/
│   │   │   ├── karigars/  repairs/  hr/  expenses/  accounting/
│   │   │   ├── reports/  loyalty/  notifications/  search/  ai/
│   │   │   └── platform/           # super admin: orgs, plans, subscriptions, usage
│   │   ├── jobs/                   # scheduled jobs (reminders, expiry, rebuilds)
│   │   ├── routes/index.js         # mounts module routers under /api/v1
│   │   └── seed/                   # system accounts, roles, categories, demo org (dev only)
│   └── tests/
│       ├── unit/                   # pricing, units, policy evaluator
│       └── integration/            # API + tenant isolation tests
└── frontend/
    ├── package.json  vite.config.js  index.html  .env.example
    └── src/
        ├── main.jsx  App.jsx
        ├── theme/                  # tokens, MUI theme, component overrides
        ├── store/                  # store setup, authSlice, uiSlice
        ├── services/               # axios instance (+ refresh interceptor), RTK Query baseApi
        ├── routes/                 # route table, ProtectedRoute, PermissionRoute
        ├── layouts/                # AppLayout (sidebar/header/bottom nav), AuthLayout, AdminLayout, PrintLayout
        ├── components/             # DataTable, PageHeader, FormDrawer, ConfirmDialog, StatCard,
        │                           # MoneyText, WeightText, StatusChip, EmptyState, ErrorState,
        │                           # Can, BranchSwitcher, GlobalSearch, FileUpload, DateRangeFilter
        ├── hooks/                  # usePermission, useDebounce, useBreakpoint, useBarcodeScanner
        ├── utils/                  # formatting re-exports from shared, download helpers
        └── features/
            ├── auth/  dashboard/  customers/  suppliers/  products/  inventory/
            ├── rates/  sales/  purchases/  orders/  old-gold/  karigars/  repairs/
            ├── staff/  expenses/  accounts/  reports/  branches/  settings/
            ├── notifications/  loyalty/  ai/
            └── admin/              # super admin panel
            # each feature: api.js (RTK Query endpoints), pages/, components/, schemas re-exported
```

Why `modules/` instead of top-level `controllers/ models/ routes/`: with ~25 domains, layer-first folders become 25-file directories where related code is far apart. Module-first keeps each domain's route/controller/service/model/validator together; truly shared layers (`middleware`, `utils`, `config`, `core`, `jobs`) stay top-level. The controller → service → model separation is preserved inside every module.

---

## 4. Authentication Architecture

### 4.1 Tokens

| Token | Lifetime | Storage | Purpose |
|---|---|---|---|
| Access JWT | 15 min | **Memory only** (Redux) | `Authorization: Bearer` on API calls |
| Refresh token | 7 days (30 with "remember device") | **httpOnly, Secure, SameSite=Strict cookie**, `Path=/api/v1/auth` | Obtain new access token |

Access JWT claims: `sub` (userId), `org`, `sid` (sessionId), `tv` (token version), `aud` (`tenant` or `platform`). Permissions are **not** placed in the token; they are loaded server-side (cached per user, invalidated on role change), so revocation is immediate.

### 4.2 Refresh rotation with reuse detection

- Refresh token = random 256-bit value; only its SHA-256 hash is stored in `Session`.
- Each refresh issues a new token and invalidates the old one (same `familyId`).
- If an already-used token is presented → the whole family is revoked (token theft signal) and an audit event is logged.
- Because the refresh cookie is SameSite=Strict and scoped to the auth path, and all other APIs use a header token, CSRF exposure is negligible.

### 4.3 Flows

- **Login**: email + password → rate limited (per IP and per account) → lockout after N failures → Session created → audit `auth.login`.
- **Logout**: revoke session, clear cookie. **Logout all devices**: revoke all sessions for user.
- **Forgot password**: always returns the same response (no account enumeration); one-time token (hashed, 30 min) sent via the Email channel; in dev, logged to console.
- **Reset password**: consumes token, sets new hash, bumps `tokenVersion` → all sessions revoked.
- **Change password**: requires current password; revokes other sessions.
- **Session management**: list active sessions (device, IP, last used) and revoke individually.
- **Password policy**: min 8 chars, checked against common-password list; bcrypt cost 12.
- **Super Admin**: separate login route, `PlatformAdmin` collection, `aud=platform` tokens. Tenant tokens are rejected on platform routes and vice-versa. MFA (TOTP) planned for platform admins and optionally org admins.

---

## 5. Organisation / Tenant Architecture

### 5.1 Model: shared database, shared collections, `organisationId` discriminator

Chosen for cost and operability at the expected scale (hundreds to low thousands of shops). The path to database-per-tenant for large enterprise customers stays open because all access goes through tenant-aware repositories.

### 5.2 Isolation — defence in depth

1. **Context**: `tenantContext` middleware stores `{ organisationId, userId, branchIds, permissions }` in AsyncLocalStorage from the verified token + DB user. Nothing tenant-related is read from the request body.
2. **Mongoose tenant plugin** applied to every tenant schema:
   - auto-sets `organisationId` on create;
   - injects `organisationId` into every `find*`, `update*`, `delete*`, `countDocuments`, and `aggregate` (prepended `$match`);
   - **throws** if a tenant query runs without a context, unless explicitly marked `{ skipTenant: true }` (used only by platform/jobs code, and audited).
3. **Services** also pass `organisationId` explicitly in critical queries (belt and braces).
4. **Unique indexes are tenant-scoped** (`{organisationId, sku}`), so one shop's SKU never collides with or reveals another's.
5. **IDs from the client are always re-resolved within the tenant**: `GET /customers/:id` → `findOne({ _id, organisationId })`; a foreign ID returns 404, not 403 (no existence leak).
6. **Automated isolation tests**: two orgs seeded; every module's integration suite asserts org B cannot read/update/delete org A's records.

### 5.3 Branch scoping

- Users have `branchAccess: { all: true }` or a list of branch IDs, plus an active branch selected in the header.
- Branch-owned queries are filtered to allowed branches; writes must target an allowed branch.
- Consolidated (org-level) dashboards require `branch.viewAll` / `branchAccess.all`.

### 5.4 Organisation onboarding

`POST /auth/register-organisation` (or created by Super Admin) runs in one transaction: Organisation → Subscription (trial) → Settings (defaults) → head-office Branch → system Roles (cloned from templates) → Chart of Accounts (system accounts) → default Categories → admin User.

### 5.5 Subscription limits

`limits.check('branches')` style guards on create endpoints; usage counters for monthly transactions and AI queries. Expired subscription → read-only mode (grace period), suspended → login blocked with a clear message.

---

## 6. Role & Permission Architecture

### 6.1 Permission keys

Format `module.action`. The registry in `packages/shared/src/permissions.js` is the single source of truth, consumed by backend middleware, role editor UI, and frontend guards.

| Module | Actions |
|---|---|
| dashboard | view, viewFinancials |
| organisation | view, edit |
| branch | view, create, edit, delete, viewAll |
| user | view, create, edit, delete |
| role | view, create, edit, delete |
| settings | view, edit |
| customer | view, create, edit, delete, export, viewKyc |
| supplier | view, create, edit, delete, export |
| category | view, create, edit, delete |
| product | view, create, edit, delete, export, print (labels), viewCost |
| rate | view, create |
| inventory | view, adjust, transfer, approve, export |
| sales | view, create, edit (draft), cancel, return, print, discount, approve, export |
| purchase | view, create, edit, cancel, return, approve, export |
| order | view, create, edit, cancel, approve, print |
| oldgold | view, create, approve, print |
| karigar | view, create, edit, delete, issue, receive, approve, pay |
| repair | view, create, edit, cancel, print |
| employee | view, create, edit, delete |
| attendance | view, mark, edit |
| leave | view, apply, approve |
| payroll | view, process, approve |
| expense | view, create, edit, delete, approve |
| accounts | view, receipt, payment, journal, export |
| report | sales, inventory, customer, karigar, finance, export |
| audit | view |
| ai | use |
| subscription | view, manage |

Sensitive split permissions (`product.viewCost`, `dashboard.viewFinancials`, `customer.viewKyc`) let shops hide margins and KYC from sales staff — a very common real-world requirement.

### 6.2 Roles

- **System role templates** (Organisation Admin, Branch Manager, Sales Manager, Sales Staff, Inventory Manager, Purchase Manager, Accountant, HR Manager, Karigar Manager, Staff, Viewer) are cloned into each new organisation. Their permissions can be viewed; system roles can be duplicated into editable custom roles.
- **Organisation Admin** has the wildcard `*` within its own org.
- **Super Admin** is a platform role, not a tenant role (separate collection/token audience) — it cannot accidentally appear in a tenant's role list.
- Users may hold multiple roles; effective permissions = union.

### 6.3 Enforcement

- Backend: `router.post('/', authorize('sales.create'), validate(schema), controller.create)`. Field-level rules (e.g. discount above threshold, cost price visibility) are enforced in services/serializers.
- Frontend: `usePermission('sales.create')`, `<Can perm="…">`, and `PermissionRoute`. Buttons are hidden when not permitted — **UI hiding is convenience; the server is the authority.**

---

## 7. Core Business Engines

### 7.1 PricingEngine (backend, single source of truth)

A pure, deterministic, fully unit-tested module: `quote(input, pricingProfile, rates) → breakdown`.

```
netWeight      = gross − stone                                  (mg)
wastageWeight  = per profile: % of net | fixed mg | none          (mg)
metalValue     = net × rate(metal, purity)
wastageValue   = wastageWeight × rate
making         = per item/profile: per-gram × net | % of metalValue | fixed per piece | per-gram on (net+wastage)
stoneValue     = Σ stones (carat × rate or fixed)
otherCharges   = hallmarking, certification, packaging…
subtotal       = metal + wastage + making + stone + other
discount       = flat | % (of making only | of subtotal)  → approval if > threshold
taxable        = subtotal − discount
gst            = configured split (e.g. 3% on goods; separate rate on making if org chooses) → CGST+SGST (intra-state) or IGST (inter-state)
roundOff       = per profile (nearest ₹1 / none)
total          = taxable + gst ± roundOff
```

- The **PricingProfile** (in Settings) decides modes and order of operations; each profile change creates a new version and invoices store the version used.
- POS/estimate screens call `POST /pricing/quote` (debounced) for live previews — React never re-implements the formula. On save, the server **recomputes** from inputs and ignores any client totals.
- Every SaleItem stores the full breakdown + inputs + rate used = **calculation snapshot**. Historical invoices never change when today's rate changes.
- Old-gold valuation uses the same engine: `fine = net × testedPurity/1000`; `value = fine × rate − deductions − melting loss`.

### 7.2 StockLedgerService

The **only** code path that changes stock. `postMovements(session, movements[])`:
- validates availability (no negative stock unless org allows), product status transitions (e.g. `in_stock → sold`),
- writes immutable `StockMovement` docs, updates the Product/MetalStock projection in the same transaction,
- tracks gross, net and **fine** weight for every movement so metal can be reconciled to the milligram.

### 7.3 JournalPostingService (double-entry under the hood)

Every money event (sale, receipt, purchase, payment, expense, payroll, karigar charge, old-gold purchase) posts a balanced JournalEntry inside the same transaction. Cash book, bank book, customer/supplier/karigar/expense ledgers, receivables, payables, P&L and cash flow are **queries over journal lines** — there is one money truth, and Tally/Zoho export is a mapping of vouchers, not a rewrite. Users never need to understand debits/credits; the UI speaks in "received", "paid", "outstanding".

Metal is ledgered in parallel (fine weight) for karigars and suppliers who deal in metal accounts.

### 7.4 DocNumberService

`INV/BR01/26-27/000123` style, configurable prefix per doc type and branch, atomic counter in the creating transaction → no gaps from concurrency, no duplicates.

### 7.5 ApprovalService

`ApprovalPolicy` rules in Settings: `{ module: 'sales', condition: { field: 'discountPct', op: '>', value: 500 /*bps*/ }, approverPermission: 'sales.approve' }`. Services call `approvals.evaluate(doc)`; if a rule fires, the document stays in `pending_approval`, an `ApprovalRequest` + notification is created, and stock/journal postings happen only on approval.

### 7.6 AuditService

Called from services (not Mongoose hooks — hooks lack business meaning). Records user, action, module, record, field-level diff of changed fields (sensitive fields redacted), IP, user agent, requestId. Written in the same transaction for financial actions.

### 7.7 EventBus → Notifications

Services emit domain events (`sale.completed`, `order.delayed`, `repair.ready`, `rate.updated`, `stock.low`). Subscribers create in-app notifications and enqueue channel deliveries. Channels implement one interface:

```
NotificationChannel { name; send({ to, template, data, organisationId }) → { status, providerRef } }
```

Providers (`ConsoleEmail`, `SmtpEmail`, `WhatsAppCloud`, `Msg91Sms`, …) are registered by config — nothing hard-coded. Templates are per org per event per channel.

### 7.8 AI Assistant (architecture only — Phase 15)

- The LLM never touches the database or writes queries. It calls a fixed set of **read-only tools** (`getSalesSummary`, `getStockByMetal`, `getOutstandingReceivables`, `getSlowMovingProducts`, `getDelayedOrders`, `getBranchPerformance`, `getTopCustomers`, `getProfitSummary`, `getReorderSuggestions`).
- Each tool is a thin wrapper over existing report services and runs **inside the requesting user's tenant context**, so the same tenant plugin, branch scope and permissions apply (e.g. no profit tool for a user without `dashboard.viewFinancials`).
- Only aggregated, minimal data is returned to the model; PII (KYC, PAN) is never sent.
- Provider-agnostic `LlmClient` interface (Claude API with tool use as default), usage metered per org against plan limits, conversation logs stored per org.

### 7.9 Compliance hooks (India-first, configurable)

GST (CGST/SGST vs IGST by place of supply, HSN 7113 etc.), HUID capture for hallmarked gold, PAN capture above the configured sale threshold, cash-receipt limit warning/blocking (Sec. 269ST), e-invoice/e-way-bill fields reserved. All thresholds live in Tax/Jewellery Settings, not code.

---

## 8. API Conventions

- Base: `/api/v1/<module>`; REST nouns; actions as sub-resources (`POST /sales/:id/cancel`, `POST /approvals/:id/approve`).
- Success: `{ "success": true, "data": …, "meta": { "page": 1, "limit": 20, "total": 134 } }`
- Error: `{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [ { "path": "items.0.grossWeight", "message": "…" } ] }, "requestId": "…" }`
- Pagination: `page/limit` (max 100) for lists; cursor (`after`) for ledgers and audit logs. Sort whitelist per endpoint.
- Filtering: whitelisted query params validated by Zod; free text via `q`.
- Idempotency: POS sale/receipt creation accepts an `Idempotency-Key` header to prevent duplicate invoices on network retry.
- Money/weight in API payloads use the integer units of §1.4.

---

## 9. Main Navigation Structure

Desktop: collapsible left sidebar (grouped), top header with **global search (Ctrl/⌘ K)**, branch switcher, today's gold rate chip, notifications, profile. Mobile/tablet: bottom navigation with 5 slots + "More" sheet; sticky primary action on forms.

```
OVERVIEW
  Dashboard
  Gold & Silver Rates
SALES
  POS / New Sale
  Invoices
  Sales Returns
  Estimates & Quotations
  Old Gold (Purchase / Exchange)
CUSTOMERS
  Customers (360°)
  Orders (custom jewellery)
  Repairs
  Loyalty
INVENTORY
  Products / Tagged Items
  Metal Stock (bullion, old gold)
  Stock Ledger
  Stock Transfers
  Adjustments
  Barcode Labels
  Categories
PURCHASE
  Suppliers
  Purchase Orders
  Purchase Invoices
  Purchase Returns
KARIGAR
  Karigars
  Job Work
  Metal Issue / Receive
ACCOUNTS
  Receipts
  Payments
  Expenses
  Cash Book / Bank Book
  Ledgers (Customer · Supplier · Karigar)
  Journal Entries
STAFF
  Employees
  Attendance
  Leave
  Payroll
REPORTS
  Sales · Inventory · Customers · Karigar · Finance
APPROVALS            (badge count)
SETTINGS
  Organisation · Branches · Users & Roles · Invoice · Tax · Jewellery & Pricing
  Rates · Barcode · Notifications · Approvals · Subscription · Audit Log
```

Mobile bottom nav: **Home · POS · Search/Scan · Orders · More**.
Items the user lacks permission for are not rendered; empty groups disappear.

Super Admin (separate layout, `/admin`): Dashboard · Organisations · Subscriptions · Plans · Usage · Revenue · Support Tickets · System Settings · Platform Admins.

---

## 10. UI Design System

### 10.1 Principles

Quiet luxury: the software should feel like a private bank statement crafted for a jeweller — restrained, precise, confident. **Gold is a signal, not a surface.**

### 10.2 Color tokens

| Token | Light | Dark (sidebar / dark mode) | Use |
|---|---|---|---|
| `ink` | `#171717` | `#F7F3E8` | Primary text, sidebar background (light mode) |
| `gold` | `#C9A227` | `#D4B13F` | Primary CTA, active nav, key figures, focus ring, accents |
| `goldDark` | `#9C7A16` | `#C9A227` | CTA hover/pressed, gold text on light backgrounds (contrast) |
| `cream` | `#F7F3E8` | `#1F1E1B` | App background, highlighted panels |
| `paper` | `#FFFFFF` | `#232220` | Cards, tables, dialogs |
| `soft` | `#F4F4F2` | `#2A2926` | Table header, input background, hover rows |
| `border` | `#E6E1D3` | `#3A3833` | 1px hairlines (preferred over shadows) |
| `muted` | `#6B6760` | `#A8A398` | Secondary text |
| `success` | `#2E6B4F` | `#5FA884` | Paid, in stock, approved |
| `warning` | `#B7791F` | `#E0A84A` | Pending, due soon |
| `danger` | `#9B2C2C` | `#E07070` | Overdue, cancelled, negative |
| `info` | `#2F5D7C` | `#7FA8C9` | Neutral information |

In code, gold text uses the `accent` palette key (`color="accent"`), which maps to `goldDark` in light mode. MUI 9's Typography/Link `color` prop accepts palette keys (`accent`, `error`, `textSecondary`), not paths like `text.secondary`; use `sx` for paths.

Rules: gold text on white uses `goldDark` (WCAG AA); never gold-on-gold; one gold CTA per view; no gradients except a subtle 1px gold rule on the dashboard header; status colors are muted, never neon.

### 10.3 Typography

- **Inter** (UI & numbers) with `font-feature-settings: "tnum"` so weights and money align in columns.
- **Cormorant Garamond** only for the brand wordmark and the dashboard greeting — a jewellery cue without hurting legibility.
- Scale: 12 / 13 / 14 (body) / 16 / 20 / 24 / 32. Weights 400/500/600. Uppercase 11px letter-spaced labels for section headings and table headers.

### 10.4 Shape, spacing, elevation

- Radius: 6px inputs/buttons, 8px cards, 12px dialogs. No pill cards.
- Spacing on a 4px grid; dense tables (40px rows desktop), comfortable touch targets (≥44px) on mobile.
- Elevation: borders by default; a single soft shadow for overlays (menus, dialogs, drawers).

### 10.5 Signature components

- **StatCard**: uppercase label, large tabular figure, delta vs previous period; gold used only for the primary metric.
- **RateTicker** in header: `22K ₹ 7,250/g` — click opens rate update (if permitted).
- **WeightText / MoneyText**: consistent formatting (`12.345 g`, `₹ 1,23,456.00` Indian grouping, fine weight shown as secondary text).
- **DataTable**: server-side pagination/sort/filter, column visibility, row actions, CSV/Excel/PDF export; becomes a **card list on mobile**.
- **FormDrawer** (right drawer on desktop, full-screen sheet on mobile) for create/edit; **ConfirmDialog** for destructive actions.
- **StatusChip** with a fixed status→color map shared across modules.
- **EmptyState / ErrorState / Skeleton** loaders standardised.
- **POS layout**: scan/search bar always focused, item list with expandable calculation breakdown, sticky totals & payment panel (bottom sheet on mobile).
- **Print templates**: A4 invoice, 80mm thermal receipt, barcode labels (configurable size, e.g. 50×25 mm jewellery tags), repair & order receipts, old-gold exchange document.

### 10.6 Dark mode

Supported from the theme layer (tokens above); default is light with a charcoal sidebar.

---

## 11. Development Roadmap

The requested 17 phases are kept, with two adjustments that protect data integrity:

- **Phase 1 also builds the core plumbing** (request context, tenant plugin, audit service, doc numbering, error/response conventions, isolation tests) — every later module depends on it.
- **Accounting *posting* core (Chart of Accounts + JournalPostingService) moves into Phase 4**, before Sales. Retrofitting journal entries onto existing invoices is the most common way ERPs end up with ledgers that don't match. Phase 12 then builds the accounting *screens and reports* on top.

| # | Phase | Key deliverables | Exit criteria |
|---|---|---|---|
| 1 | Foundation | Monorepo, Docker Mongo replica set, config, logging, security middleware, error handling, tenant plugin & context, Organisation/Branch/User/Role/Session models, permission registry, auth (login, refresh rotation, logout, forgot/reset/change password, sessions), org registration, audit service, counters; frontend shell, theme, auth pages, layouts, guards | Isolation tests pass; auth flows tested; app shell responsive |
| 2 | Dashboard shell + Settings + Users | Settings modules (org, branch, invoice, tax, jewellery, barcode), user & role management UI, branch management, dashboard layout with real (initially sparse) widgets | Admin can configure org and invite users with roles |
| 3 | Masters | Customers (incl. 360 shell), Suppliers, Categories, Products (tagged/lot, images, HUID) | CRUD + search/filter/pagination/permissions everywhere |
| 4 | Rates + Inventory + Ledger core | GoldRate history, StockLedgerService, MetalStock, adjustments (with approval), branch transfers, stock ledger UI, **Chart of Accounts + JournalPostingService**, ApprovalService | Stock reconciles from movements; journals balance |
| 5 | POS & Invoicing | PricingEngine + quote API, POS, mixed payments, credit, invoice A4/80mm/PDF, barcode labels & scanning, sales return, cancel | Engine unit tests; invoice snapshot immutable under rate change |
| 6 | Purchase | PO, purchase invoice (creates stock), returns, approvals, supplier payments & ledger | Supplier ledger = journal view |
| 7 | Customer Orders | Estimate, advance (receipt), rate-lock, stages, delivery → sale conversion with advance adjustment, delay reminders | |
| 8 | Old Gold | Purchase & exchange, multi-item, testing/purity, deductions, approval, exchange docs | |
| 9 | Karigar | Profiles, job work, metal issue/return, wastage & difference, QC, payments, metal + money ledger | Issued − returned − allowed wastage reconciles |
| 10 | Repairs | Intake, inspection, estimate, karigar link, before/after weights, delivery, receipt | |
| 11 | HR | Employees, attendance, leave, payroll (posts journals) | |
| 12 | Expenses + Accounting | Expenses with approval, receipts/payments/journal/contra UI, cash/bank book, ledgers, P&L, cash flow, outstanding | Trial balance balances |
| 13 | Reports & Analytics | All reports with filters, branch, date range, Excel/PDF/print; dashboard charts | |
| 14 | Notifications, Loyalty, Communication | EventBus subscribers, queue (BullMQ/Redis), channel interfaces, templates, loyalty tiers/points | |
| 15 | AI Assistant | Tool layer over reports, tenant-scoped execution, chat UI, usage metering | Cross-tenant red-team tests pass |
| 16 | SaaS & Super Admin | Plans, limits, subscriptions, trial/expiry, payment-gateway interface, platform admin panel, MRR | |
| 17 | Hardening & Launch | Security audit, load tests, index review, backups/restore drill, CI/CD, monitoring, deployment | |

---

## 12. Decision Log

| # | Decision | Rationale |
|---|---|---|
| D1 | Modular monolith, module-first folders | Transactions across stock/money; maintainability |
| D2 | Shared DB + `organisationId` + enforced tenant plugin | Cost-effective; defence in depth |
| D3 | Integer units (paise, mg, ppt, bps) | Exact arithmetic for money and metal |
| D4 | Immutable StockMovement + JournalEntry ledgers with projections | Auditability, rebuildable balances |
| D5 | Backend-only PricingEngine + quote API + snapshots | One formula; historical invoices immutable |
| D6 | Access token in memory, rotating refresh token in httpOnly cookie | XSS can't steal long-lived credentials; CSRF minimal |
| D7 | Permission registry in code, roles in DB | Type-safe keys; per-org customisable roles |
| D8 | Super Admin in separate collection & token audience | No path for tenant users to escalate to platform |
| D9 | Accounting posting core in Phase 4 | Ledgers consistent from the first invoice |
| D10 | MongoDB replica set mandatory (incl. local dev) | Multi-document transactions |

## 13. Phase 1 Defaults (revisit if needed)

Phase 1 went ahead without answers to the open questions, so these defaults apply:

1. **Language:** JavaScript (ES modules), as in the original brief. Switching to TypeScript later is possible module by module.
2. **Database:** any MongoDB replica-set URI. For local development, `npm run dev:db` starts a persistent single-node replica set using the MongoDB binary cached by `mongodb-memory-server`, so no Docker or MongoDB install is needed.
3. **Region:** India-first (GST state codes, GSTIN/PAN validation, Apr–Mar FY, INR).
4. **Brand:** product name comes from `VITE_APP_NAME` (default "Jewellery ERP").

## 14. Implementation Notes (learned in Phase 1)

- **Tenant context and lazy queries:** a Mongoose query or aggregate runs when it is awaited. Await it *inside* the function passed to `runWithContext`; returning an un-awaited query lets it run outside the context, and the tenant plugin will throw.
- **Escalation guard:** a user can only grant permissions they hold themselves (`PERMISSION_ESCALATION`).
- **Refresh concurrency:** the frontend serialises token refreshes across tabs with `navigator.locks`, so rotation never causes false token-reuse detection.
- **Password change and cached queries:** after any password change the old access token is invalid. Store the new token first, then refetch cached data; otherwise a refetch with the old token gets a 401 and signs the user out.
- **Forced password change:** users created by an admin, or given a temporary password, have `mustChangePassword`. The API refuses everything except `/auth/*` (`PASSWORD_CHANGE_REQUIRED`) until they change it.
- **Settings storage:** business settings live in one `Settings` document per organisation with sections `invoice`, `tax`, `jewellery`, `barcode`. Money is stored in paise and rates in basis points; the UI converts to ₹ and % only for display. Missing keys fall back to `settings.defaults.js`, so new settings need no migration.
- **Files:** uploads go through `core/storage` (local driver now, S3-compatible later). The file type is detected from its signature bytes, not the extension; SVG is refused.
- **Products before stock (Phase 3):** products are created as `draft` catalogue entries. They enter stock only through a stock movement (opening stock or purchase, Phase 4+), never by editing status. Once stocked, metal, purity, weights, stones and branch are locked and change only via adjustments or transfers.
- **Weights:** `deriveWeights` in `packages/shared` (1 ct = 200 mg) is the single implementation. The server stores the derived stone, net and fine weights; the UI uses the same function only for a live preview.
- **Sensitive fields:** customer PAN/KYC are masked without `customer.viewKyc`, and product cost is omitted without `product.viewCost`. Edits by such users keep the stored values unchanged.
- **Codes:** customers `C00001`, suppliers `S0001`, products use the barcode SKU prefix (`JW000001`), all from an atomic per-organisation counter inside the creating transaction.
- **Stock ledger (Phase 4):** `core/stock/stockLedger.service.js` (`moveProducts`, `moveMetal`) is the only code allowed to change product stock status or metal pool balances. Product status changes use a conditional update on the expected current status, so concurrent edits fail instead of double-moving. `StockMovement` rejects any update or delete at the model level.
- **Journals:** `core/ledger/posting.service.js` posts balanced double-entry journals against system accounts (seeded per organisation) and refuses unbalanced entries. Current postings: opening stock (Dr stock / Cr opening equity), adjustments (stock loss or gain), transfers (stock moved between branch dimensions), customer and supplier opening balances (revised by reversal, never edited). Values use cost price; items without a cost post nothing.
- **Approvals:** modules register a handler per document type (`registerApprovalHandler`). Approving runs the handler in the same transaction as the decision, so a failed post leaves the request pending. Self-approval is allowed only for full-access administrators.
- **Document numbers:** `PREFIX/BRANCH/FY/0001` (e.g. `OS/HO/26-27/0001`), using the organisation's timezone and financial-year start.
- **Existing data:** `node --env-file=.env scripts/backfill-opening-balances.js` posts journals for customer and supplier opening balances created before Phase 4.

## 15. Access hierarchy: Super Admin → Organisation → Branch → Users

- **Super Admin (platform):** separate `PlatformAdmin` collection, `aud=platform` tokens, its own refresh cookie (`jerp_prt`, path `/api/v1/platform/auth`) and `PlatformAudit` log. Tenant and platform tokens and sessions are mutually rejected. Create the first one with `npm run create-super-admin -w backend -- <email> <password> [name]`. The web panel lives at `/admin`.
- **Organisations are created by Super Admin** (`POST /api/v1/platform/organisations`) with a **branch limit**. Public self-sign-up is off by default (`ALLOW_PUBLIC_SIGNUP=false`). The owner gets a temporary password and must change it at first sign-in.
- **Branch limit:** `Organisation.branchLimit` counts active branches, including the head office. Creating or reactivating beyond it fails with `BRANCH_LIMIT_REACHED`. Super Admin can raise or lower it, but not below current usage (`BRANCH_LIMIT_BELOW_USAGE`).
- **Branch access:** `Branch.allowedPermissions` (null = everything) lists the branch-scoped permissions (`BRANCH_SCOPED_MODULES` in `packages/shared`) the organisation allows there. Organisation-level modules (users, roles, settings, rates, categories, audit, organisation, branches) are never branch-limited. Only all-branch users with `branch.edit` can change it.
- **Effective permissions** for every request = role permissions ∩ the active branch's allowed list. The active branch comes from `X-Branch-Id`, else the user's default, else the first accessible branch. `/auth/me` returns these effective permissions, so menus follow the selected branch. Escalation checks (granting roles) use the full role permissions, because role management is organisation-level.
