# Jobboks — QA Test Checklist

Real-scenario testing of every feature. Work top-to-bottom; each item is a
scenario with its expected result. When something breaks, note the checkbox
and what happened.

> Priority order: the new approval → invoice flow first (newest, highest
> risk), then core features, then cross-cutting concerns.

---

## 1. Job report → approval → invoice (NEW — test hardest)

**Setup:** Configure at least 2 users — one *without* "Approve & invoice jobs"
(a worker), one *with* it (manager/owner).

- [ ] **Worker submits** — as the worker, open a job, log time + add a photo, go to Summary. Status shows **Draft**. Tap "Submit report for approval" → status flips to **Awaiting approval**, shows "Submitted by [worker]".
- [ ] **Worker cannot invoice** — while Draft or Awaiting approval, the **Convert to Invoice** button is greyed out / disabled. Confirm it does nothing when tapped.
- [ ] **Worker sees no approve buttons** — worker viewing an "Awaiting approval" job sees "Waiting for a manager to approve", NOT Approve/Send back.
- [ ] **Manager approves** — as the manager, open the same job → see **Approve** + **Send back**. Tap Approve → status **Approved**, shows "Approved by [manager]".
- [ ] **Invoice unlocks** — after approval, Convert to Invoice is enabled → creates an invoice, success toast, invoice appears in Invoices with job ref in notes.
- [ ] **Send back** — submit another job, manager taps Send back, types a note → status returns to **Draft**, worker sees the red return note.
- [ ] **Hard gate holds** — try to convert a non-approved job by any means; confirm it's always blocked (the rule: never invoice without approval).
- [ ] **Solo mode** — with no users configured at all, single user can approve + invoice their own jobs (not locked out).

## 2. Jobs

- [ ] Create / edit / delete a job; status changes (quote/active/paused/complete/cancelled) display correct colours.
- [ ] Log time entries (hours, rate, worker) — totals roll up in Summary; labour cost correct.
- [ ] Add materials — material cost correct; profit = quoted − total cost calculates right.
- [ ] **Photos (Android):** "Take photo" opens camera directly; gallery input opens picker; photo attaches and thumbnail shows. *(The camera fix just shipped — verify on a real phone.)*
- [ ] Job limit modal appears at plan limit.

## 3. Invoices & quotes

- [ ] Create invoice manually (no job) — still works end to end.
- [ ] Quote → convert to invoice; numbering increments correctly (no duplicates).
- [ ] VAT per line correct; subtotal / VAT / total match.
- [ ] **Email invoice** opens mail app with correct customer, number, total, due date.
- [ ] PDF export and Print produce a correct-looking document (bank account + kennitala show).
- [ ] Mark as sent / paid / overdue status transitions.
- [ ] **Customer statement:** pick a customer → statement shows all their invoices; Invoiced / Paid / Outstanding tiles add up correctly; unpaid invoices flagged.
- [ ] **Statement email** opens mail with invoice list + totals; **Statement PDF** exports correctly; "Back to list" returns to the normal view.
- [ ] **Issued invoices locked:** a sent/paid invoice shows a lock icon and NO Edit/Delete; only drafts and quotes can be edited/deleted.
- [ ] **Credit note:** on an issued invoice, "Credit note" creates a new sequential draft with negated amounts and a "Credit · [original no.]" badge referencing the original.
- [ ] **Numbering:** invoice number field in the editor is read-only (auto-assigned); no manual edits possible.
- [ ] **Mixed-VAT invoice:** an invoice with both 24% and 11% lines, when marked paid, books separate income transactions per rate; VAT return allocates each rate correctly.
- [ ] **Tax labels:** VAT term, ID label and VAT-number label on invoices/PDF reflect Settings/country config (e.g. VSK in IS), not hardcoded.

## 4. Payroll, VAT, Annual accounts

- [ ] Payroll calculation against logged hours/rates is correct.
- [ ] VAT return totals reconcile with invoices/transactions for the period.
- [ ] Annual accounts figures match underlying data.

## 5. Stock / transactions

- [ ] Add/edit/delete stock items; quantities adjust.
- [ ] Record income/expense transactions; categories and VAT apply correctly.

## 6. Users & permissions

- [ ] Each role's default permissions load correctly when selected.
- [ ] Toggling a permission actually changes what that user can see/do (spot-check "Approve & invoice jobs", "View financials", "Edit invoices").
- [ ] A restricted user genuinely can't reach blocked screens/actions.

## 7. Cross-cutting (test on real devices)

- [ ] **Sync (Supabase):** make a change on phone → appears on web after sync; and vice-versa. Check sync status indicator.
- [ ] **Offline:** make changes with no connection → they persist and sync when back online; no data loss.
- [ ] **Language:** toggle IS/EN — all new approval-flow labels translate (badges, buttons, alerts).
- [ ] **Currency formatting** correct for ISK and any foreign currency invoices.
- [ ] **Login / logout / session** — correct user identity drives the permission checks.
- [ ] **Android:** status bar colour, back button (goes back in WebView, then exits), full-screen, portrait lock.

---

**How to use:** run a scenario; when something breaks or feels wrong, note the
checkbox + what happened, and it gets fixed in the code.
