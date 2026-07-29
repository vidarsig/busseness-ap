import { Transaction, Currency, Account } from '../types';

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
export function accountBalanceByYear(account: Account, transactions: Transaction[]): { year: number; closing: number }[] {
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
        return s + (moneyIn ? gross : -(gross - interest));
      }, 0);
    bal += net;
    rows.push({ year: y, closing: bal });
  }
  return rows;
}

// Net (ex-VAT) amount of a transaction. When pricesInclVat is true the stored
// amount is GROSS (the 24% is already inside it, e.g. an Icelandic bank deposit)
// so the VAT is EXTRACTED: net = gross ÷ (1 + rate). When false (legacy) the
// stored amount already IS the net.
export function getNetISK(t: Transaction, pricesInclVat = false): number {
  const isk = getTransactionISK(t);
  return pricesInclVat ? isk / (1 + t.vatRate / 100) : isk;
}

export function getVATAmountISK(t: Transaction, pricesInclVat = false): number {
  const isk = getTransactionISK(t);
  // Inclusive: VAT is the part already inside the gross amount (gross − net).
  // Legacy: VAT is added on top of the (net) amount.
  return pricesInclVat ? isk - isk / (1 + t.vatRate / 100) : calcVAT(isk, t.vatRate);
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
}

export function calcVATSummary(transactions: Transaction[], rates: number[] = [24, 11, 0], pricesInclVat = false): VATSummary {

  const outputByRate = rates.map(rate => {
    const filtered = transactions.filter(
      t => t.type === 'income' && t.vatRate === rate
    );
    const baseAmount = filtered.reduce((sum, t) => sum + getNetISK(t, pricesInclVat), 0);
    const vatAmount = filtered.reduce((sum, t) => sum + getVATAmountISK(t, pricesInclVat), 0);
    return { rate, baseAmount, vatAmount, totalAmount: baseAmount + vatAmount };
  });

  const inputByRate = rates.map(rate => {
    const filtered = transactions.filter(
      t => t.type === 'expense' && t.vatRate === rate
    );
    const baseAmount = filtered.reduce((sum, t) => sum + getNetISK(t, pricesInclVat), 0);
    const vatAmount = filtered.reduce((sum, t) => sum + getVATAmountISK(t, pricesInclVat), 0);
    return { rate, baseAmount, vatAmount, totalAmount: baseAmount + vatAmount };
  });

  const totalOutput = outputByRate.reduce((s, r) => s + r.vatAmount, 0);
  const totalInput = inputByRate.reduce((s, r) => s + r.vatAmount, 0);

  return { outputByRate, inputByRate, totalOutput, totalInput, netVAT: totalOutput - totalInput };
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
