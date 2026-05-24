import { Language, Currency } from '../types';

export function formatISK(amount: number, lang: Language = 'is'): string {
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat(lang === 'is' ? 'is-IS' : 'en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(abs);
  const sign = amount < 0 ? '-' : '';
  return `${sign}${formatted} kr.`;
}

export function formatEUR(amount: number, lang: Language = 'is'): string {
  return new Intl.NumberFormat(lang === 'is' ? 'is-IS' : 'en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatCurrency(
  amount: number,
  currency: Currency,
  lang: Language = 'is'
): string {
  if (currency === 'ISK') return formatISK(amount, lang);
  const noDecimals = ['DKK', 'NOK', 'SEK'].includes(currency);
  return new Intl.NumberFormat(lang === 'is' ? 'is-IS' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: noDecimals ? 0 : 2,
    maximumFractionDigits: noDecimals ? 0 : 2,
  }).format(amount);
}

export function formatDate(dateStr: string, lang: Language = 'is'): string {
  const date = new Date(dateStr + 'T00:00:00');
  return new Intl.DateTimeFormat(lang === 'is' ? 'is-IS' : 'en-US', {
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
