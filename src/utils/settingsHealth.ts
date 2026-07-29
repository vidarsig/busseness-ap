import { AppSettings } from '../types';
import { COUNTRY_CONFIGS, US_STATES } from '../data/countries';

// A likely-wrong setting spotted proactively (before a customer ever complains),
// with a plain-words message and a one-tap fix payload. High-confidence checks only —
// we'd rather miss a subtle case than nag about a legitimate choice.
export interface SettingsIssue {
  id: string;
  message: string;
  fixLabel: string;
  fix: Partial<AppSettings>;
}

// US states that levy NO state sales tax — charging any there is wrong.
const NO_TAX_STATES = new Set(['Alaska', 'Delaware', 'Montana', 'New Hampshire', 'Oregon']);

export function checkSettingsHealth(settings: AppSettings): SettingsIssue[] {
  const issues: SettingsIssue[] = [];
  const country = settings.country;
  const cc = COUNTRY_CONFIGS[country];
  const rate = settings.salesTaxRate ?? 0;

  // 1) US no-sales-tax state but a rate is set → charging tax that shouldn't exist.
  if (country === 'US' && settings.usState && NO_TAX_STATES.has(settings.usState) && rate > 0) {
    issues.push({
      id: 'us-no-tax-state',
      message: `${settings.usState} has no state sales tax, but you're set to charge ${rate}%. That would over-charge your customers.`,
      fixLabel: 'Set sales tax to 0%',
      fix: { salesTaxRate: 0, standardRate: 0, vatRates: [0] },
    });
  }

  // 2) US sales-tax rate implausibly high (combined US rates almost never exceed ~11%).
  if (country === 'US' && rate > 13) {
    const st = US_STATES.find(s => s.name === settings.usState);
    issues.push({
      id: 'us-rate-too-high',
      message: `A sales-tax rate of ${rate}% looks too high for the US — most states are 4–8%${st ? ` (${st.name}'s base is ${st.rate}%)` : ''}. Double-check it.`,
      fixLabel: st ? `Use ${st.name}'s ${st.rate}%` : 'Review it',
      fix: st ? { salesTaxRate: st.rate, standardRate: st.rate, vatRates: st.rate > 0 ? [st.rate, 0] : [0] } : {},
    });
  }

  // 3) Default currency doesn't match the country's own currency — totals would show
  //    the wrong money. Legitimate to invoice foreign currencies per-invoice, but the
  //    DEFAULT should be the home currency.
  if (cc && settings.defaultCurrency && settings.defaultCurrency !== cc.currency) {
    issues.push({
      id: 'currency-mismatch',
      message: `Your country is ${cc.nameEn} but your default currency is ${settings.defaultCurrency}, not ${cc.currency}. Totals may show the wrong money.`,
      fixLabel: `Use ${cc.currency}`,
      fix: { defaultCurrency: cc.currency },
    });
  }

  return issues.filter(i => Object.keys(i.fix).length > 0 || i.id === 'us-rate-too-high');
}
