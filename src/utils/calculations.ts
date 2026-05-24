import { Transaction, Currency } from '../types';

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

export function calcProfitLoss(transactions: Transaction[]): ProfitLoss {
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
  const fjarmagnsgjold = sumCat('expense', 'fjarmagnsgjold');
  const adrir = sumCat('expense', 'adrir_rekstrargjold');

  const totalOperatingExpenses = laun + launatengd + husaleiga + simagjold +
    skrifstofugjold + samgongur + markadsmal + fagthjonusta + vorur + afskriftir + adrir;

  const operatingProfit = totalRevenue - totalOperatingExpenses;
  const profitBeforeTax = operatingProfit - fjarmagnsgjold;
  const incomeTax = profitBeforeTax > 0 ? profitBeforeTax * 0.20 : 0;
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
