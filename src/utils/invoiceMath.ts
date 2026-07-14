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
