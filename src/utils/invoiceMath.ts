import { InvoiceLine } from '../types';

export interface Discountable {
  lines: InvoiceLine[];
  discountType?: 'percent' | 'amount';
  discountValue?: number;
}

// Totals for an invoice / quote / offer. An optional whole-document discount is
// spread proportionally across the lines, so each VAT rate's tax is reduced by
// the same factor and the numbers stay by-the-book. `discount` is the money taken
// off the net (excl. VAT) amount.
export function invoiceTotals(inv: Discountable) {
  let subtotal = 0;
  inv.lines.forEach(l => { subtotal += l.quantity * l.unitPrice; });

  const raw = inv.discountType === 'percent'
    ? subtotal * (inv.discountValue ?? 0) / 100
    : (inv.discountValue ?? 0);
  const discount = subtotal > 0 ? Math.min(Math.max(raw, 0), subtotal) : 0;
  const factor = subtotal > 0 ? (subtotal - discount) / subtotal : 1;

  let vatTotal = 0;
  inv.lines.forEach(l => { vatTotal += l.quantity * l.unitPrice * factor * (l.vatRate / 100); });

  const netSubtotal = subtotal - discount;
  return { subtotal, discount, netSubtotal, vatTotal, total: netSubtotal + vatTotal };
}

// The one VAT rate that speaks for an invoice, for linking a payment to it (R9-6).
// If every line shares a rate that's the invoice's rate; a mixed-rate invoice has
// no single rate, so returns null (caller keeps the row's rate + warns instead of
// guessing). Empty/lineless invoices return null too.
export function invoiceVatRate(lines: InvoiceLine[]): number | null {
  if (!lines.length) return null;
  const first = lines[0].vatRate;
  return lines.every(l => l.vatRate === first) ? first : null;
}
