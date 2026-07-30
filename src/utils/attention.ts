import { AppData, View } from '../types';
import { invoiceTotals } from './invoiceMath';
import { checkSettingsHealth } from './settingsHealth';

// A single "needs your attention" item — computed deterministically from the data
// (no AI, no server), so the AI Assistant can proactively tell the contractor what
// to deal with today, each with a one-tap jump to the screen that fixes it.
export interface AttentionItem {
  id: 'overdue' | 'drafts' | 'settings';
  count: number;
  amountISK?: number; // ISK-normalised total, formatted by the caller's fmtISK
  view: View;
}

export function getAttention(data: AppData): AttentionItem[] {
  const items: AttentionItem[] = [];
  const invs = data.invoices ?? [];
  const rate = (cur: string) => (data.settings.exchangeRates as unknown as Record<string, number>)[cur] ?? 1;

  // Overdue invoices — money you're owed, past due. Most urgent.
  const overdue = invs.filter(i => i.type === 'invoice' && i.status === 'overdue');
  if (overdue.length) {
    items.push({
      id: 'overdue', count: overdue.length, view: 'invoices',
      amountISK: overdue.reduce((s, i) => s + invoiceTotals(i).total * rate(i.currency), 0),
    });
  }

  // Draft invoices sitting unsent — work you can bill for but haven't.
  const drafts = invs.filter(i => i.type === 'invoice' && i.status === 'draft');
  if (drafts.length) items.push({ id: 'drafts', count: drafts.length, view: 'invoices' });

  // A likely-wrong setting (wrong tax/currency) — reuse the settings health check.
  const health = checkSettingsHealth(data.settings);
  if (health.length) items.push({ id: 'settings', count: health.length, view: 'settings' });

  return items;
}
