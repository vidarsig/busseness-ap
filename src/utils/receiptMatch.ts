import { Transaction } from '../types';

const DAY = 86400000;

export function daysApart(a: string, b: string): number {
  const ta = new Date(a).getTime(), tb = new Date(b).getTime();
  if (isNaN(ta) || isNaN(tb)) return Infinity;
  return Math.abs(ta - tb) / DAY;
}

/**
 * Expense transactions that could be the same payment as a receipt: same amount,
 * closest date first. Matching on amount rather than description is the point —
 * the bank writes the terminal name ("Nova Lagmuli") while the receipt lists the
 * goods ("Nokia 3210"), so the two never look alike as text.
 *
 * Used by BOTH receipt screens. The bulk matcher (in Bank Import) attaches a
 * photo to the transaction it finds; the single scanner (in Transactions) uses
 * it to warn before creating a transaction that already exists.
 */
export function findReceiptCandidates(
  txs: Transaction[],
  receipt: { amount: number; date: string },
  excludeIds: Set<string> = new Set(),
): Transaction[] {
  const target = Math.round(receipt.amount);
  return txs
    .filter(t => t.type === 'expense' && !t.receiptUrl && !excludeIds.has(t.id) && Math.round(t.amount) === target)
    .sort((a, b) => daysApart(a.date, receipt.date) - daysApart(b.date, receipt.date));
}

/** Close enough in time that the same amount almost certainly means the same payment. */
export const LIKELY_SAME_PAYMENT_DAYS = 10;
