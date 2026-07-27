# Jobboks — QA Sweep

Organized walk-through of the whole app, one **area** at a time. For each area:
1. **Code audit** (Claude reads the code, lists real bugs) →
2. **Tap-through** (you run these in the live app) →
3. **Fix** what turns up, then move on.

When something breaks or feels wrong, note the checkbox + what happened.

Legend: `[ ]` to test · `[x]` passed · `[!]` broken (note what)

---

## Area 1 — Money (Transactions · Bank Import · Recurring · AutoRules)

**Transactions (Færslur)**
- [ ] Add income / expense / transfer — saves, shows in the list with the right colour (green +, red −, grey ±).
- [ ] Edit a transaction; delete a transaction — both persist.
- [ ] VAT-inclusive mode: Settings → "Amounts include VAT" ON → the add/edit form reads "incl. VAT", and net + VAT split shown is correct (e.g. 2,000,000 @24% → net 1,612,903 + VAT 387,097).
- [ ] Link an income row to an invoice (Reikningur picker) → VAT locks to the invoice's rate ("from invoice #N"); a payment bigger than the invoice's balance shows the amber overpay warning.
- [ ] Filters: type, year, category, key, date range, name, amount min/max — each narrows correctly; combined filters work.
- [ ] Bulk bar (appears only when filtered): set type / category / key / VAT on all filtered rows; "clear key" removes the key. Count matches.
- [ ] Export Excel / CSV / PDF — the new **Bókhaldslykill / Key** column is present and shows "number — name".
- [ ] Foreign-currency row (EUR/USD) shows correct ISK conversion.

**Bank Import**
- [ ] Import a bank CSV/Excel — amounts get the right sign (money in = income, out = expense); no divide-by-1000 error; running balance not treated as an amount.
- [ ] Re-importing an overlapping file does NOT duplicate rows (dedupe).
- [ ] A payer booked consistently before is auto-typed ("From your books" badge).
- [ ] An income row whose bank line names a customer with an invoice auto-links ("VAT from invoice #N") and takes the invoice's VAT; a partial payment lands on that customer's most recent unpaid invoice.
- [ ] "Annað kerfi (AI)" column-map import reads another program's export.

**Recurring & AutoRules**
- [ ] Create a recurring transaction (monthly/quarterly/annual) → generates on the right date, once per period (no double, no skip).
- [ ] Create a rule (pattern → type/category/VAT) → new matching imports get categorised; accent/case-insensitive match works ("kronan" catches "Krónan").

## Area 2 — Sales (Invoices · Quotes · Bulk · Get paid · Stock · Contacts)

- [ ] Create invoice manually (no job) end to end; number auto-assigned (read-only), no duplicates.
- [ ] Quote → convert to invoice; numbering increments.
- [ ] VAT per line correct; subtotal / VAT / total match; whole-invoice discount spreads VAT-correctly.
- [ ] Issued invoice is locked (lock icon, no edit/delete); credit note creates a negated sequential draft referencing the original.
- [ ] Mark sent / paid; paid/part-paid badge ("Greitt ✓ / Eftir …") reflects linked deposits; customer statement tiles (Invoiced/Paid/Outstanding) add up incl. partials.
- [ ] **Bulk invoices**: "Fjöldi" → add rows (or Load completed jobs) → gross in, VAT extracted by type (Work/Rent/Custom), sequential numbers, all created as drafts.
- [ ] **Get paid**: with payments enabled, "Payment link" button creates + copies a Stripe link (needs STRIPE_SECRET_KEY set; else a clear "set up payments" message).
- [ ] Email invoice / PDF / Print produce a correct document (bank account + ID show); tax labels reflect country (VSK/Sales Tax/GST-HST).
- [ ] Stock: add/edit/delete items; pull a stock item into an invoice/offer line.
- [ ] Contacts: customer autocomplete fills fields; saving an invoice/job with a new name adds the customer.

## Area 3 — Jobs (Verkbókhald · approval → invoice)

- [ ] Create / edit / delete a job; status colours (survey/scheduled/active/paused/complete/cancelled) correct.
- [ ] Log time (hours/rate/worker) + materials → costs roll up; profit = quoted − total cost.
- [ ] Tag a purchase to a job (Færslur "Verkefni") → shows as a job cost, not double-booked.
- [ ] Photos: "Take photo" opens camera; gallery picker works; thumbnail shows; pager views all.
- [ ] **Approval gate**: worker submits report → "Awaiting approval"; worker CANNOT convert to invoice; manager approves → convert unlocks; send-back returns to draft with note. Solo user can self-approve.

## Area 4 — Books & reports (Dashboard · VAT · VAT Return · Reports · Annual · Budget · Chart of accounts)

- [ ] Dashboard KPIs, chart, year picker correct; getting-started card shows only for a new account and each step ticks; workers don't see financials.
- [ ] VAT screen + VAT Return reconcile with the period's transactions; VAT-inclusive extraction correct.
- [ ] **US mode**: report is "sales tax collected → remit" (no input reclaim), Monthly/Quarterly/Annual picker, state referenced not IRS.
- [ ] **Canada mode**: full GST/HST reclaim return kept; filing-period picker; labels read GST/HST + CRA (nav + Dashboard too).
- [ ] Reports drill-down → Transactions pre-filtered to that key/year.
- [ ] Annual accounts + Budget figures match underlying data; corporate tax rate applied.
- [ ] Chart of accounts: create key (blocks duplicate numbers), balance-sheet keys carry a balance across years.

## Area 5 — AI concierge

- [ ] New/blank user lands on the AI on first open with a warm welcome + starter chips.
- [ ] "I do roofing in Denver" → setup card (country/state/tax/company) → tap Set up applies it.
- [ ] "Invoice John $2,000 for a deck" → draft-invoice card → tap creates a draft (VAT extracted).
- [ ] "New job at 23 Oak St, roof for John" → job card → tap creates a job (JOB-YYYY-NNN, survey).
- [ ] "Turn on getting paid online" / "set my email" → settings card → tap applies; sensitive keys (API/Supabase/plan/permissions) are refused.
- [ ] Tax question ("is labor taxable in my state?") → AI searches live, answers plainly, cites the authority, adds "confirm with your accountant".
- [ ] Book / fix / Excel / memory actions still work.

## Area 6 — Setup & people + cross-cutting

- [ ] Settings: change company info, tax term/rate, currency, invoice prefix, payments toggle — persist and flow through the app.
- [ ] Country flag grid sets currency/VAT/jurisdiction; US state picker sets the rate.
- [ ] Users & permissions: each role's defaults load; toggling a permission changes access; per-screen overrides work; a restricted user can't reach blocked screens.
- [ ] Payroll: gated to IS/US/CA; calculation correct for the country; hidden/blocked elsewhere.
- [ ] Sync (Supabase): change on phone → shows on web and vice-versa; offline changes persist and sync back; no data loss.
- [ ] Language IS/EN toggles all labels; currency formats correctly; login/logout drives the right identity + permissions.
- [ ] Android: status bar, back button, full-screen, portrait.

---

**How to use:** run a scenario; when something breaks or feels wrong, note the box
+ what happened, and it gets fixed in the code. We go area by area.
