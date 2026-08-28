import { Transaction, Currency, Account, BalanceSheetItem } from '../types';
import { indexFactor } from '../data/priceIndex';

// Transaction dates are stored as date-only "YYYY-MM-DD". `new Date("2025-01-01")`
// parses as UTC midnight, so `.getFullYear()` returns the LOCAL year — off by one
// for negative-UTC users (US), landing every Jan-1 row in the previous year. Read
// the year/month straight from the string instead; fall back to Date for any other
// format. Use these everywhere a stored transaction date is bucketed by year/month.
export function yearOf(dateStr: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  return m ? Number(m[1]) : new Date(dateStr).getFullYear();
}
export function monthOf(dateStr: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr);
  return m ? Number(m[2]) : new Date(dateStr).getMonth() + 1;
}

export function toISK(amount: number, currency: Currency, rate: number): number {
  return currency === 'ISK' ? amount : amount * rate;
}

export function calcVAT(amountExVat: number, vatRate: number): number {
  return amountExVat * (vatRate / 100);
}

export function calcAmountIncVAT(amountExVat: number, vatRate: number): number {
  return amountExVat * (1 + vatRate / 100);
}

export function getTransactionISK(t: Transaction): number {
  return toISK(t.amount, t.currency, t.eurToIskRate);
}

// How much has actually been received against an invoice (R9-6): the sum, in ISK,
// of the income deposits linked to it. Compared against the invoice's gross total
// it gives the outstanding balance and an exact paid/partly-paid/unpaid state, so
// "the customer's last unpaid invoice" is derived from real money in, not a manual
// status flag. Both sides are gross (VAT-included), so they're directly comparable.
export function invoiceReceivedISK(invoiceId: string, transactions: Transaction[]): number {
  return transactions
    .filter(t => t.type === 'income' && t.invoiceId === invoiceId)
    .reduce((sum, t) => sum + getTransactionISK(t), 0);
}

// Carry-forward: a balance-sheet key's closing balance at the end of each year =
// opening balance + the entries booked onto it (money in +, money out −), rolled
// forward so each year's close is the next year's open. By-the-book normal
// balances: assets/liabilities/equity all move with the cash booked to the key
// (repayment out → liability down; borrowing in → up). Direction: an 'income'
// entry OR a 'lan_mottekid' transfer (a loan RECEIVED) adds to the key; every
// other entry (expense, or a 'transfer' paid out) subtracts. Interest vs
// principal is not split for money out except via interestAmount (owner books
// the principal portion onto the key). Returns [] for P&L keys / no-data keys.
// A verðtryggt loan is tracked at its NOMINAL principal — that is what the
// movements reduce — and reported at nominal × (index ÷ base index), which is
// what is actually owed. Pass the index series to get the indexed figure; leave
// it out and every key behaves exactly as it did before.
export function accountBalanceByYear(
  account: Account,
  transactions: Transaction[],
  priceIndex?: Record<string, number>,
): { year: number; closing: number }[] {
  const movs = transactions.filter(tx => tx.accountId === account.id);
  if (!movs.length && account.openingBalance == null) return [];
  const movYears = movs.map(tx => yearOf(tx.date));
  const start = account.openingYear ?? (movYears.length ? Math.min(...movYears) : NaN);
  const end = movYears.length ? Math.max(start, ...movYears) : start;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const rows: { year: number; closing: number }[] = [];
  let bal = account.openingBalance ?? 0;
  for (let y = start; y <= end; y++) {
    const net = movs
      .filter(tx => yearOf(tx.date) === y)
      .reduce((s, tx) => {
        const gross = getTransactionISK(tx);
        // A loan payment's interest is a cost, not a reduction of the loan — only
        // the principal (gross − interest) moves the balance. Money in (income, a
        // loan RECEIVED via 'lan_mottekid', or an owner CONTRIBUTION via 'framlag')
        // increases the balance by the full amount — so borrowed money or the
        // owner's own money paid in raises the liability instead of being wrongly
        // subtracted like a payment (the bug that made the owner-account debt too high).
        const interest = tx.interestAmount ? toISK(tx.interestAmount, tx.currency, tx.eurToIskRate) : 0;
        const moneyIn = tx.type === 'income' || tx.category === 'lan_mottekid' || tx.category === 'framlag';
        // A payment on a verðtryggt loan is made in TODAY'S krónur, but the balance
        // it reduces is the loan's NOMINAL principal. Subtracting the paid figure
        // straight off the nominal takes too much off — an afborgun of 62.471 in
        // 2023 money repaid 56.840 of nominal, not 62.471 — and over a few dozen
        // instalments the two drift far enough apart that a bond can be settled in
        // full and still show a balance. Deflate by the index at the PAYMENT date.
        // Only a PAYMENT is deflated. Money in is the loan itself, and a loan's
        // face value is its nominal principal by definition — the base index is
        // the index on the day it was drawn. Deflating it too put an 11.500.000
        // bond on the books at 11.633.230, purely because its base index (523,9,
        // June 2022) and its booked drawdown date (April 2022) sit a month or two
        // apart in the table.
        const at = !moneyIn && account.isIndexed && priceIndex
          ? indexFactor(account.baseIndex, tx.date, priceIndex)
          : 1;
        return s + (moneyIn ? gross : -((gross - interest) / at));
      }, 0);
    bal += net;
    // Index at the YEAR END the row reports, not today: a 2024 balance sheet has
    // to show what was owed on 31.12.2024.
    const factor = account.isIndexed && priceIndex
      ? indexFactor(account.baseIndex, `${y}-12-31`, priceIndex)
      : 1;
    // A figure the lender has stated for this year beats one derived from booked
    // payments. Roll the running balance to it as well, so a single corrected year
    // repairs every year after it instead of the error compounding.
    const stated = account.balanceByYear?.[String(y)];
    if (stated != null) {
      bal = stated / (factor || 1);
      rows.push({ year: y, closing: stated });
    } else {
      rows.push({ year: y, closing: bal * factor });
    }
  }
  return rows;
}

// Money IN and money OUT booked onto a key, per year — the two halves that
// accountBalanceByYear nets into one closing figure. Kept separate because the
// SPLIT is the diagnostic: a balance key that only ever receives, or only ever
// pays, is almost always missing entries rather than telling the truth. The
// owner account of this app's first company ran one-way for six years — every
// contribution booked, every draw filed as a plain expense with no key — and
// read as a 16 M liability when the owner in fact owed the company. Netted to a
// closing balance that is invisible; split in two it is obvious at a glance.
export function accountFlowByYear(account: Account, transactions: Transaction[]): { year: number; in: number; out: number }[] {
  const movs = transactions.filter(tx => tx.accountId === account.id);
  if (!movs.length) return [];
  const years = [...new Set(movs.map(tx => yearOf(tx.date)))].sort();
  return years.map(y => {
    let moneyIn = 0, moneyOut = 0;
    for (const tx of movs) {
      if (yearOf(tx.date) !== y) continue;
      const gross = getTransactionISK(tx);
      // Same direction test as accountBalanceByYear, so the two never disagree.
      if (tx.type === 'income' || tx.category === 'lan_mottekid' || tx.category === 'framlag') moneyIn += gross;
      else moneyOut += gross;
    }
    return { year: y, in: moneyIn, out: moneyOut };
  });
}

// WHAT THE AI SAYS BACK AFTER A BANK IMPORT.
// Importing used to end with a green tick and nothing else, so every mistake the
// import made sat there until somebody went looking months later. These are the
// checks that would have caught this app's first company: 6.880.851 of tax payments
// filed as ordinary expenses, and six years of owner draws landing with no key
// because history taught the importer to call them "adrir_rekstrargjold".
export interface ImportFinding {
  kind: 'tax' | 'keyed-elsewhere' | 'new-party';
  title: string;
  rows: number;
  amount: number;
  key?: string;
}

export function reviewImport(
  imported: Transaction[],
  all: Transaction[],
  accounts: Account[],
  taxAuthority?: string,
): ImportFinding[] {
  const byId = new Map(accounts.map(a => [a.id, a]));
  const out: ImportFinding[] = [];
  const norm = (s: string) => (s || '').trim().toLowerCase();

  // 1. Money paid to the tax authority is a SETTLEMENT of a debt, never a cost.
  const taxWords = ['ríkissjóðsinnheimt', 'rikissjodsinnheimt', 'sýslumað', 'syslumad',
    'skatturinn', 'tollstjóri', 'tollstjori', 'innheimtumað', 'innheimtumad']
    .concat(taxAuthority ? [norm(taxAuthority)] : []);
  const taxRows = imported.filter(t =>
    taxWords.some(w => w && norm(t.description).includes(w)) && !byId.get(t.accountId || ''));
  if (taxRows.length) {
    out.push({ kind: 'tax', rows: taxRows.length,
      amount: taxRows.reduce((s2, t) => s2 + getTransactionISK(t), 0),
      title: 'paid to the tax authority but booked as a cost' });
  }

  // 2. This party is normally booked onto a key — these rows arrived without one.
  const keyOf = new Map<string, string>();
  for (const t of all) {
    const acc = t.accountId ? byId.get(t.accountId) : undefined;
    if (acc) keyOf.set(norm(t.description), acc.number);
  }
  const groups = new Map<string, { n: number; amt: number; key: string }>();
  for (const t of imported) {
    if (byId.get(t.accountId || '')) continue;
    const k = keyOf.get(norm(t.description));
    if (!k) continue;
    const g = groups.get(t.description) || { n: 0, amt: 0, key: k };
    g.n++; g.amt += getTransactionISK(t); groups.set(t.description, g);
  }
  for (const [name, g] of [...groups.entries()].sort((a, b) => b[1].amt - a[1].amt)) {
    out.push({ kind: 'keyed-elsewhere', title: name, rows: g.n, amount: g.amt, key: g.key });
  }

  // 3. Somebody the books have never seen — worth a glance, not a fault.
  const known = new Set(all.filter(t => !imported.includes(t)).map(t => norm(t.description)));
  const fresh = new Map<string, { n: number; amt: number }>();
  for (const t of imported) {
    if (known.has(norm(t.description))) continue;
    const g = fresh.get(t.description) || { n: 0, amt: 0 };
    g.n++; g.amt += getTransactionISK(t); fresh.set(t.description, g);
  }
  for (const [name, g] of [...fresh.entries()].sort((a, b) => b[1].amt - a[1].amt).slice(0, 5)) {
    out.push({ kind: 'new-party', title: name, rows: g.n, amount: g.amt });
  }
  return out;
}

// Fixed assets live in balanceSheetItems, NOT as transactions — so anything that
// reads only the transaction rows misses them entirely. The AI did exactly that and
// reported total assets of 39.955 for a company holding 50 M of property.
// land + the building depreciated straight-line from the acquired year; 0 before it.
export function assetBookValue(item: BalanceSheetItem, y: number): number {
  if (item.cost == null || item.acquiredYear == null) return item.amount;
  if (y < item.acquiredYear) return 0;
  const land = item.landValue ?? 0;
  const building = Math.max(item.cost - land, 0);
  const rate = (item.depreciationRate ?? 0) / 100;
  // Icelandic depreciation runs a FULL year from the year the asset is taken into
  // use — not pro rata, and not from the year after (reglugerð nr. 1300/2021, 12. gr.;
  // the same article bars depreciation in the year use ends). Counting from
  // `acquiredYear` with no +1 left every asset a year under-depreciated: 930.000 kr
  // missing across one owner's three flats and a car in 2024 alone.
  const yearsHeld = Math.max(y - item.acquiredYear + 1, 0);
  const depreciated = Math.min(building * rate * yearsHeld, building);
  return land + (building - depreciated);
}
export function assetVisible(item: BalanceSheetItem, y: number): boolean {
  return item.acquiredYear == null || y >= item.acquiredYear;
}

// KEYING GAPS — the single most useful health check in the books.
// Signature: ONE counterparty whose rows are keyed on some entries and carry NO key
// at all on others. That is not a style difference, it is half a relationship
// falling out of the balance sheet. Every serious error in this app's first set of
// books had exactly this shape: the owner keyed on 2420 for 128 rows and unkeyed on
// 86 (18,7 M of draws that never reached his account); Arion and Fylkir loan
// repayments keyed on the loan for some rows and filed as ordinary expenses for the
// rest. Netted balances hide it; this comparison shows it in one line.
export function keyingGaps(
  transactions: Transaction[],
  accounts: Account[],
  limit = 12,
): { name: string; keyedRows: number; keys: string[]; bareRows: number; bareAmount: number }[] {
  const byId = new Map(accounts.map(a => [a.id, a]));
  const g = new Map<string, { keyed: number; keys: Set<string>; bare: number; bareAmt: number }>();
  for (const tx of transactions) {
    const name = (tx.description || '').trim();
    if (!name) continue;
    let e = g.get(name);
    if (!e) { e = { keyed: 0, keys: new Set(), bare: 0, bareAmt: 0 }; g.set(name, e); }
    const acc = tx.accountId ? byId.get(tx.accountId) : undefined;
    if (acc) { e.keyed++; e.keys.add(acc.number); }
    else { e.bare++; e.bareAmt += getTransactionISK(tx); }
  }
  return [...g.entries()]
    .filter(([, e]) => e.keyed > 0 && e.bare > 0)
    .map(([name, e]) => ({ name, keyedRows: e.keyed, keys: [...e.keys].sort(), bareRows: e.bare, bareAmount: e.bareAmt }))
    .sort((a, b) => b.bareAmount - a.bareAmount)
    .slice(0, limit);
}

// True when a key has moved in only ONE direction across its whole life — the
// shape that means "entries are missing", not "this is the balance".
export function isOneWayAccount(flow: { in: number; out: number }[]): boolean {
  if (flow.length < 2) return false;   // a single year is not yet a pattern
  const totIn = flow.reduce((s, f) => s + f.in, 0);
  const totOut = flow.reduce((s, f) => s + f.out, 0);
  return (totIn > 0 && totOut === 0) || (totOut > 0 && totIn === 0);
}

// A missing/invalid vatRate is treated as 0% so the VAT math never yields NaN
// (which would corrupt totals on the return). Guards imported/legacy rows.
const safeRate = (t: Transaction) => (typeof t.vatRate === 'number' && !Number.isNaN(t.vatRate)) ? t.vatRate : 0;

// Net (ex-VAT) amount of a transaction. When pricesInclVat is true the stored
// amount is GROSS (the 24% is already inside it, e.g. an Icelandic bank deposit)
// so the VAT is EXTRACTED: net = gross ÷ (1 + rate). When false (legacy) the
// stored amount already IS the net.
export function getNetISK(t: Transaction, pricesInclVat = false): number {
  const isk = getTransactionISK(t);
  return pricesInclVat ? isk / (1 + safeRate(t) / 100) : isk;
}

export function getVATAmountISK(t: Transaction, pricesInclVat = false): number {
  const isk = getTransactionISK(t);
  // Inclusive: VAT is the part already inside the gross amount (gross − net).
  // Legacy: VAT is added on top of the (net) amount.
  return pricesInclVat ? isk - isk / (1 + safeRate(t) / 100) : calcVAT(isk, safeRate(t));
}

export function getTotalISK(t: Transaction, pricesInclVat = false): number {
  // Gross (VAT-included) total. Inclusive: the stored amount already IS the total.
  return pricesInclVat ? getTransactionISK(t) : getTransactionISK(t) + getVATAmountISK(t);
}

export interface VATSummaryByRate {
  rate: number;
  baseAmount: number;
  vatAmount: number;
  totalAmount: number;
}

export interface VATSummary {
  outputByRate: VATSummaryByRate[];
  inputByRate: VATSummaryByRate[];
  totalOutput: number;
  totalInput: number;
  netVAT: number;
  exemptTurnover: number; // undanþegin velta (e.g. residential rent) — reported "án VSK", outside taxable turnover
}

export function calcVATSummary(transactions: Transaction[], rates: number[] = [24, 11, 0], pricesInclVat = false): VATSummary {
  // A transaction with a missing/invalid vatRate must not silently vanish from the
  // return — that would UNDER-state turnover on an official (RSK) filing. Treat it
  // as 0% so its turnover still shows (visible, no invented VAT) rather than dropping.
  const rateOf = (t: Transaction) => (typeof t.vatRate === 'number' && !Number.isNaN(t.vatRate)) ? t.vatRate : 0;
  // VAT-exempt turnover (undanþegin) is OUTSIDE the taxable buckets: no output VAT,
  // and it must not inflate skattskyld velta. Reported separately as "Velta án VSK".
  const taxable = (t: Transaction) => !t.vatExempt;
  // Financial income (bank interest, fjármagnstekjur) is OUTSIDE VSK entirely — it is
  // not turnover (velta) at all, so keep it out of every income bucket including exempt.
  const isVeltaIncome = (t: Transaction) => t.type === 'income' && t.category !== 'fjarmagns_tekjur';

  const outputByRate = rates.map(rate => {
    const filtered = transactions.filter(
      t => isVeltaIncome(t) && taxable(t) && rateOf(t) === rate
    );
    const baseAmount = filtered.reduce((sum, t) => sum + getNetISK(t, pricesInclVat), 0);
    const vatAmount = filtered.reduce((sum, t) => sum + getVATAmountISK(t, pricesInclVat), 0);
    return { rate, baseAmount, vatAmount, totalAmount: baseAmount + vatAmount };
  });

  const inputByRate = rates.map(rate => {
    const filtered = transactions.filter(
      t => t.type === 'expense' && taxable(t) && rateOf(t) === rate
    );
    const baseAmount = filtered.reduce((sum, t) => sum + getNetISK(t, pricesInclVat), 0);
    const vatAmount = filtered.reduce((sum, t) => sum + getVATAmountISK(t, pricesInclVat), 0);
    return { rate, baseAmount, vatAmount, totalAmount: baseAmount + vatAmount };
  });

  // Exempt turnover carries NO VAT, so the turnover IS the gross amount — never extract
  // VAT from it (that would understate the reported "velta án VSK").
  const exemptTurnover = transactions
    .filter(t => isVeltaIncome(t) && t.vatExempt)
    .reduce((sum, t) => sum + getTransactionISK(t), 0);
  const totalOutput = outputByRate.reduce((s, r) => s + r.vatAmount, 0);
  const totalInput = inputByRate.reduce((s, r) => s + r.vatAmount, 0);

  return { outputByRate, inputByRate, totalOutput, totalInput, netVAT: totalOutput - totalInput, exemptTurnover };
}

export interface ProfitLoss {
  salaTekjur: number;
  thjonustutekjur: number;
  adrarTekjur: number;
  fjarmagntekjur: number;
  totalRevenue: number;

  laun: number;
  launatengd: number;
  husaleiga: number;
  simagjold: number;
  skrifstofugjold: number;
  samgongur: number;
  markadsmal: number;
  fagthjonusta: number;
  vorur: number;
  afskriftir: number;
  rafmagnHiti: number;
  adrir: number;
  totalOperatingExpenses: number;

  operatingProfit: number;

  fjarmagnsgjold: number;
  profitBeforeTax: number;
  incomeTax: number;
  netResult: number;
}

export function calcProfitLoss(transactions: Transaction[], corporateTaxRate = 20, pricesInclVat = false): ProfitLoss {
  // Revenue and costs are NET of VAT — when amounts are gross (pricesInclVat) the
  // VAT is extracted so profit isn't overstated by the tax portion.
  const sumCat = (type: 'income' | 'expense', category: string) =>
    transactions
      .filter(t => t.type === type && t.category === category)
      .reduce((sum, t) => sum + getNetISK(t, pricesInclVat), 0);

  const salaTekjur = sumCat('income', 'sala_vara');
  const thjonustutekjur = sumCat('income', 'sala_thjonustu');
  const adrarTekjur = sumCat('income', 'adrar_tekjur');
  const fjarmagntekjur = sumCat('income', 'fjarmagns_tekjur');
  // Operating revenue only — financial income (fjarmagntekjur) belongs BELOW operating
  // profit, so it must not inflate totalRevenue/operatingProfit (added back in profitBeforeTax).
  const totalRevenue = salaTekjur + thjonustutekjur + adrarTekjur;

  const laun = sumCat('expense', 'laun');
  const launatengd = sumCat('expense', 'launatengd_gjold');
  const husaleiga = sumCat('expense', 'husaleiga');
  const rafmagnHiti = sumCat('expense', 'rafmagn_hiti'); // electricity/heating — was omitted entirely
  const simagjold = sumCat('expense', 'simagjold');
  const skrifstofugjold = sumCat('expense', 'skrifstofugjold');
  const samgongur = sumCat('expense', 'samgongur');
  const markadsmal = sumCat('expense', 'markadsmal');
  const fagthjonusta = sumCat('expense', 'fagthjonusta');
  const vorur = sumCat('expense', 'vorur');
  const afskriftir = sumCat('expense', 'afskriftir');
  // Interest portion of loan payments (entered on the payment, whatever category
  // it's booked under) is a financial expense — recognise it here so profit is
  // correct even though the payment itself is a balance-sheet/transfer entry.
  const loanInterest = transactions.reduce((s, t) => s + (t.interestAmount ? toISK(t.interestAmount, t.currency, t.eurToIskRate) : 0), 0);
  const fjarmagnsgjold = sumCat('expense', 'fjarmagnsgjold') + loanInterest;
  const adrir = sumCat('expense', 'adrir_rekstrargjold');

  const totalOperatingExpenses = laun + launatengd + husaleiga + rafmagnHiti + simagjold +
    skrifstofugjold + samgongur + markadsmal + fagthjonusta + vorur + afskriftir + adrir;

  const operatingProfit = totalRevenue - totalOperatingExpenses;
  // Financial income (interest etc.) and financial expenses sit below operating profit.
  const profitBeforeTax = operatingProfit + fjarmagntekjur - fjarmagnsgjold;
  const incomeTax = profitBeforeTax > 0 ? profitBeforeTax * (corporateTaxRate / 100) : 0;
  const netResult = profitBeforeTax - incomeTax;

  return {
    salaTekjur, thjonustutekjur, adrarTekjur, fjarmagntekjur, totalRevenue,
    laun, launatengd, husaleiga, simagjold, skrifstofugjold, samgongur,
    markadsmal, fagthjonusta, vorur, afskriftir, rafmagnHiti, adrir, totalOperatingExpenses,
    operatingProfit, fjarmagnsgjold, profitBeforeTax, incomeTax, netResult,
  };
}

// THE TWO SIDES MUST AGREE ABOUT DEPRECIATION.
//
// The balance sheet writes fixed assets down every year on its own, from cost,
// land value and rate (assetBookValue). The income statement only ever charged
// afskriftir the owner had journalled by hand — which nobody does. So the asset
// fell on one page and the cost never appeared on the other: profit overstated by
// the write-down every year, and the income tax then computed on that inflated
// figure. On this company's own books that was 850.000 a year.
//
// Charge exactly what the balance sheet took away, less anything already booked by
// hand so it is never counted twice, and carry it through the totals — a line that
// shows without moving the profit would be worse than none.
export function withAssetDepreciation(pl: ProfitLoss, items: BalanceSheetItem[], year: number): ProfitLoss {
  const fromAssets = items
    .filter(b => b.section === 'fixed_assets' && b.cost != null && b.acquiredYear != null)
    .reduce((s, b) => {
      // In the year of acquisition there is no prior-year book value to fall from —
      // assetBookValue returns 0 for any year before acquiredYear — so the first
      // year's depreciation would be charged to the balance sheet but never to the
      // P&L. Fall from COST in that year instead.
      const prev = year - 1 < (b.acquiredYear as number) ? (b.cost as number) : assetBookValue(b, year - 1);
      return s + Math.max(0, prev - assetBookValue(b, year));
    }, 0);
  const extra = Math.max(0, fromAssets - pl.afskriftir);
  if (extra === 0) return pl;
  const totalOperatingExpenses = pl.totalOperatingExpenses + extra;
  const operatingProfit = pl.totalRevenue - totalOperatingExpenses;
  const profitBeforeTax = operatingProfit + pl.fjarmagntekjur - pl.fjarmagnsgjold;
  const rate = pl.profitBeforeTax > 0 && pl.incomeTax > 0 ? pl.incomeTax / pl.profitBeforeTax : 0;
  const incomeTax = profitBeforeTax > 0 ? profitBeforeTax * rate : 0;
  return {
    ...pl,
    afskriftir: pl.afskriftir + extra,
    totalOperatingExpenses, operatingProfit, profitBeforeTax, incomeTax,
    netResult: profitBeforeTax - incomeTax,
  };
}

export function filterByYear(transactions: Transaction[], year: number): Transaction[] {
  return transactions.filter(t => yearOf(t.date) === year);
}

export function filterByMonth(transactions: Transaction[], year: number, month: number): Transaction[] {
  return transactions.filter(t => yearOf(t.date) === year && monthOf(t.date) === month);
}

export function filterByQuarter(transactions: Transaction[], year: number, quarter: number): Transaction[] {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  return transactions.filter(t => {
    const m = monthOf(t.date);
    return yearOf(t.date) === year && m >= startMonth && m <= endMonth;
  });
}

export function getMonthlyTotals(transactions: Transaction[], year: number) {
  return Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const monthly = filterByMonth(transactions, year, month);
    const income = monthly.filter(t => t.type === 'income').reduce((s, t) => s + getTransactionISK(t), 0);
    const expenses = monthly.filter(t => t.type === 'expense').reduce((s, t) => s + getTransactionISK(t), 0);
    return { month, income, expenses };
  });
}
