import { Language, Currency } from '../types';

// Not every browser ships Icelandic locale data — Android WebViews in particular
// are often built with a trimmed ICU — and when it is missing Intl does not
// complain: it quietly resolves "is-IS" to something like en-GB and every number
// in the app comes out with English separators. "1.632.000 kr." became
// "1,632,000 kr." on the very screen a new customer reads first, and the same
// silent fallback reaches invoices, reports and the annual accounts.
//
// So ask Intl what it actually resolved to, and fall back to German, which groups
// and decimalises exactly like Icelandic (1.632.000,50) and dates the same way
// (31.12.2025). Resolved once — this runs on every formatted figure.
const localeFor = (lang: Language): string => {
  if (lang !== 'is') return 'en-US';
  return icelandicLocale ??= new Intl.NumberFormat('is-IS').resolvedOptions().locale.startsWith('is')
    ? 'is-IS'
    : 'de-DE';
};
let icelandicLocale: string | undefined;

// The language every formatter falls back to when the caller does not pass one.
// It used to be a hardcoded 'is'. Twenty call sites omit the argument — among
// them every figure on an invoice — so a US contractor's invoice, the document
// he sends his own customer, printed "0,00 $" instead of "$0.00". The annual
// accounts escaped it only because they format through the context helpers,
// which do thread the language. AppContext sets this whenever the language does.
let uiLang: Language = 'is';
export function setUiLanguage(lang: Language) { uiLang = lang || 'is'; }

export function formatISK(amount: number, lang: Language = uiLang): string {
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat(localeFor(lang), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs);
  const sign = amount < 0 ? '-' : '';
  return `${sign}${formatted} kr.`;
}

// A bare grouped number, no currency suffix — for table cells whose column header
// already names the unit (an exported "2024 ISK" column). Goes through localeFor so
// it cannot fall into the silent en-GB resolution described above.
export function formatNumber(amount: number, lang: Language = uiLang): string {
  return new Intl.NumberFormat(localeFor(lang), {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatEUR(amount: number, lang: Language = uiLang): string {
  return new Intl.NumberFormat(localeFor(lang), {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCurrency(
  amount: number,
  currency: Currency,
  lang: Language = uiLang
): string {
  if (currency === 'ISK') return formatISK(amount, lang);
  const noDecimals = ['DKK', 'NOK', 'SEK'].includes(currency);
  return new Intl.NumberFormat(localeFor(lang), {
    style: 'currency',
    currency,
    minimumFractionDigits: noDecimals ? 0 : 2,
    maximumFractionDigits: noDecimals ? 0 : 2,
  }).format(amount);
}

export function formatDate(dateStr: string, lang: Language = uiLang): string {
  const date = new Date(dateStr + 'T00:00:00');
  return new Intl.DateTimeFormat(localeFor(lang), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

export function formatPercent(value: number): string {
  return `${value}%`;
}

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}
