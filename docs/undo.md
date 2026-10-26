# Undo & Reversal

Every panel — Super Admin, Organisation and each Branch — has an **Undo** button in its top bar. It takes back the
latest action done in that panel: by putting things back as they were (**undo**), or, for money and stock, by
making reversing entries while the original stays on record (**reversal**). Nothing is ever deleted from the record
of what happened: an undone action stays in **Undo history** with who undid it, when, why and what came of it, and the
audit log gets an entry too.

## How it works for people

1. Click **Undo** (↶) in the top bar. It shows the latest action of each panel you work in:
   - **Organisation (shared records)** — customers, suppliers, items, categories, users, roles, branches, settings,
     metal rates, organisation details. Only people with access to every branch see this one.
   - **Each branch** you work in — its bills, purchases, stock, transfers, expenses, orders, staff and payroll.
   - **Super Admin panel** — organisations, plans, subscriptions, email settings (Super Admins only).
2. Each latest action shows what it was, who did it and when, and **what undoing it will do**.
3. **Undo…** / **Reverse…** opens a confirmation: a **reason is required** (at least 5 letters) and you tick
   *"I understand what this will change"*. It all happens at once or not at all.
4. Then the action before it comes up, and so on — one at a time, newest first.
5. If the latest action **cannot be undone safely** (something was built on it since — a piece was sold, a payment
   was made), the button says exactly why. You can fix that first, or **Keep it & move on…** (again with a reason):
   the action stays as it is, marked *Kept*, and Undo moves to the action before it.

**Undo history** (Settings → Users & access → Audit log → *Undo history* tab; Super Admin → Settings → Undo history) lists every action
with its status: *Can be undone*, *Undone*, *Kept*, or *Reversed elsewhere* (already taken back from its own page —
e.g. an invoice cancelled from the invoice — so Undo skips it).

## Rules that keep it safe

| Rule | How |
|---|---|
| Only the latest action of a panel | The server refuses any other (`UNDO_NOT_LATEST`). |
| Never twice | The action is claimed atomically; a second try gets `UNDO_ALREADY_DONE`. |
| Reason + confirmation | Required by the dialog and by the API (`reason`, 5–300 characters). |
| All or nothing | The undo and everything it changes run in one database transaction; a failure part-way rolls all of it back (covered by a test). |
| Dependency check | Each action type checks, right before running, that nothing depends on it (pieces still in stock, metal still there, no later payments, not edited again, …). |
| Permissions | `undo.view` to see, `undo.undo` to act, **plus** the permission the action itself needs (cancelling an invoice needs `sales.cancel`, removing a customer needs `customer.delete`, …). |
| Panels and isolation | Organisation stack: all-branch users only. Branch stack: users of that branch only. Another organisation's actions are invisible (404). Super Admin's stack is separate and needs a Super Admin login. |
| Original kept | Records are cancelled, voided, withdrawn or marked — never deleted — except records that were only *added* and are unused (removing them is the undo). |

Roles: **Organisation Admin** has Undo (full access). **Branch Manager** gets `undo.view` + `undo.undo` by default.
Other roles get it from the role editor (*Administration → Undo*).

## What can be undone

**Undo** = put back as it was. **Reversal** = reversing entries; the original stays, marked cancelled / void / reversed.

### Organisation panel (shared records)

| Action | Kind | What undoing does | Refused when |
|---|---|---|---|
| Customer added | Undo | Deletes the customer | Already used (bills, orders, ledger — e.g. an opening balance) |
| Customer edited | Undo | Saves the earlier details again | Edited again since; the edit changed the opening balance / advance (money moved) |
| Customer activated / deactivated | Undo | Sets the earlier status | Changed again since |
| Customer deleted | Undo | Brings the customer back | Another customer now has the mobile |
| Supplier added / edited / status / deleted | Undo | Same as customers | Old balance changed and purchases or payments exist since; GSTIN now on another supplier |
| Item added / edited / status / deleted | Undo | Same pattern | Pieces were made from the item; name/code now taken |
| Category added / edited / deleted | Undo | Same pattern | Category in use; parent deleted; name taken |
| Role added / edited / deleted | Undo | Same pattern | Users have the role; name taken |
| User added / edited / status / deleted | Undo | Same pattern (a restored user signs in again) | Owner / self protections; email in use elsewhere |
| Branch added / edited / activated / deactivated | Undo | Removes the unused branch / saves earlier details / earlier status | Branch has records |
| Expense category added / renamed | Undo | Removes it / renames back | Expenses are recorded under it; renamed again |
| Metal rates updated | Undo | **Withdraws** those rates (kept in rate history, marked); prices fall back to the previous rates | A live invoice was made at those rates |
| Settings changed (any section) | Undo | Puts that section back | Changed again since |
| Organisation details edited | Undo | Saves the earlier details | Edited again since |

### Branch panel (each branch's own work)

| Action | Kind | What undoing does | Refused when |
|---|---|---|---|
| Invoice made | Reversal | **Cancels** the invoice: pieces back in stock, its ledger entries reversed (payments on it paid back), old gold taken in exchange goes back, a customer order goes back to *Ready* | A due was collected on it since (take that receipt back first); items were returned; the exchanged old gold was used |
| Due payment received | Reversal | Receipt **voided**: bills / old due owed again, entry reversed | A bill it paid was cancelled since |
| Old gold bought | Reversal | **Cancels** it: the metal leaves Raw materials, the payout is reversed | That gold was used (made into jewellery, moved) |
| Purchase bill entered | Reversal | **Cancels** the bill: its pieces leave stock (pieces it created are retired, drafts go back to draft), its metal leaves Raw materials, ledger reversed (an amount paid with the bill comes back), a purchase order it received is open again. The bill no. gets "(cancelled …)" so the corrected bill can be entered | A piece was sold / moved; the metal was used; payments were made on the bill since (take them back first) |
| Supplier bill paid | Reversal | A matching negative payment line is added and that payment's entry reversed | Bill cancelled |
| Supplier paid (on account) | Reversal | Payment **voided**: each bill it reached and the old balance owed again, entry reversed | A bill it paid was cancelled |
| Purchase order placed / cancelled | Reversal / Undo | Cancels it / opens it again | Already received on a bill |
| Expense recorded | Reversal | **Voids** the expense (entry reversed; it stays listed, marked void) | — |
| Expense corrected | Undo | Puts the earlier figures back (entry reposted; the edit stays in its history) | Corrected again; earlier category inactive |
| Customer order booked | Reversal | **Cancels** the order: advance refunded the way it was paid, customer's gold given back | A piece was already made for it; that gold was used |
| Order advance taken | Reversal | A refund receipt of the same amount, same mode (both receipts stay) | Order delivered / cancelled; advance already used |
| Order edited / status changed | Undo | Earlier items, date, notes / earlier status | Edited again; no longer editable |
| Customer gold received for an order | Reversal | Gold given back to the customer | Part of it went into a finished piece |
| Product added / edited / HUID set / deleted | Undo | Removes the draft / earlier details / earlier HUID / brings it back (photos deleted with it do not return) | Product has history (stock movements, invoices); in stock and weight/metal/branch changed (use an adjustment) |
| Opening stock added | Reversal | **Cancels** the entry: its pieces back to draft, its gold out of the metal stock, journal reversed | A piece was sold / moved; the gold was used |
| Opening gold corrected | Undo | Earlier gold lines (journal reposted) | Corrected again; gold used |
| Stock adjustment posted (directly or on approval) | Reversal | Pieces back in stock, metal lines the other way, journals reversed; the entry is marked cancelled | Pieces changed since; metal it added was used |
| Sent for approval | Undo | Withdraws the request | Already decided |
| Approval request rejected | Undo | Reopens it (waits for a decision again) | — |
| Stock sent to another branch | Reversal | **Recalls** the transfer: pieces back in the sending branch | Already received / rejected (undo that first, in the other branch) |
| Transfer received / rejected | Reversal | Back in transit (receiving's inventory entry reversed) | Pieces sold / moved since |
| Jewellery made (production) | Reversal | **Cancels** it: the pieces leave stock and are retired, the metal returns to Raw materials at its cost, making charge reversed | A piece was sold / moved |
| Employee added / edited / left-rejoined / deleted | Undo | Removes the unused employee / earlier details / earlier employment record / brings them back (photo not restored) | Employee has records; mobile taken |
| Attendance marked (day or month register) | Undo | Earlier marks put back (unmarked again where there was none) | That month's payroll is finalised; marks changed since |
| Holidays & weekly off changed | Undo | Earlier calendar | Changed again |
| Salary advance given | Reversal | Advance **cancelled**, entry reversed | Any of it deducted; a draft payroll is set to deduct it |
| Salary advance corrected | Undo | Earlier figures (journal reposted) | Locked (only on the day it was entered, before deduction) |
| Payroll created / draft deleted | Undo | Deletes the draft / brings the draft back | Finalised (undo finalising first); payroll for the month created again |
| Payroll finalised | Reversal | Back to **draft**: salary booking reversed, advances it deducted owed again, attendance unlocked | Salary already paid (take payments back first) |
| Salary paid | Reversal | That payment's entry reversed; those employees show unpaid | — |
| Branch print layout changed | Undo | Earlier layout | Changed again |

### Super Admin panel

| Action | Kind | What undoing does | Refused when |
|---|---|---|---|
| Organisation created | Undo | Deletes the organisation | It already has records (deactivate it instead) |
| Organisation edited | Undo | Earlier details (a new owner password stays) | Edited again |
| Organisation activated / deactivated | Undo | Earlier status | Changed again |
| Plan added / edited / deleted | Undo | Removes / earlier details / brings back | Plan taken by an organisation; it is the default |
| Subscription changed (trial, extend, payment, complimentary) | Reversal | Subscription put back; the payment / activation record is kept, marked **reversed** (no longer revenue) | Subscription changed again (renewal, payment …) |
| Email (SMTP) settings changed | Undo | Earlier settings | Changed again |

## Not on Undo — and what to use instead

These stay as they are (they are already reversals, or cannot be put back safely); use the module's own workflow.

| Action | Why not | Instead |
|---|---|---|
| Invoice cancelled, sales return, credit note | Reversals themselves | Make a new invoice |
| Order cancelled / delivered, piece finished on an order | Money refunded / material and karigar wage already booked | Book a new order; adjust stock |
| Old gold cancelled, expense voided, advance cancelled | Reversals themselves | Enter it again |
| Branch deleted | Users' access to it was removed with it | Add the branch again |
| Organisation deleted (Super Admin) | Its data is gone | Create it again |
| Password changes / resets, login codes, sign-ins, sessions | Security: never put back | Reset again |
| Photos, logos, bill images added or removed | Files are deleted from storage | Upload again |
| Payroll line edits, recalculation | Draft only — edit the draft directly | Edit / recalculate again |
| Online (Cashfree) subscription payments | Money went through the gateway | Refund outside the app; Super Admin adjusts the subscription |

Actions done **before Undo existed** are not on any stack (there was no "before" kept for them).

## For developers

- **Where actions go on a stack**: `recordAudit({ …, undo: { type, data?, label?, branchId?, recordId? } })`
  (`backend/src/core/audit/audit.service.js`) writes an `UndoAction` in the same transaction as the action. Stack:
  the record's branch, else the organisation's (or, for a branch-limited user, their working branch). Platform:
  `recordPlatformAudit` → `PlatformUndoAction`.
- **Handlers**: one per `type`, in each module's `<module>.undo.js`, registered in
  `backend/src/modules/undo/undo.registry.js` (platform: `modules/platform/platformUndo.handlers.js`).
  A handler is `{ type, title, mode, permission, check(entry), run(entry, { reason }) }`; `check` returns
  `{ ok, effect }`, `{ ok: false, reason }` or `{ superseded }`. Factories for add / edit / status / delete are in
  `modules/undo/undo.helpers.js`; shared stock checks in `undo.checks.js`; edit snapshots in `undo.snapshot.js`.
- **Transactions**: `withTransaction` joins an open transaction, and `config/transactions.js` makes every query and
  save inside one join it — so a module's own cancel function runs inside the undo's transaction.
- **API**: `GET /undo/stacks`, `GET /undo/history`, `GET /undo/:id`, `POST /undo/:id/undo`, `POST /undo/:id/dismiss`
  (body `{ reason }`); Super Admin: `/platform/undo/latest`, `/history`, `/:id/undo`, `/:id/dismiss`.
- **New reversal statuses**: purchase `cancelled` (left out of every purchase total via `LIVE_BILL`), stock entry /
  transfer / production `cancelled`, salary advance `cancelled`, customer receipt & supplier payment `void`, metal
  rate `withdrawnAt` (left out of prices via `LIVE_RATE`), subscription payment `reversed`.
- **Adding an undoable action**: pass `undo` to its `recordAudit`, write the handler (reuse the module's own
  cancel / update function so ledgers, stock and audit stay right), register it, and add a test
  (`backend/tests/undo*.test.js`).
- **Tests**: `undo.test.js` (stack rules, permissions, isolation), `undoMoney.test.js` (sales, purchases, payments,
  stock, orders, payroll, rollback), `undoPlatform.test.js` (Super Admin).
