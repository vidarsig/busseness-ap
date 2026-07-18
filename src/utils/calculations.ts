import { Transaction, Currency, Account } from '../types';

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

// Carry-forward: a balance-sheet key's closing balance at the end of each year =
// opening balance + the entries booked onto it (money in +, money out −), rolled
// forward so each year's close is the next year's open. By-the-book normal
// balances: assets/liabilities/equity all move with the cash booked to the key
// (repayment out → liability down; borrowing in → up). NOTE: 'transfer' entries
// are treated as money OUT; interest vs principal is not split (owner books the
// principal portion onto the key). Returns [] for P&L keys / keys with no data.
export function accountBalanceByYear(account: Account, transactions: Transaction[]): { year: number; closing: number }[] {
  const movs = transactions.filter(tx => tx.accountId === account.id);
  if (!movs.length && account.openingBalance == null) return [];
  const movYears = movs.map(tx => new Date(tx.date).getFullYear());
  const start = account.openingYear ?? (movYears.length ? Math.min(...movYears) : NaN);
  const end = movYears.length ? Math.max(start, ...movYears) : start;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
  const rows: { year: number; closing: number }[] = [];
  let bal = account.openingBalance ?? 0;
  for (let y = start; y <= end; y++) {
    const net = movs
      .filter(tx => new Date(tx.date).getFullYear() === y)
      .reduce((s, tx) => {
        const gross = getTransactionISK(tx);
        // A loan payment's interest is a cost, not a reduction of the loan — only
        // the principal (gross − interest) moves the balance. Money in (borrowing)
        // increases the balance by the full amount.
        const interest = tx.interestAmount ? toISK(tx.interestAmount, tx.currency, tx.eurToIskRate) : 0;
        return s + (tx.type === 'income' ? gross : -(gross - interest));
      }, 0);
    bal += net;
    rows.push({ year: y, closing: bal });
  }
  return rows;
}

export function getVATAmountISK(t: Transaction): number {
  const isk = getTransactionISK(t);
  return calcVAT(isk, t.vatRate);
}

export function getTotalISK(t: Transaction): number {
  return getTransactionISK(t) + getVATAmountISK(t);
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

export function calcVATSummary(transactions: Transaction[], rates: number[] = [24, 11, 0]): VATSummary {

  const outputByRate = rates.map(rate => {
    const filtered = transactions.filter(
      t => t.type === 'income' && t.vatRate === rate
    );
    const baseAmount = filtered.reduce((sum, t) => sum + getTransactionISK(t), 0);
    const vatAmount = filtered.reduce((sum, t) => sum + getVATAmountISK(t), 0);
    return { rate, baseAmount, vatAmount, totalAmount: baseAmount + vatAmount };
  });

  const inputByRate = rates.map(rate => {
    const filtered = transactions.filter(
      t => t.type === 'expense' && t.vatRate === rate
    );
    const baseAmount = filtered.reduce((sum, t) => sum + getTransactionISK(t), 0);
    const vatAmount = filtered.reduce((sum, t) => sum + getVATAmountISK(t), 0);
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
  adrir: number;
  totalOperatingExpenses: number;

  operatingProfit: number;

  fjarmagnsgjold: number;
  profitBeforeTax: number;
  incomeTax: number;
  netResult: number;
}

export function calcProfitLoss(transactions: Transaction[], corporateTaxRate = 20): ProfitLoss {
  const sumCat = (type: 'income' | 'expense', category: string) =>
    transactions
      .filter(t => t.type === type && t.category === category)
      .reduce((sum, t) => sum + getTransactionISK(t), 0);

  const salaTekjur = sumCat('income', 'sala_vara');
  const thjonustutekjur = sumCat('income', 'sala_thjonustu');
  const adrarTekjur = sumCat('income', 'adrar_tekjur');
  const fjarmagntekjur = sumCat('income', 'fjarmagns_tekjur');
  const totalRevenue = salaTekjur + thjonustutekjur + adrarTekjur + fjarmagntekjur;

  const laun = sumCat('expense', 'laun');
  const launatengd = sumCat('expense', 'launatengd_gjold');
  const husaleiga = sumCat('expense', 'husaleiga');
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

  const totalOperatingExpenses = laun + launatengd + husaleiga + simagjold +
    skrifstofugjold + samgongur + markadsmal + fagthjonusta + vorur + afskriftir + adrir;

  const operatingProfit = totalRevenue - totalOperatingExpenses;
  const profitBeforeTax = operatingProfit - fjarmagnsgjold;
  const incomeTax = profitBeforeTax > 0 ? profitBeforeTax * (corporateTaxRate / 100) : 0;
  const netResult = profitBeforeTax - incomeTax;

  return {
    salaTekjur, thjonustutekjur, adrarTekjur, fjarmagntekjur, totalRevenue,
    laun, launatengd, husaleiga, simagjold, skrifstofugjold, samgongur,
    markadsmal, fagthjonusta, vorur, afskriftir, adrir, totalOperatingExpenses,
    operatingProfit, fjarmagnsgjold, profitBeforeTax, incomeTax, netResult,
  };
}

export function filterByYear(transactions: Transaction[], year: number): Transaction[] {
  return transactions.filter(t => new Date(t.date).getFullYear() === year);
}

export function filterByMonth(transactions: Transaction[], year: number, month: number): Transaction[] {
  return transactions.filter(t => {
    const d = new Date(t.date);
    return d.getFullYear() === year && d.getMonth() + 1 === month;
  });
}

export function filterByQuarter(transactions: Transaction[], year: number, quarter: number): Transaction[] {
  const startMonth = (quarter - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  return transactions.filter(t => {
    const d = new Date(t.date);
    const m = d.getMonth() + 1;
    return d.getFullYear() === year && m >= startMonth && m <= endMonth;
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
