import { useState, useRef } from 'react';
import { Upload, Check, X, AlertCircle, Zap, BookOpen, Bot, Loader2, Receipt, FileText } from 'lucide-react';
import ReceiptMatcher from './ReceiptMatcher';
import OpeningBalances from './OpeningBalances';
import { useApp } from '../contexts/AppContext';
import { Transaction, TransactionType, Invoice, Account, EXPENSE_CATEGORIES, INCOME_CATEGORIES, TRANSFER_CATEGORIES, CategoryRule } from '../types';
import { categorizeBatch, detectImportColumns, ImportColumnMap } from '../utils/ai';
import { invoiceTotals, invoiceVatRate } from '../utils/invoiceMath';
import { matchRule } from './AutoRules';
import { reviewImport, ImportFinding } from '../utils/calculations';
import { todayISO } from '../utils/formatters';

function newId() { return `tx_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; }

// Icelandic counts the noun, not the digit: 1 færsla, 2 færslur, 21 færsla,
// 111 færslur. The rule is the last digit — 1 takes the singular unless the
// number ends in 11. The import screen read "14 færsla" five times in a row on
// a new customer's very first screen, which is the kind of thing that makes a
// piece of software feel foreign.
function isPlural(n: number, one: string, many: string) {
  const abs = Math.abs(Math.round(n));
  return abs % 10 === 1 && abs % 100 !== 11 ? one : many;
}
const rowsWord = (n: number, lang: string) =>
  lang === 'is' ? isPlural(n, 'færsla', 'færslur') : (Math.abs(n) === 1 ? 'row' : 'rows');

type BankFormat = 'arion' | 'islandsbanki' | 'landsbankinn' | 'generic' | 'auto';

interface ParsedRow {
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  reference?: string;
}

function parseCsv(text: string): string[][] {
  const lines = text.trim().split(/\r?\n/);
  return lines.map(line => {
    const result: string[] = [];
    let inQuote = false, cur = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuote = !inQuote; }
      else if ((ch === ',' || ch === ';') && !inQuote) { result.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur.trim());
    return result;
  });
}

// preferMonthFirst: when a d/m/y date is genuinely ambiguous (both numbers ≤ 12),
// which order to assume. US & Canadian bank files write MM/DD/YYYY, Icelandic and
// most European ones DD/MM/YYYY. An unambiguous token (a number > 12) always wins
// over this preference, so a stray DD/MM row in a US file still reads correctly.
function parseDate(raw: string, preferMonthFirst = false): string {
  if (raw == null || raw === '') return todayISO();
  // Strip quotes/whitespace only — keep the . / - separators (Arion uses dots).
  const cleaned = String(raw).replace(/['"]/g, '').trim();
  // yyyy-mm-dd / yyyy.mm.dd / yyyy/mm/dd  (ISO-ish, year first)
  const iso = cleaned.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,'0')}-${iso[3].padStart(2,'0')}`;
  // dd.mm.yyyy / mm.dd.yyyy and / or - separators. First two numbers are day & month
  // in SOME order; disambiguate by value first, then by the country preference.
  const dm = cleaned.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dm) {
    const a = parseInt(dm[1], 10), b = parseInt(dm[2], 10);
    const y = dm[3].length === 2 ? `20${dm[3]}` : dm[3];
    let day: number, month: number;
    if (a > 12)      { day = a; month = b; }   // first can't be a month → day-first
    else if (b > 12) { month = a; day = b; }   // second can't be a month → month-first
    else             { if (preferMonthFirst) { month = a; day = b; } else { day = a; month = b; } }
    return `${y}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  // Excel serial date (days since 1899-12-30) — safety net if a cell comes raw.
  if (/^\d+(\.\d+)?$/.test(cleaned)) {
    const serial = parseFloat(cleaned);
    if (serial > 59 && serial < 200000) {
      const d = new Date(Date.UTC(1899, 11, 30) + serial * 86400000);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
  }
  // Last resort: let the engine try.
  const p = new Date(cleaned);
  if (!isNaN(p.getTime())) return p.toISOString().split('T')[0];
  return todayISO();
}

// Robust amount parser: handles "-1,100.00" (US) and "1.100,00" (EU) and plain
// numbers. The rightmost of '.' / ',' is treated as the decimal separator.
function parseAmount(raw: string): number {
  if (raw == null) return 0;
  let s = String(raw).trim();
  if (!s) return 0;
  const neg = /-/.test(s) || /\(/.test(s);          // minus or accounting parens
  s = s.replace(/[^0-9.,]/g, '');
  if (!s) return 0;
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let decSep = lastDot > lastComma ? '.' : (lastComma > -1 ? ',' : '');

  // Only ONE kind of separator, used once, with exactly three digits after it —
  // "20.000" / "1,500". That is a THOUSANDS separator, not a decimal point:
  // Icelandic krónur are whole numbers written 20.000 = twenty thousand.
  // Reading it as a decimal turned every such row into 20 kr. instead of 20,000.
  if (decSep && (lastDot === -1 || lastComma === -1)) {
    const sepCount = s.split(decSep).length - 1;
    const afterSep = s.length - s.lastIndexOf(decSep) - 1;
    if (sepCount > 1 || afterSep === 3) {
      s = s.split(decSep).join('');
      decSep = '';
    }
  }

  if (decSep) {
    const thouSep = decSep === '.' ? ',' : '.';
    s = s.split(thouSep).join('');                   // strip thousands separators
    if (decSep === ',') s = s.replace(',', '.');
  }
  const n = parseFloat(s) || 0;
  return neg ? -Math.abs(n) : n;
}

// Find the header row (the one starting with the date column) and return the
// data rows after it. Arion exports have a few metadata rows on top.
function dataAfterHeader(rows: string[][]): string[][] {
  const h = rows.findIndex(r => {
    const c = String(r[0] ?? '').toLowerCase().trim();
    return c === 'dagsetning' || c === 'date';
  });
  const start = h >= 0 ? h + 1 : 1;                  // fall back to skipping one header row
  return rows.slice(start).filter(r => r.length >= 2 && String(r[0] ?? '').trim());
}

// Read the column HEADINGS rather than trusting a fixed column order.
//
// Banks ship several different exports under the same name — Arion's netbank
// "AccountTransactions" file does not have the same layout as its classic
// statement, and some exports split money-in and money-out into two columns
// instead of one signed column. Guessing by position silently mis-reads those:
// if the assumed amount column is really the running balance ("Staða") every row
// looks positive and the whole file imports as INCOME. So: match on names, and
// only fall back to fixed positions when no header is recognisable.
const HEADINGS = {
  date: ['dagsetning', 'date', 'bókunardagur', 'bokunardagur', 'vinnsludagur', 'transaction date',
         'posting date', 'post date', 'trans date', 'value date', 'booking date', 'settlement date'],
  amount: ['upphæð', 'upphaed', 'amount', 'fjárhæð', 'fjarhaed', 'færsluupphæð'],
  debit: ['debet', 'debit', 'úttekt', 'uttekt', 'útborgun', 'utborgun', 'gjöld', 'gjold', 'út', 'withdrawal', 'money out'],
  credit: ['kredit', 'credit', 'innborgun', 'innlegg', 'inn', 'deposit', 'money in'],
  description: ['skýring', 'skyring', 'texti', 'lýsing', 'lysing', 'description', 'text', 'nafn', 'details'],
  reference: ['tilvísun', 'tilvisun', 'seðilnúmer', 'sedilnumer', 'reference', 'ref'],
};

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/['"]/g, '').trim();

export function findHeaderMap(rows: string[][]): ImportColumnMap | null {
  // The header is whichever of the first rows names a date column.
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const cells = (rows[i] ?? []).map(norm);
    // EXACT match first, then whole-word containment.
    //
    // Exact has to win outright: Chase ships BOTH "Details" (which holds
    // CREDIT/DEBIT) and "Description" (the payee), and a first-past-the-post
    // scan handed us column 0 as the description.
    //
    // Whole-word — rather than the old "only substrings of 6+ characters" —
    // because that rule silently lost every US bank: their date column is
    // "Posting Date" or "Transaction Date", and "date" is four letters, so no
    // header was ever found and the file fell through to fixed column numbers.
    // The length rule existed to stop "inn" matching "Innstæða" (the running
    // BALANCE) and being read as money in; a word boundary stops that properly —
    // "inn" is not a word inside "innstæða" — while still finding "Posting Date".
    const hasWord = (c: string, n: string) =>
      new RegExp(`(^|[^\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}\\p{N}]|$)`, 'u').test(c);
    // Walk the NAMES in order, not the columns: when a file has two headings we
    // recognise, the better name has to win wherever it sits. Chase puts
    // "Details" (CREDIT/DEBIT) in column 0 and "Description" (the payee) in
    // column 2, so scanning columns first hands back the wrong one — the list
    // below is written best-first for exactly this reason.
    const find = (names: string[]) => {
      for (const n of names) { const i = cells.findIndex(c => c === n); if (i >= 0) return i; }
      for (const n of names) { const i = cells.findIndex(c => c && hasWord(c, n)); if (i >= 0) return i; }
      return null;
    };
    const date = find(HEADINGS.date);
    if (date == null) continue;

    const amount = find(HEADINGS.amount);
    const debit = find(HEADINGS.debit);
    const credit = find(HEADINGS.credit);
    // Need a usable money column: one signed amount, or a debit/credit pair.
    if (amount == null && debit == null && credit == null) continue;

    const description = find(HEADINGS.description);
    return {
      headerRows: i + 1,
      date,
      description: description ?? date + 1,
      // Prefer the split pair when present — it carries the direction reliably.
      amount: debit != null || credit != null ? null : amount,
      debit,
      credit,
      reference: find(HEADINGS.reference),
    };
  }
  return null;
}

export function parseBank(rows: string[][], format: BankFormat, preferMonthFirst = false): ParsedRow[] {
  // Whatever the user picked, trust real headings over assumed positions.
  const byHeader = findHeaderMap(rows);
  if (byHeader) return parseWithMap(rows, byHeader, preferMonthFirst);

  const dataRows = dataAfterHeader(rows);
  switch (format) {
    case 'arion':
      // Real Arion export columns:
      // 0 Dagsetning | 1 Upphæð | 2 Mynt | 3 Skýring | 4 Seðilnúmer | 5 Tilvísun | 6 Texti | … | 13 Nafn
      return dataRows.map(r => {
        const amt = parseAmount(r[1] ?? '');
        const desc = (r[3] || r[13] || r[6] || '').toString().trim();
        return { date: parseDate(r[0] ?? '', preferMonthFirst), description: desc, reference: (r[5] || r[4] || '').toString().trim(), amount: Math.abs(amt), type: (amt >= 0 ? 'income' : 'expense') as 'income' | 'expense' };
      }).filter(r => r.amount > 0);
    case 'islandsbanki':
      return dataRows.map(r => {
        const credit = parseAmount(r[3] ?? '');
        const debit = parseAmount(r[4] ?? '');
        const amt = credit > 0 ? credit : -debit;
        return { date: parseDate(r[0] ?? '', preferMonthFirst), description: r[1] ?? '', reference: r[2] ?? '', amount: Math.abs(amt), type: (amt >= 0 ? 'income' : 'expense') as 'income' | 'expense' };
      }).filter(r => r.amount > 0);
    case 'landsbankinn':
      return dataRows.map(r => {
        const amt = parseAmount(r[2] ?? '');
        return { date: parseDate(r[0] ?? '', preferMonthFirst), description: r[1] ?? '', amount: Math.abs(amt), type: (amt >= 0 ? 'income' : 'expense') as 'income' | 'expense' };
      }).filter(r => r.amount > 0);
    case 'generic':
    default:
      return dataRows.map(r => {
        const amt = parseAmount(r[2] ?? r[1] ?? '');
        return { date: parseDate(r[0] ?? '', preferMonthFirst), description: r[1] ?? '', amount: Math.abs(amt), type: (amt >= 0 ? 'income' : 'expense') as 'income' | 'expense' };
      }).filter(r => r.amount > 0);
  }
}

// Migration: parse rows using an AI-detected column map (any program's layout).
function parseWithMap(rows: string[][], map: ImportColumnMap, preferMonthFirst = false): ParsedRow[] {
  const dataRows = rows.slice(map.headerRows).filter(r => r.length && String(r[map.date] ?? '').trim());
  return dataRows.map(r => {
    let amt: number;
    if (map.amount != null) {
      amt = parseAmount(String(r[map.amount] ?? ''));
    } else {
      const credit = map.credit != null ? parseAmount(String(r[map.credit] ?? '')) : 0;
      const debit = map.debit != null ? parseAmount(String(r[map.debit] ?? '')) : 0;
      amt = credit !== 0 ? Math.abs(credit) : -Math.abs(debit);
    }
    const ref = map.reference != null ? String(r[map.reference] ?? '').trim() : '';
    return {
      date: parseDate(String(r[map.date] ?? ''), preferMonthFirst),
      description: String(r[map.description] ?? '').trim(),
      reference: ref,
      amount: Math.abs(amt),
      type: (amt >= 0 ? 'income' : 'expense') as 'income' | 'expense',
    };
  }).filter(r => r.amount > 0);
}

interface ImportRow extends ParsedRow {
  selected: boolean;
  category: string;
  vatRate: number;
  matchedRule?: string; // rule id that matched
  learned?: boolean;    // recognised from how this same payer was booked before
  learnOpen?: boolean;  // show inline learn panel
  needsReview?: boolean; // AI was unsure — human should check before importing
  invoiceId?: string;    // linked to this Reikningur — VAT then comes from the invoice (R9-6)
  matchedInvoice?: string; // that invoice's number, for the row badge
}

// Fold case + Icelandic accents so "Fylkir" in a bank line matches a "Fylkir ehf."
// customer name (same idea as the AI match helper / the Færslur name filter).
const foldName = (s: string) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/æ/g, 'ae').replace(/ø/g, 'o')
  .replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();

// The customer's "core" name for matching against a (often terse) bank line:
// drop a trailing company form so "Fylkir ehf." is found when the bank writes
// just "Fylkir". Kept ≥3 chars by the caller so a tiny core can't over-match.
const coreName = (s: string) => foldName(s).replace(/\s+(ehf|hf|sf|slf|ohf|ses|ltd|inc|llc|co)$/, '').trim();

// R9-6 auto-link: find the invoice a deposit pays, so its VAT rate comes from the
// invoice instead of a guess. The customer's name MUST appear in the bank
// description (that's how we know whose invoice it is); draft and mixed-rate
// invoices are ignored (no single authoritative rate to copy). Then:
//   • Exact total match → that invoice (a full payment), if unique.
//   • Otherwise a PARTIAL payment (owner's rule) → the customer's LAST (most
//     recent) still-unpaid invoice it could be paying (deposit ≤ its total).
// Never links on amount alone, and stays silent when the customer is ambiguous.
function invoiceTotalISK(inv: Invoice): number {
  const t = invoiceTotals(inv);
  return inv.currency === 'ISK' ? t.total : t.total * inv.eurToIskRate;
}
// `received` maps invoice id → ISK already paid against it (from linked deposits),
// so "unpaid" and "the amount still owed" are exact, not a manual status flag.
function matchInvoice(desc: string, amountISK: number, invoices: Invoice[], received: Map<string, number>): Invoice | null {
  const fdesc = foldName(desc);
  const mine = invoices.filter(inv => {
    if (inv.type !== 'invoice' || inv.status === 'draft') return false;
    if (invoiceVatRate(inv.lines) == null) return false;   // mixed-rate → don't guess one rate
    const name = coreName(inv.customer.name || '');
    return name.length >= 3 && fdesc.includes(name);
  });
  if (!mine.length) return null;

  // Full payment: a single invoice whose total equals the deposit (within rounding).
  const exact = mine.filter(inv => Math.abs(invoiceTotalISK(inv) - amountISK) <= Math.max(1, amountISK * 0.005));
  if (exact.length === 1) return exact[0];

  // Partial payment: attach to the most recent invoice that still has a balance
  // owing and is big enough to be paying (deposit ≤ what's still outstanding).
  const unpaid = mine
    .filter(inv => {
      if (inv.status === 'paid') return false;
      const outstanding = invoiceTotalISK(inv) - (received.get(inv.id) ?? 0);
      return outstanding > 1 && amountISK <= outstanding * 1.005;
    })
    .sort((a, b) => (b.date.localeCompare(a.date)) || b.number.localeCompare(a.number, undefined, { numeric: true }));
  return unpaid[0] ?? null;
}

// Reduce a bank description to the counterparty's name, so the same payer is
// recognised whether it arrives as "Fylkir ehf." or "Fylkir ehf. — leiga".
function partyKey(desc: string): string {
  return String(desc || '')
    .split(/\s+[—–-]\s+/)[0]      // drop an " — leiga" style suffix
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Learn how each counterparty has been booked before, from the owner's own
// books. Once a payer is keyed consistently — Viðar's own transfers as framlag,
// Victor's as rent, a lender's money-in as a loan — a NEW deposit from that same
// payer is recognised as the SAME type automatically: no AI guess, no re-typing.
// Only trusted when the past bookings agree (≥70%); a payer booked inconsistently
// is left for the AI / the owner to decide, so a genuine mix never auto-mislabels.
function buildPartyHistory(txns: Transaction[]): Map<string, { type: TransactionType; category: string; vatRate: number }> {
  const groups = new Map<string, Transaction[]>();
  for (const tx of txns) {
    const k = partyKey(tx.description);
    if (k.length < 3) continue;   // skip empty / too-generic descriptions
    const g = groups.get(k);
    if (g) g.push(tx); else groups.set(k, [tx]);
  }
  const out = new Map<string, { type: TransactionType; category: string; vatRate: number }>();
  for (const [k, list] of groups) {
    const tally = new Map<string, { n: number; tx: Transaction }>();
    for (const tx of list) {
      const ck = `${tx.type}|${tx.category}`;
      const cur = tally.get(ck);
      if (cur) cur.n++; else tally.set(ck, { n: 1, tx });
    }
    let best: { n: number; tx: Transaction } | null = null;
    for (const v of tally.values()) if (!best || v.n > best.n) best = v;
    if (best && best.n / list.length >= 0.7) {
      out.set(k, { type: best.tx.type, category: best.tx.category, vatRate: best.tx.vatRate });
    }
  }
  return out;
}

export default function BankImport() {
  const { data, dispatch, t, lang, cc, fmtISK } = useApp();
  const fileRef = useRef<HTMLInputElement>(null);
  // The Arion/Íslandsbanki/Landsbankinn presets are Iceland-only; elsewhere the
  // Generic + AI options cover any bank, so default a non-IS company to Generic.
  const [format, setFormat] = useState<BankFormat>(() => cc.code === 'IS' ? 'arion' : 'generic');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(0);
  // How many rows were already in the books — shown, never swallowed.
  const [skippedDupes, setSkippedDupes] = useState(0);
  const [findings, setFindings] = useState<ImportFinding[]>([]);
  const [imported, setImported] = useState<Transaction[]>([]);
  // Parties whose usual key was applied straight from the finding.
  const [keyed, setKeyed] = useState<Record<string, string>>({});
  // What each party was taught, and whether teaching it had to CREATE the key.
  const [taught, setTaught] = useState<Record<string, { role: string; keyNumber?: string; keyName?: string; created: boolean }>>({});
  // Every figure shown below comes from reviewImport, which sums with
  // getTransactionISK — i.e. ISK-base, whatever the company trades in. Printing
  // that straight into the company's currency showed a US customer his own
  // deposits multiplied by the dollar rate: an $8,500 roof job read back as
  // "$1,164,500.00". fmtISK converts back before formatting; for an ISK company
  // it is the same number it always was.
  const fmt = (n: number) => fmtISK(Math.abs(n));
  const [error, setError] = useState('');
  const [learnPattern, setLearnPattern] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiProgress, setAiProgress] = useState(0);
  const [aiTotal, setAiTotal] = useState(0);
  const [showReceipts, setShowReceipts] = useState(false);
  const [dragging, setDragging] = useState(false);

  function applyRulesToRows(parsed: ReturnType<typeof parseBank>): ImportRow[] {
    const rules = data.categoryRules;
    const history = buildPartyHistory(data.transactions);
    // How much has already been received against each invoice (from deposits
    // linked in earlier imports/edits), so partials land on a truly-open invoice.
    const received = new Map<string, number>();
    for (const tx of data.transactions) {
      if (tx.type === 'income' && tx.invoiceId) {
        received.set(tx.invoiceId, (received.get(tx.invoiceId) ?? 0) + (tx.currency === 'ISK' ? tx.amount : tx.amount * tx.eurToIskRate));
      }
    }
    return parsed.map(p => {
      // 1) An explicit rule the owner saved always wins.
      const matched = matchRule(p.description, rules);
      if (matched) {
        return { ...p, selected: true, category: matched.category, vatRate: matched.vatRate, type: matched.type, matchedRule: matched.id };
      }
      // 2) An income deposit that clearly pays one invoice takes its VAT from that
      //    invoice (R9-6) — the authoritative rate, ahead of any learned guess.
      if (p.type === 'income') {
        const inv = matchInvoice(p.description, p.amount, data.invoices ?? [], received);
        if (inv) {
          const rate = invoiceVatRate(inv.lines) ?? 0;
          return { ...p, selected: true, category: 'sala_thjonustu', vatRate: rate, type: 'income', invoiceId: inv.id, matchedInvoice: inv.number };
        }
      }
      // 4) Otherwise, recognise the payer from how they were booked before —
      //    but the BANK still decides which way the money went. Learning what a
      //    party IS must never overrule the statement's own sign, because one
      //    mis-booked row then multiplies: three Húsasmiðjan rows that had been
      //    filed as income taught this that the timber yard is a CUSTOMER, and on
      //    the next import 81 ordinary card purchases came back as revenue,
      //    inflating both turnover and the VAT payable on it. A learned
      //    "transfer" is different and still honoured — it reclassifies a row
      //    without flipping it.
      const learned = history.get(partyKey(p.description));
      if (learned) {
        const flips = learned.type !== 'transfer' && learned.type !== p.type;
        return flips
          ? { ...p, selected: true, category: p.type === 'income' ? 'sala_thjonustu' : 'adrir_rekstrargjold', vatRate: learned.vatRate, needsReview: true }
          : { ...p, selected: true, category: learned.category, vatRate: learned.vatRate, type: learned.type, learned: true };
      }
      // 5) New payer, no history — fall back to a plain default for the AI to refine.
      return {
        ...p,
        selected: true,
        category: p.type === 'income' ? 'sala_thjonustu' : 'adrir_rekstrargjold',
        vatRate: 0,
        type: p.type,
      };
    });
  }

  async function aiCategorizeAll() {
    if (aiLoading) return;
    const allCategories = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES] as string[];
    const validVats = cc.isUSA ? [data.settings.salesTaxRate, 0] : cc.vatRates;
    // Only ask the AI about rows your own rules didn't already match — saves
    // calls and keeps your rules authoritative.
    const todo = rows.map((r, i) => ({ r, i })).filter(({ r }) => !r.matchedRule && !r.learned && !r.invoiceId);
    if (todo.length === 0) return;

    setAiLoading(true);
    setError('');
    setAiProgress(0);
    setAiTotal(todo.length);

    // DECIDE ONCE PER MERCHANT, NOT ONCE PER ROW.
    //
    // Every row used to be judged on its own inside a batch of 40, and each batch
    // was an independent call with no memory of the last one. So the SAME merchant
    // got different answers depending on where it happened to fall in the file: on
    // a real import, 32 fuel rows (N1 / Orkan / OB) came back as four different
    // categories — including húsaleiga — at two different VAT rates. Books that
    // disagree with themselves are worse than books that are consistently wrong,
    // because nothing reconciles and the owner cannot see the pattern.
    //
    // So: group the rows by their normalised description, ask about each distinct
    // merchant ONCE, and apply that answer to every row it owns. Sorting the
    // merchants first also puts "N1 Laekjargata" next to "N1 ehf." in the same
    // call, so near-identical names are judged together instead of hours apart.
    // On the 188-row import this cut the rows sent to the AI by well over half.
    //
    // Bank lines also carry the BRANCH — "N1 Laekjargata", "N1 Haholt", "Orkan
    // Dalvegi", "Orkan Fitjum" — so grouping on the whole name still leaves one
    // petrol chain looking like four different suppliers. Telling the model to
    // treat them as one was not enough, so the code decides it: rows whose first
    // word matches join one family. Merging on a first word could in principle
    // put two people who share a forename together, so a family only forms when
    // the first word is clearly a trading name rather than a given name — it has
    // a digit in it (N1), is very short (OB, BK), or the same word already heads
    // three or more different lines. Anything else stays on its own.
    const first = (s: string) => foldName(s).split(' ')[0] || '';
    const heads = new Map<string, Set<string>>();
    for (const item of todo) {
      const h = first(item.r.description);
      if (!h) continue;
      const set = heads.get(h) ?? new Set<string>();
      set.add(foldName(item.r.description));
      heads.set(h, set);
    }
    const isFamily = (h: string) =>
      !!h && (/\d/.test(h) || h.length <= 3 || (heads.get(h)?.size ?? 0) >= 3);
    const keyOf = (desc: string) => {
      const h = first(desc);
      return isFamily(h) ? `#${h}` : (foldName(desc) || desc);
    };

    const groups = new Map<string, { rows: typeof todo; sample: string; total: number }>();
    for (const item of todo) {
      const k = keyOf(item.r.description);
      const g = groups.get(k);
      if (g) { g.rows.push(item); g.total += item.r.amount; }
      else groups.set(k, { rows: [item], sample: item.r.description, total: item.r.amount });
    }
    const merchants = [...groups.values()].sort((a, b) => a.sample.localeCompare(b.sample));

    // The categoriser used to see a description, an amount and a direction, and
    // nothing else — not the settings, not the chat, not what the owner had already
    // taught it. So a company that had just said "I'm on my own, no employees" got
    // twelve rows booked to Laun. Hand it the few facts that actually change an
    // answer.
    const staff = (data.employees ?? []).length;
    // Does this business have VAT-EXEMPT activity as well as taxable work? It
    // changes the answer on every builders' merchant: a landlord refurbishing
    // residential flats cannot reclaim the VAT on the materials, however plainly
    // the timber yard charged it. Letting shows up as an active rent revenue key,
    // or as income the owner has marked VAT-exempt.
    const rentKey = (data.accounts ?? []).some(a =>
      a.isActive && a.type === 'revenue' && /leig|rent|h[uú]saleig/i.test(`${a.name} ${a.nameEn || ''}`));
    const exemptIncome = data.transactions.some(t => t.type === 'income' && (t.vatExempt || t.vatRate === 0));
    const businessContext = [
      `Company: ${data.settings.company.name || '(unnamed)'} in ${data.settings.country || 'unknown country'}.`,
      staff === 0
        ? 'Nobody is on the payroll — there are no employees, so a payment is never wages.'
        : `${staff} ${staff === 1 ? 'person is' : 'people are'} on the payroll.`,
      rentKey || exemptIncome
        ? 'This business ALSO has VAT-exempt activity (it lets property / books VAT-exempt income) '
          + 'alongside its taxable work. So a purchase is only reclaimable if it served the TAXABLE '
          + 'side. Materials for refurbishing let residential property are NOT reclaimable — do not '
          + 'put the standard rate on a builders\' merchant here without asking.'
        : 'All of this business\'s activity appears to be VAT-taxable.',
      (data.aiMemory || '').trim()
        ? `Parties the owner has already identified:
${(data.aiMemory || '').trim()}`
        : '',
    ].filter(Boolean).join(String.fromCharCode(10));

    // Batches are now merchants, not rows.
    const BATCH = 40;
    let processed = 0;
    let failed = 0;
    let lastError = '';
    try {
      for (let start = 0; start < merchants.length; start += BATCH) {
        const slice = merchants.slice(start, start + BATCH);
        try {
          const results = await categorizeBatch(
            slice.map(g => ({
              description: g.sample,
              amount: Math.round(g.total / g.rows.length),   // the typical amount
              // THE BANK'S DIRECTION, TAKEN FROM THE BANK — not from the row, whose
              // type the last run may already have changed. The prompt tells the model
              // "detected IS THE BANK'S OWN DIRECTION AND IT IS NOT YOURS TO OVERRULE";
              // feeding it the previous answer instead turned that instruction into a
              // lock on the model's own earlier mistake. Fuel bought at N1 came back as
              // an owner's draw, and every re-run then cited that draw as the bank's
              // word for it. The sign on the statement cannot be argued with.
              detectedType: (g.rows[0].r.amount < 0 ? 'expense' : 'income') as TransactionType,
              rowCount: g.rows.length,
            })),
            allCategories,
            validVats,
            businessContext,
            cc.isUSA,
          );
          setRows(prev => {
            const next = [...prev];
            slice.forEach((g, k) => {
              const s = results[k];
              if (!s) return;
              for (const { i } of g.rows) {
              const base = next[i];
              const unsure = s.confidence === 'low';
              if (s.type === 'transfer') {
                // Not real income/expense — exclude from profit & VAT.
                // Honor the AI's transfer sub-key (loan payment vs other), but
                // only if it's a real transfer category; otherwise fall back.
                const cat = (TRANSFER_CATEGORIES as readonly string[]).includes(s.category)
                  ? s.category : 'ekki_rekstur';
                next[i] = { ...base, type: 'transfer', category: cat, vatRate: 0, matchedRule: undefined, needsReview: unsure };
              } else if (s.type !== base.type) {
                // THE BANK DECIDES THE DIRECTION, NOT THE MODEL. The statement
                // already says whether money came in or went out; a minus sign is
                // not a matter of opinion. Left unguarded, the model turned a
                // petrol station — "OLIS ESJUB AKR", money OUT — into sala_vara
                // INCOME on seven rows, which inflates both turnover and the VAT
                // payable on it. Marking something a "transfer" is different and
                // still allowed: that reclassifies the row without flipping it.
                // So keep the bank's direction, drop the category that belonged to
                // the wrong side, and put the row in front of the owner.
                next[i] = { ...base, matchedRule: undefined, needsReview: true };
              } else {
                next[i] = {
                  ...base,
                  category: allCategories.includes(s.category) ? s.category : base.category,
                  vatRate: validVats.includes(s.vatRate) ? s.vatRate : base.vatRate,
                  matchedRule: undefined,
                  needsReview: unsure,
                };
              }
              }
            });
            return next;
          });
        } catch (e) {
          // One bad batch must not sink a 6000-row import, so we keep going —
          // but silence is worse. Tapping the button, waiting, and getting
          // nothing back reads as a broken app; it is usually an expired session
          // (the endpoint is signed-in only) or a dropped connection.
          failed++;
          lastError = e instanceof Error ? e.message : String(e);
        }
        processed += slice.reduce((n, g) => n + g.rows.length, 0);
        setAiProgress(processed);
      }
      if (failed > 0) {
        const done = merchants.length - failed * BATCH;
        setError(lang === 'is'
          ? (done > 0
              ? `Náði ekki að flokka allt — ${failed} ${isPlural(failed, 'lota', 'lotur')} mistókst. Farðu yfir þær sem eftir standa eða reyndu aftur. (${lastError})`
              : `Náði ekki að flokka. Ertu örugglega skráð/ur inn? (${lastError})`)
          : (done > 0
              ? `Could not sort everything — ${failed} ${failed === 1 ? 'batch' : 'batches'} failed. Review what is left, or try again. (${lastError})`
              : `Could not sort. Are you signed in? (${lastError})`));
      }
    } finally {
      setAiLoading(false);
    }
  }

  async function handleParsedGrid(raw: string[][]) {
    if (raw.length < 2) { setError(lang === 'is' ? 'Skráin lítur út fyrir að vera tóm' : 'File appears to be empty'); return; }
    // US & Canadian bank files date as MM/DD/YYYY; Iceland/EU as DD/MM/YYYY.
    const preferMonthFirst = cc.code === 'US' || cc.code === 'CA';
    let parsed: ParsedRow[];
    if (format === 'auto') {
      setAiLoading(true);
      try {
        const map = await detectImportColumns(raw, lang);
        parsed = parseWithMap(raw, map, preferMonthFirst);
      } catch {
        setAiLoading(false);
        setError(lang === 'is' ? 'AI náði ekki að lesa dálkana — prófaðu annað snið eða CSV/Excel útflutning' : "AI couldn't read the columns — try another format or a CSV/Excel export");
        return;
      }
      setAiLoading(false);
    } else {
      parsed = parseBank(raw, format, preferMonthFirst);
    }
    if (parsed.length === 0) { setError(lang === 'is' ? 'Engar færslur fundust — prófaðu annað snið' : 'No rows parsed — try a different format'); return; }
    setRows(applyRulesToRows(parsed));
    setDone(0);
    setSkippedDupes(0);
  }

  function processFile(file: File) {
    setError('');
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = async ev => {
      try {
        if (isExcel) {
          const XLSX = await import('xlsx'); // lazy-loaded: keeps app startup small
          const wb = XLSX.read(ev.target?.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' });
          handleParsedGrid(raw as string[][]);
        } else {
          const raw = parseCsv(ev.target?.result as string);
          handleParsedGrid(raw);
        }
      } catch { setError(lang === 'is' ? 'Villa við lestur skrárinnar' : 'Error reading file'); }
    };
    if (isExcel) reader.readAsArrayBuffer(file);
    else reader.readAsText(file, 'UTF-8');
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function saveRule(row: ImportRow, pattern: string) {
    if (!pattern.trim()) return;
    const existing = data.categoryRules.find(r => r.pattern.toLowerCase() === pattern.toLowerCase().trim());
    if (existing) {
      dispatch({ type: 'UPDATE_RULE', payload: { ...existing, category: row.category, type: row.type, vatRate: row.vatRate } });
    } else {
      const rule: CategoryRule = {
        id: `rule_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
        pattern: pattern.trim(), category: row.category, type: row.type,
        vatRate: row.vatRate, useCount: 0,
        createdAt: new Date().toISOString().split('T')[0],
      };
      dispatch({ type: 'ADD_RULE', payload: rule });
    }
    setRows(prev => prev.map(r => r === row ? { ...r, learnOpen: false } : r));
  }

  function handleImport() {
    setImporting(true);
    const selected = rows.filter(r => r.selected);
    // Stamp imports in the company's own currency, not a hardcoded ISK — otherwise a
    // US ($) or Canadian (CAD) bank file gets read as krónur and shown ~130× too small.
    // eurToIskRate is the "→ ISK" multiplier the reports normalise with: 1 for an ISK
    // company, else how many ISK one unit of the company currency is worth.
    const cur = (data.settings.defaultCurrency || 'ISK') as Transaction['currency'];
    const rate = cur === 'ISK' ? 1 : ((data.settings.exchangeRates as unknown as Record<string, number>)[cur] ?? 1);
    const ruleHits: Record<string, number> = {};

    // De-duplicate against existing transactions (and within this batch), so
    // re-importing an overlapping file is safe.
    //
    // The key USED to be date|amount|description, which quietly ate real
    // transactions: two coffees at the same place on the same day for the same
    // price is an ordinary thing to do, and the second one vanished. On a
    // 188-row test import two rows disappeared for exactly that reason and the
    // screen just said 186 with no explanation. The bank already hands us a
    // unique receipt number per movement, so include it — a re-import of the
    // same file still carries the same numbers and still dedupes correctly.
    const keyFor = (date: string, amount: number, desc: string, ref?: string) =>
      `${date}|${Math.round(amount)}|${desc}|${ref ?? ''}`;
    const seen = new Set(data.transactions.map(tx => keyFor(tx.date, tx.amount, tx.description, tx.reference)));
    const newTxs: Transaction[] = [];
    let skipped = 0;
    selected.forEach(r => {
      const key = keyFor(r.date, r.amount, r.description, r.reference);
      if (seen.has(key)) { skipped++; return; }
      seen.add(key);
      newTxs.push({
        id: newId(), date: r.date, description: r.description,
        category: r.category, type: r.type, amount: r.amount,
        currency: cur, eurToIskRate: rate, vatRate: r.vatRate,
        reference: r.reference, invoiceId: r.invoiceId,
      });
      if (r.matchedRule) ruleHits[r.matchedRule] = (ruleHits[r.matchedRule] ?? 0) + 1;
    });

    if (newTxs.length > 0) dispatch({ type: 'ADD_TRANSACTIONS', payload: newTxs });
    // bump use counts for matched rules
    Object.entries(ruleHits).forEach(([ruleId, count]) => {
      const rule = data.categoryRules.find(r => r.id === ruleId);
      if (rule) dispatch({ type: 'UPDATE_RULE', payload: { ...rule, useCount: rule.useCount + count, lastUsed: new Date().toISOString().split('T')[0] } });
    });
    setDone(newTxs.length);
    setSkippedDupes(skipped);
    // React to what just came in, instead of ending on a green tick.
    setImported(newTxs);
    setTaught({});
    setKeyed({});
    setFindings(newTxs.length
      ? reviewImport(newTxs, [...data.transactions, ...newTxs], data.accounts ?? [], data.settings.taxAuthority)
      : []);
    setRows([]);
    setImporting(false);
    if (fileRef.current) fileRef.current.value = '';
  }

  // ONE TAP TO TEACH THE BOOKS WHO SOMEBODY IS.
  // Naming a new party used to mean three separate jobs — a rule in Flokkunarreglur,
  // a key in Færslur, and telling the AI — so in practice nobody did any of them and
  // the same party arrived unkeyed every month. This does all three at once.
  type Role = 'tenant' | 'supplier' | 'owner' | 'lender';
  function findKey(role: Role, party = '') {
    const acc = (data.accounts ?? []).filter(a => a.isActive);
    const txt = (a: typeof acc[number]) => `${a.number} ${a.name} ${a.nameEn || ''}`.toLowerCase();
    if (role === 'tenant') return acc.find(a => a.type === 'revenue' && (a.number === '6000' || /leig|rent/.test(txt(a))));
    if (role === 'owner') return acc.find(a => a.type === 'liability' && /eigand|owner/.test(txt(a)));
    if (role === 'lender') {
      // Only a key that names THIS lender counts. The generic "Langtímalán" is a
      // catch-all, and putting a second lender on it makes both loans impossible to
      // reconcile against their own payment schedules afterwards — every lender
      // gets its own key instead (ensureKey creates it).
      const who = party.trim().toLowerCase();
      return acc.find(a => a.type === 'liability' && who && txt(a).includes(who));
    }
    return undefined;
  }
  // A brand-new set of books has NO owner account and NO rent-income key — neither
  // is in DEFAULT_ACCOUNTS — and a first-time user has no loan keys either. Until
  // now the app worked out exactly which key was missing and then told the owner to
  // go and pick it in Transactions, which is the one thing it is told never to do:
  // it dead-ends the very tap that was supposed to teach it. So make the key here,
  // in the same tap, and say so.
  function nextFreeNumber(from: string) {
    const taken = new Set((data.accounts ?? []).map(a => a.number));
    let n = Number(from);
    while (taken.has(String(n))) n += 10;
    return String(n);
  }

  function ensureKey(role: Role, party: string): { key?: Account; created: boolean } {
    const found = findKey(role, party);
    if (found) return { key: found, created: false };
    // A supplier is a running cost — it belongs in the P&L, not on a balance key.
    if (role === 'supplier') return { created: false };
    const spec = role === 'owner'
      ? { number: nextFreeNumber('2420'), name: 'Viðskiptareikningur eiganda',
          nameEn: "Owner's current account", type: 'liability' as const }
      : role === 'tenant'
      ? { number: nextFreeNumber('3300'), name: 'Húsaleigutekjur',
          nameEn: 'Rental income', type: 'revenue' as const }
      // Every lender needs its OWN key: two loans sharing one key can never be
      // reconciled against their schedules afterwards.
      : { number: nextFreeNumber('2310'), name: `Lán — ${party}`,
          nameEn: `Loan — ${party}`, type: 'liability' as const };
    const key: Account = {
      id: `ac_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...spec, isSystem: false, isActive: true,
    };
    dispatch({ type: 'ADD_ACCOUNT', payload: key });
    return { key, created: true };
  }

  // The review already knows exactly which key this party is normally booked on —
  // it says so in the sentence. Telling the owner to go to Færslur and set it by
  // hand, on 53 rows, is the one thing the assistant is told never to do. One tap
  // applies it.
  function applyKnownKey(title: string, keyNumber: string) {
    const acc = (data.accounts ?? []).find(a => a.number === keyNumber);
    if (!acc) return;
    const rows = imported.filter(t => t.description === title);
    rows.forEach(t => dispatch({ type: 'UPDATE_TRANSACTION', payload: { ...t, accountId: acc.id } }));
    setKeyed(k => ({ ...k, [title]: `${acc.number} ${acc.name}` }));
  }

  function teachParty(party: string, role: Role) {
    const { key, created } = ensureKey(role, party);
    const rows = imported.filter(t => t.description.trim().toLowerCase() === party.trim().toLowerCase());
    rows.forEach(t => {
      const isIn = t.type === 'income' || t.amount > 0;
      const patch: Transaction = { ...t };
      if (key) patch.accountId = key.id;
      if (role === 'tenant') { patch.type = 'income'; patch.category = 'sala_thjonustu'; patch.vatRate = 0; patch.vatExempt = true; }
      if (role === 'supplier') { patch.type = 'expense'; patch.category = 'adrir_rekstrargjold'; }
      if (role === 'owner') { patch.type = 'transfer'; patch.category = isIn ? 'framlag' : 'uttekt'; patch.vatRate = 0; }
      if (role === 'lender') { patch.type = 'transfer'; patch.category = isIn ? 'lan_mottekid' : 'lan_afborgun'; patch.vatRate = 0; }
      dispatch({ type: 'UPDATE_TRANSACTION', payload: patch });
    });
    const cat = role === 'tenant' ? 'sala_thjonustu' : role === 'supplier' ? 'adrir_rekstrargjold'
      : role === 'owner' ? 'uttekt' : 'lan_afborgun';
    const ttype: TransactionType = role === 'tenant' ? 'income' : role === 'supplier' ? 'expense' : 'transfer';
    const existing = data.categoryRules.find(r => r.pattern.toLowerCase() === party.toLowerCase());
    if (existing) dispatch({ type: 'UPDATE_RULE', payload: { ...existing, category: cat, type: ttype, vatRate: 0 } });
    else dispatch({ type: 'ADD_RULE', payload: { id: `rule_${Date.now()}`, pattern: party, category: cat, type: ttype, vatRate: 0, useCount: 0, createdAt: todayISO() } });
    const label = role === 'tenant' ? 'a tenant — rent' : role === 'supplier' ? 'a supplier — a cost'
      : role === 'owner' ? 'the owner himself — draws and contributions' : 'a lender — loan movements';
    const note = `${party} is ${label}${key ? `, booked on key ${key.number}` : ''}.`;
    const mem = (data.aiMemory || '').trim();
    if (!mem.includes(party)) dispatch({ type: 'SET_AI_MEMORY', payload: mem ? `${mem}${String.fromCharCode(10)}${note}` : note });
    const roleIs = { tenant: 'leigjandi', supplier: 'birgir', owner: 'eigandi', lender: 'lánveitandi' }[role];
    const roleEn = { tenant: 'a tenant', supplier: 'a supplier', owner: 'the owner', lender: 'a lender' }[role];
    setTaught(t => ({ ...t, [party]: { role: lang === 'is' ? roleIs : roleEn,
      keyNumber: key?.number, keyName: key?.name, created } }));
  }

  const inp = 'border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500';
  const selectedCount = rows.filter(r => r.selected).length;
  const RENDER_LIMIT = 300; // avoid freezing the page on huge historical imports
  const visibleRows = rows.slice(0, RENDER_LIMIT);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">{t('bankimport')}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{cc.code === 'IS'
            ? (lang === 'is' ? 'Flytja inn Excel eða CSV frá íslensku bönkum' : 'Import Excel or CSV from Icelandic banks')
            : (lang === 'is' ? 'Flytja inn Excel eða CSV frá bankanum þínum' : 'Import Excel or CSV from your bank')}</p>
        </div>
        <button onClick={() => setShowReceipts(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors flex-shrink-0">
          <Receipt className="w-4 h-4" />
          <span className="hidden sm:inline">{lang === 'is' ? 'Tengja kvittanir' : 'Match receipts'}</span>
        </button>
      </div>

      {showReceipts && <ReceiptMatcher onClose={() => setShowReceipts(false)} />}

      {/* Migration Stage 2: opening balances (collapsed by default) */}
      <div className="mb-4"><OpeningBalances /></div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h2 className="text-sm font-semibold text-gray-800 mb-3">{lang === 'is' ? '1. Veldu snið og skrá' : '1. Select format and file'}</h2>
        <div className="flex flex-wrap gap-3 mb-4">
          {((cc.code === 'IS'
            ? ['arion', 'islandsbanki', 'landsbankinn', 'generic', 'auto']
            : ['generic', 'auto']) as BankFormat[]).map(f => (
            <button key={f} type="button" onClick={() => setFormat(f)}
              className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${format === f ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-gray-400'}`}>
              {f === 'arion' ? 'Arion' : f === 'islandsbanki' ? 'Íslandsbanki' : f === 'landsbankinn' ? 'Landsbankinn' : f === 'generic' ? (lang === 'is' ? 'Almennt' : 'Generic') : (lang === 'is' ? '✨ Annað kerfi (AI)' : '✨ Other program (AI)')}
            </button>
          ))}
        </div>

        <label
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={e => { e.preventDefault(); setDragging(false); }}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-8 cursor-pointer transition-colors ${
            dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50/30'
          }`}>
          <Upload className={`w-8 h-8 mb-2 ${dragging ? 'text-blue-500' : 'text-gray-400'}`} />
          <span className="text-sm font-medium text-gray-600">
            {dragging
              ? (lang === 'is' ? 'Slepptu skránni hér' : 'Drop the file here')
              : (lang === 'is' ? 'Dragðu skrá hingað eða smelltu til að velja' : 'Drag a file here or click to select')}
          </span>
          <span className="text-xs text-gray-400 mt-1">.xlsx · .xls · .csv · .txt</span>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={handleFile} />
        </label>

        {error && (
          <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
          </div>
        )}
        {/* Also shown when NOTHING was imported: a re-run of the same file used to
            leave the screen completely silent, which reads as "it did not work". */}
        {(done > 0 || skippedDupes > 0) && (
          <div className={`mt-3 flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${
            done > 0 ? 'text-green-700 bg-green-50' : 'text-amber-800 bg-amber-50'}`}>
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>
              {done} {lang === 'is'
                ? `${isPlural(done, 'færsla', 'færslur')} ${isPlural(done, 'flutt', 'fluttar')} inn`
                : `${done === 1 ? 'transaction' : 'transactions'} imported`}
              {skippedDupes > 0 && (lang === 'is'
                ? ` · ${skippedDupes} ${rowsWord(skippedDupes, lang)} ${isPlural(skippedDupes, 'var', 'voru')} þegar í bókhaldinu og ${isPlural(skippedDupes, 'kom', 'komu')} ekki aftur inn`
                : ` · ${skippedDupes} ${rowsWord(skippedDupes, lang)} ${skippedDupes === 1 ? 'was' : 'were'} already in the books and ${skippedDupes === 1 ? 'was' : 'were'} not imported again`)}
            </span>
          </div>
        )}

        {done > 0 && findings.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-900 mb-2">
              <Bot className="w-4 h-4 flex-shrink-0" />
              {lang === 'is' ? 'Ég leit yfir það sem kom inn' : 'I looked over what came in'}
            </div>
            <ul className="space-y-1.5 text-xs text-amber-900">
              {findings.map((f, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-amber-500">•</span>
                  <span>
                    {f.kind === 'tax' && (lang === 'is'
                      ? <><b>{f.rows} {isPlural(f.rows, 'greiðsla', 'greiðslur')} til innheimtumanns</b> ({fmt(f.amount)}) bókaðist sem kostnaður. Greiðsla á skatti er ekki rekstrarkostnaður — hún lækkar skuldina. Settu hana á skuldalykilinn.</>
                      : <><b>{f.rows} {f.rows === 1 ? 'payment' : 'payments'} to the tax authority</b> ({fmt(f.amount)}) landed as a cost. Paying tax is not an expense — it settles a debt. Put these on the liability key.</>)}
                    {f.kind === 'keyed-elsewhere' && (keyed[f.title]
                      ? (lang === 'is'
                          ? <><b>{f.title}</b> — {f.rows} {rowsWord(f.rows, lang)} settar á lykil <b>{keyed[f.title]}</b>.</>
                          : <><b>{f.title}</b> — {f.rows} {rowsWord(f.rows, lang)} put on key <b>{keyed[f.title]}</b>.</>)
                      : <>
                          {lang === 'is'
                            ? <><b>{f.title}</b> — {f.rows} {rowsWord(f.rows, lang)} ({fmt(f.amount)}) án lykils, en þessi aðili er annars bókaður á lykil <b>{f.key}</b>.</>
                            : <><b>{f.title}</b> — {f.rows} {rowsWord(f.rows, lang)} ({fmt(f.amount)}) with no key, but this party is otherwise booked on key <b>{f.key}</b>.</>}
                          <span className="flex flex-wrap gap-1.5 mt-1.5">
                            <button onClick={() => applyKnownKey(f.title, f.key || '')}
                              className="px-2 py-1 rounded-md bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 text-[11px] font-medium">
                              {lang === 'is' ? `Setja á ${f.key}` : `Put on ${f.key}`}
                            </button>
                          </span>
                        </>)}
                    {f.kind === 'new-party' && (taught[f.title]
                      ? (lang === 'is'
                          ? <><b>{f.title}</b> — skráð sem <b>{taught[f.title].role}</b>. Ég man þetta og flokka hann sjálfkrafa næst
                              {taught[f.title].keyNumber
                                ? <> og setti færslurnar á lykil <b>{taught[f.title].keyNumber} {taught[f.title].keyName}</b>
                                    {taught[f.title].created ? <>, sem ég bjó til í leiðinni</> : null}.</>
                                : <>.</>}</>
                          : <><b>{f.title}</b> — saved as <b>{taught[f.title].role}</b>. I will remember and categorise it myself next time
                              {taught[f.title].keyNumber
                                ? <> and put the rows on key <b>{taught[f.title].keyNumber} {taught[f.title].keyName}</b>
                                    {taught[f.title].created ? <>, which I created for you</> : null}.</>
                                : <>.</>}</>)
                      : <>
                          {lang === 'is'
                            ? <>Nýr aðili: <b>{f.title}</b> — {f.rows} {rowsWord(f.rows, lang)} ({fmt(f.amount)}). Hver er þetta?</>
                            : <>New party: <b>{f.title}</b> — {f.rows} {rowsWord(f.rows, lang)} ({fmt(f.amount)}). Who is this?</>}
                          <span className="flex flex-wrap gap-1.5 mt-1.5">
                            {([['tenant', lang === 'is' ? 'Leigjandi' : 'Tenant'],
                               ['supplier', lang === 'is' ? 'Birgir' : 'Supplier'],
                               ['owner', lang === 'is' ? 'Ég sjálfur' : 'Me'],
                               ['lender', lang === 'is' ? 'Lánveitandi' : 'Lender']] as [Role, string][])
                              .map(([role, txt]) => (
                                <button key={role} onClick={() => teachParty(f.title, role)}
                                  className="px-2 py-1 rounded-md bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 text-[11px] font-medium">
                                  {txt}
                                </button>
                              ))}
                          </span>
                        </>)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-amber-700 mt-2">
              {lang === 'is'
                ? 'Svaraðu hér að ofan og ég set lyklana sjálfur. Ef eitthvað er óljóst, spurðu mig í spjallinu — þú þarft ekki að leita að neinu.'
                : 'Answer above and I will set the keys myself. If anything is unclear, ask me in the chat — you should not have to go looking for it.'}
            </p>
          </div>
        )}

        <div className="mt-3 bg-gray-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
          <p className="font-semibold">{lang === 'is' ? 'Dálkareglur (Excel eða CSV):' : 'Column rules (Excel or CSV):'}</p>
          {cc.code === 'IS' && <>
            <p>Arion: Dagsetning, Upphæð, Mynt, Skýring … (Excel-útflutningur úr netbanka)</p>
            <p>Íslandsbanki: Dagsetning, Lýsing, Tilvísun, Innborgun, Útborgun</p>
            <p>Landsbankinn: Dagsetning, Lýsing, Upphæð</p>
          </>}
          <p>{lang === 'is' ? 'Almennt' : 'Generic'}: {lang === 'is' ? 'Dagsetning, Lýsing, Upphæð' : 'Date, Description, Amount'}</p>
          <p className="text-gray-400 pt-1">{lang === 'is' ? 'Fyrirsagnarlínur efst eru hunsaðar sjálfkrafa.' : 'Header/metadata rows at the top are skipped automatically.'}</p>
        </div>
      </div>

      {rows.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-800">{lang === 'is' ? '2. Yfirfarðu og veldu' : '2. Review and select'}</h2>
              <p className="text-xs text-gray-500">{selectedCount}/{rows.length} {lang === 'is' ? isPlural(selectedCount, 'valin', 'valdar') : 'selected'}</p>
            </div>
            <div className="flex gap-2 items-center">
              <button onClick={aiCategorizeAll} disabled={aiLoading}
                className="flex items-center gap-1.5 text-xs border border-purple-300 bg-purple-50 text-purple-700 px-2.5 py-1.5 rounded-lg hover:bg-purple-100 disabled:opacity-50 font-medium">
                {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Bot className="w-3.5 h-3.5" />}
                {aiLoading
                  ? (lang === 'is' ? `AI flokkar… ${aiProgress}/${aiTotal}` : `AI sorting… ${aiProgress}/${aiTotal}`)
                  : (lang === 'is' ? 'Láta AI flokka' : 'Let AI sort these')}
              </button>
              <button onClick={() => setRows(r => r.map(row => ({ ...row, selected: true })))}
                className="text-xs text-blue-600 hover:underline">{lang === 'is' ? 'Velja allt' : 'Select all'}</button>
              <span className="text-gray-300">|</span>
              <button onClick={() => setRows(r => r.map(row => ({ ...row, selected: false })))}
                className="text-xs text-gray-500 hover:underline">{lang === 'is' ? 'Hætta við allt' : 'Deselect all'}</button>
            </div>
          </div>
          {/* Auto-match summary */}
          {rows.filter(r => r.matchedRule).length > 0 && (
            <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center gap-2 text-xs text-blue-700">
              <Zap className="w-3.5 h-3.5 flex-shrink-0" />
              {rows.filter(r => r.matchedRule).length} {lang === 'is' ? 'færslur flokkaðar sjálfvirkt með reglum' : 'transactions auto-categorized by rules'}
            </div>
          )}
          {/* Needs-review summary: AI was unsure on these — owner should glance over them */}
          {rows.filter(r => r.needsReview).length > 0 && (
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2 text-xs text-amber-800">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {rows.filter(r => r.needsReview).length} {lang === 'is'
                ? 'færslur sem AI var ekki viss um — kíktu á þær áður en þú flytur inn.'
                : 'rows the AI was unsure about — please check them before importing.'}
            </div>
          )}
          {/* Large-import notice: only the first rows are shown, but all are imported */}
          {rows.length > RENDER_LIMIT && (
            <div className="px-4 py-2 bg-amber-50 border-b border-amber-100 flex items-center gap-2 text-xs text-amber-800">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              {lang === 'is'
                ? `Sýni fyrstu ${RENDER_LIMIT} af ${rows.length} færslum — allar valdar færslur verða fluttar inn.`
                : `Showing the first ${RENDER_LIMIT} of ${rows.length} rows — all selected rows will still be imported.`}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="px-3 py-2 w-8"></th>
                  <th className="px-2 py-2 text-left text-gray-500">{t('date')}</th>
                  <th className="px-2 py-2 text-left text-gray-500">{t('description')}</th>
                  <th className="px-2 py-2 text-right text-gray-500">{lang === 'is' ? 'Upphæð' : 'Amount'}</th>
                  <th className="px-2 py-2 text-left text-gray-500">{t('type')}</th>
                  <th className="px-2 py-2 text-left text-gray-500">{t('category')}</th>
                  <th className="px-2 py-2 text-left text-gray-500">{cc.vatTerm}%</th>
                  <th className="px-2 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {visibleRows.map((row, i) => (
                  <>
                    <tr key={i} className={`${!row.selected ? 'opacity-40' : ''} ${row.needsReview ? 'bg-amber-50/60' : ''} hover:bg-gray-50/50`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={row.selected}
                          onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, selected: e.target.checked } : r))}
                          className="w-4 h-4 rounded" />
                      </td>
                      <td className="px-2 py-2 text-gray-600 whitespace-nowrap">{row.date}</td>
                      <td className="px-2 py-2 max-w-[180px]">
                        <div className="truncate text-gray-800">{row.description}</div>
                        {row.matchedRule && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <Zap className="w-2.5 h-2.5 text-blue-500" />
                            <span className="text-blue-500 font-medium">{lang === 'is' ? 'Sjálfvirkt' : 'Auto'}</span>
                          </div>
                        )}
                        {row.learned && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <BookOpen className="w-2.5 h-2.5 text-purple-500" />
                            <span className="text-purple-600 font-medium">{lang === 'is' ? 'Lært af bókhaldi' : 'From your books'}</span>
                          </div>
                        )}
                        {row.matchedInvoice && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <FileText className="w-2.5 h-2.5 text-blue-500" />
                            <span className="text-blue-600 font-medium">{lang === 'is' ? `VSK af reikningi #${row.matchedInvoice}` : `VAT from invoice #${row.matchedInvoice}`}</span>
                          </div>
                        )}
                        {row.needsReview && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <AlertCircle className="w-2.5 h-2.5 text-amber-500" />
                            <span className="text-amber-600 font-medium">{lang === 'is' ? 'Skoða' : 'Check this'}</span>
                          </div>
                        )}
                      </td>
                      <td className={`px-2 py-2 text-right font-mono font-semibold ${row.type === 'transfer' ? 'text-gray-500' : row.type === 'income' ? 'text-green-700' : 'text-red-700'}`}>
                        {row.type === 'transfer' ? '±' : row.type === 'income' ? '+' : '-'}{Math.round(row.amount).toLocaleString()}
                      </td>
                      <td className="px-2 py-2">
                        <select value={row.type} className={inp}
                          onChange={e => {
                            const type = e.target.value as TransactionType;
                            const defaultCat = type === 'income' ? 'sala_thjonustu' : type === 'expense' ? 'adrir_rekstrargjold' : 'ekki_rekstur';
                            setLearnPattern(row.description.split(/\s+/).slice(0, 2).join(' '));
                            setRows(prev => prev.map((r, j) => j === i
                              ? { ...r, type, category: defaultCat, vatRate: type === 'transfer' ? 0 : r.vatRate, matchedRule: undefined, learned: false, needsReview: false, learnOpen: true, invoiceId: undefined, matchedInvoice: undefined }
                              : { ...r, learnOpen: false }));
                          }}>
                          <option value="income">{t('income')}</option>
                          <option value="expense">{t('expense')}</option>
                          <option value="transfer">{t('transfer')}</option>
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <select value={row.category} className={inp}
                          onChange={e => {
                            const category = e.target.value;
                            setLearnPattern(row.description.split(/\s+/).slice(0, 2).join(' '));
                            setRows(prev => prev.map((r, j) => j === i
                              ? { ...r, category, matchedRule: undefined, learned: false, needsReview: false, learnOpen: true, invoiceId: undefined, matchedInvoice: undefined }
                              : { ...r, learnOpen: false }));
                          }}>
                          {(row.type === 'income'
                            ? ['sala_vara','sala_thjonustu','fjarmagns_tekjur','adrar_tekjur']
                            : row.type === 'transfer'
                            ? TRANSFER_CATEGORIES
                            : EXPENSE_CATEGORIES
                          ).map(c => <option key={c} value={c}>{t(c as never)}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <select value={row.vatRate} className={inp}
                          onChange={e => setRows(prev => prev.map((r, j) => j === i ? { ...r, vatRate: parseFloat(e.target.value), invoiceId: undefined, matchedInvoice: undefined } : r))}>
                          {(cc.isUSA ? [data.settings.salesTaxRate, 0] : cc.vatRates)
                            .filter((r, i, arr) => arr.indexOf(r) === i)
                            .map(r => <option key={r} value={r}>{r}%</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <button
                          title={lang === 'is' ? 'Vista sem reglu' : 'Save as rule'}
                          onClick={() => {
                            const keyword = row.description.split(/\s+/).slice(0, 2).join(' ');
                            setLearnPattern(keyword);
                            setRows(prev => prev.map((r, j) => j === i ? { ...r, learnOpen: !r.learnOpen } : r));
                          }}
                          className={`p-1 rounded hover:text-blue-600 ${row.learnOpen ? 'text-blue-600' : 'text-gray-400'}`}>
                          <BookOpen className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                    {row.learnOpen && (
                      <tr key={`learn-${i}`} className="bg-blue-50">
                        <td colSpan={8} className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Zap className="w-3.5 h-3.5 text-blue-600 flex-shrink-0" />
                            <span className="text-xs font-medium text-blue-800">
                              {lang === 'is' ? 'Muna þetta næst? Regla fyrir:' : 'Remember this next time? Rule for:'}
                            </span>
                            <input
                              className="flex-1 border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white max-w-[200px]"
                              value={learnPattern}
                              onChange={e => setLearnPattern(e.target.value)}
                              placeholder={lang === 'is' ? 'Leitarorð...' : 'Keyword...'}
                              autoFocus
                            />
                            <button
                              onClick={() => saveRule(row, learnPattern)}
                              disabled={!learnPattern.trim()}
                              className="bg-blue-600 text-white px-3 py-1 rounded text-xs disabled:opacity-40 font-medium">
                              {lang === 'is' ? 'Vista' : 'Save'}
                            </button>
                            <button
                              onClick={() => setRows(prev => prev.map((r, j) => j === i ? { ...r, learnOpen: false } : r))}
                              className="text-gray-400 hover:text-gray-600 p-1">
                              <X className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-xs text-blue-600 ml-1">→ {t(row.category as never)} ({row.vatRate}%)</span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
            <button onClick={() => { setRows([]); if (fileRef.current) fileRef.current.value = ''; }}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
              <X className="w-4 h-4" />{lang === 'is' ? 'Hætta við' : 'Cancel'}
            </button>
            <button onClick={handleImport} disabled={selectedCount === 0 || importing}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40">
              <Check className="w-4 h-4" />
              {lang === 'is'
                ? `Flytja inn ${selectedCount} ${isPlural(selectedCount, 'færslu', 'færslur')}`
                : `Import ${selectedCount} ${selectedCount === 1 ? 'transaction' : 'transactions'}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
