import { AppData, Transaction } from '../types';
import { calcProfitLoss, calcVATSummary, filterByYear, accountBalanceByYear } from './calculations';

const CLAUDE_URL = '/api/claude';
const CLAUDE_STREAM_URL = '/api/claude-stream';

// `content` is what the user sees in the thread (their words plus a 📎 chip per
// file). `api` is what the model actually gets — the same message with the real
// file data attached. Keeping it on the message means an uploaded bank statement
// stays readable for the WHOLE conversation, not just the turn it was sent on.
// It is stripped before the chat is saved, so big files never bloat the synced blob.
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  api?: string | ContentBlock[];
}

// A single message sent to the model may carry rich content blocks — text plus
// images (photos of documents) and PDFs — not just a plain string.
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'document'; source: { type: 'base64'; media_type: string; data: string } };

export interface ApiMessage { role: 'user' | 'assistant'; content: string | ContentBlock[]; }

async function apiPost(body: object): Promise<Response> {
  return fetch(CLAUDE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function callClaude(
  system: string,
  messages: ChatMessage[],
  model = 'claude-haiku-4-5-20251001',
  maxTokens = 1024,
): Promise<string> {
  const res = await apiPost({ model, max_tokens: maxTokens, system, messages });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `API error ${res.status}`);
  }
  const data = await res.json() as { content: Array<{ text: string }> };
  return data.content[0].text;
}

export interface ExtractedProduct {
  name: string;
  sku: string;
  category: string;
  unit: string;
  costPrice: number;
  vatRate: number;
}

// Read a supplier price list (spreadsheet text, PDF, or photo) and return a
// clean list of products for stock import. The caller adds the sell price /
// markup and lets the user review before anything is saved.
export async function extractPricelist(
  input: { text?: string; image?: { base64: string; mediaType: string }; pdf?: string },
  defaultVat: number,
): Promise<ExtractedProduct[]> {
  const system = `You extract a supplier PRICE LIST into structured data for a contractor's stock/inventory system.
Return ONLY a JSON array — one object per product:
[{"name":string,"sku":string,"category":string,"unit":string,"costPrice":number,"vatRate":number}]
Rules:
- name: the product name/description (keep size/spec, e.g. "Timber 45x95 C24").
- sku: the supplier/product code if the list has one, else "".
- category: a short group/section name if the list is grouped, else "".
- unit: the selling unit — e.g. lm, m, m2, pcs, kg, box. If unknown use "pcs".
- costPrice: the price as a PLAIN number — no currency symbol, no thousands separators (e.g. 1067 not "1.067 kr").
- vatRate: ${defaultVat} unless the list clearly states a different rate for a line.
- Read EVERY product row. Do NOT invent products. If a price is unreadable, skip that row.
No prose, no code fences — just the JSON array.`;

  const blocks: ContentBlock[] = [];
  if (input.text) blocks.push({ type: 'text', text: 'PRICE LIST (text):\n\n' + input.text });
  if (input.image) blocks.push({ type: 'image', source: { type: 'base64', media_type: input.image.mediaType, data: input.image.base64 } });
  if (input.pdf) blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: input.pdf } });
  blocks.push({ type: 'text', text: 'Extract every product into the JSON array.' });

  const res = await apiPost({ model: 'claude-sonnet-4-6', max_tokens: 8000, system, messages: [{ role: 'user', content: blocks }] });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `API error ${res.status}`);
  }
  const data = await res.json() as { content: Array<{ text: string }> };
  const text = data.content.map(c => c.text).join('');
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('No product data found');
  const raw = JSON.parse(match[0]) as Partial<ExtractedProduct>[];
  return raw
    .filter(r => r && r.name && typeof r.costPrice === 'number' && r.costPrice > 0)
    .map(r => ({
      name: String(r.name).trim(),
      sku: (r.sku ?? '').toString().trim(),
      category: (r.category ?? '').toString().trim(),
      unit: (r.unit ?? 'pcs').toString().trim() || 'pcs',
      costPrice: Math.round(Number(r.costPrice)),
      vatRate: typeof r.vatRate === 'number' ? r.vatRate : defaultVat,
    }));
}

export interface ImportColumnMap {
  headerRows: number;       // leading rows to skip (header/preamble) before data
  date: number;             // column index of the date
  description: number;      // column index of the description/text
  amount: number | null;    // single signed-amount column (null if debit/credit split)
  debit: number | null;     // money-OUT column (null if single amount)
  credit: number | null;    // money-IN column (null if single amount)
  reference: number | null; // reference/number column, if any
}

// Migration: figure out which columns of an export from ANOTHER bookkeeping
// program (any language, any layout) hold the date, description and amount, so
// the rows can be imported as transactions. Column headers can be in Icelandic,
// English or anything else — the AI reads them. Returns 0-based column indices.
export async function detectImportColumns(sampleRows: string[][], lang: string): Promise<ImportColumnMap> {
  const grid = sampleRows.slice(0, 20)
    .map((r, i) => `row ${i}: ${r.map((c, ci) => `[${ci}]${String(c ?? '').trim()}`).join(' | ')}`)
    .join('\n');
  const system = `You map the columns of a transaction export from a bookkeeping/accounting program into a fixed schema so the rows can be imported. The column headers may be in ANY language (Icelandic, English, etc.).
Return ONLY JSON, no prose, no code fences:
{"headerRows":number,"date":number,"description":number,"amount":number|null,"debit":number|null,"credit":number|null,"reference":number|null}
Rules (all column values are 0-based indices into a row):
- headerRows: how many leading rows are header/title/preamble before the real data starts (usually 1).
- date: the column with the transaction date.
- description: the column with the text/description/counterparty. Pick the most descriptive one.
- If there is ONE signed amount column (positive in / negative out): set "amount" to its index, and debit=null, credit=null.
- If money-in and money-out are SEPARATE columns: set "credit"=money-in index, "debit"=money-out index, and amount=null.
- reference: an invoice/voucher/reference number column if present, else null.
- Never guess a column that isn't there — use null. Base everything on the sample rows.`;
  const user = `Language hint: ${lang === 'is' ? 'Icelandic' : 'English'}\nSAMPLE ROWS (index-tagged cells):\n${grid}\n\nReturn the JSON mapping.`;
  const text = await callClaude(system, [{ role: 'user', content: user }], 'claude-sonnet-4-6', 400);
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Could not read the columns of that file');
  const m = JSON.parse(match[0]) as Partial<ImportColumnMap>;
  const num = (v: unknown): number | null => (typeof v === 'number' && v >= 0 ? Math.floor(v) : null);
  return {
    headerRows: typeof m.headerRows === 'number' && m.headerRows >= 0 ? Math.floor(m.headerRows) : 1,
    date: num(m.date) ?? 0,
    description: num(m.description) ?? 1,
    amount: num(m.amount),
    debit: num(m.debit),
    credit: num(m.credit),
    reference: num(m.reference),
  };
}

export async function streamClaude(
  system: string,
  messages: ApiMessage[],
  onChunk: (text: string) => void,
  model = 'claude-sonnet-4-6',
  webSearch = false,
): Promise<void> {
  const res = await fetch(CLAUDE_STREAM_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    // Send the system prompt as a cacheable block. It holds the whole financial
    // context (every year's summary + up to 2000 transactions) and is identical
    // across turns in a chat, so prompt caching means the model reads it once and
    // reuses it on every following question — far cheaper and faster than
    // re-ingesting everything each prompt. Cache lives ~5 min; it re-primes
    // automatically if the data changes.
    body: JSON.stringify({
      model, max_tokens: 2048, stream: true, messages,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      // Live web lookup (tax rules/rates/deadlines) when enabled. max_uses caps
      // cost per message; the model only searches when it needs current facts.
      ...(webSearch ? { tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }] } : {}),
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `API error ${res.status}`);
  }
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') return;
      try {
        const parsed = JSON.parse(payload) as { type: string; delta?: { text?: string } };
        if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
          onChunk(parsed.delta.text);
        }
      } catch { /* ignore SSE parse errors */ }
    }
  }
}

const fmtNum = (n: number) => Math.round(n).toLocaleString();

// Full profit & loss summary for a single year, computed with the SAME engine
// the Reports / Annual Accounts screens use, so the AI's figures reconcile exactly.
function yearSummary(data: AppData, year: number): string {
  const txs = filterByYear(data.transactions, year);
  if (txs.length === 0) return '';
  const pl = calcProfitLoss(txs, data.settings.corporateTaxRate);
  const vat = calcVATSummary(txs, data.settings.vatRates);
  const catBreakdown: Record<string, number> = {};
  txs.forEach(tx => { catBreakdown[tx.category] = (catBreakdown[tx.category] ?? 0) + tx.amount; });

  return `── YEAR ${year} (${txs.length} transactions) ──
Total revenue: ${fmtNum(pl.totalRevenue)}
Total operating expenses: ${fmtNum(pl.totalOperatingExpenses)}
Operating profit: ${fmtNum(pl.operatingProfit)}
Financial expenses: ${fmtNum(pl.fjarmagnsgjold)}
Profit before tax: ${fmtNum(pl.profitBeforeTax)}
Income tax (${data.settings.corporateTaxRate}%): ${fmtNum(pl.incomeTax)}
Net result: ${fmtNum(pl.netResult)}
VAT — output: ${fmtNum(vat.totalOutput)} | input: ${fmtNum(vat.totalInput)} | net payable: ${fmtNum(vat.netVAT)}
Category breakdown:
${Object.entries(catBreakdown).map(([c, a]) => `  ${c}: ${fmtNum(a)}`).join('\n')}`;
}

// Month-by-month totals for every year with data (Jan→Dec), so the AI can look
// at any single month or spot seasonal patterns — not just whole-year figures.
function monthlyBreakdown(data: AppData, year?: number): string {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const years = year != null ? [year]
    : [...new Set(data.transactions.map(t => new Date(t.date).getFullYear()))].sort((a, b) => b - a);
  const lines: string[] = [];
  for (const y of years) {
    const inc = new Array(12).fill(0), exp = new Array(12).fill(0);
    for (const tx of data.transactions) {
      const d = new Date(tx.date);
      if (d.getFullYear() !== y) continue;
      const m = d.getMonth();
      if (tx.type === 'income') inc[m] += tx.amount;
      else if (tx.type === 'expense') exp[m] += tx.amount;
    }
    const cells = MONTHS
      .map((mn, i) => (inc[i] || exp[i]) ? `${mn} +${fmtNum(inc[i])}/-${fmtNum(exp[i])}` : null)
      .filter(Boolean).join('  ');
    lines.push(`${y}: ${cells || '(no activity)'}`);
  }
  return lines.join('\n') || '  No transactions recorded yet.';
}

// Index of every counterparty (grouped by description) across ALL years, with
// per-year in/out totals. This is what lets the AI answer "how much from/to X
// over time", "find payments to a specific person/supplier", and compare years,
// without needing every raw row. Bounded to the biggest parties by volume.
function counterpartyIndex(data: AppData, year?: number): string {
  interface Party { inc: number; exp: number; count: number; years: Map<number, { inc: number; exp: number }>; }
  const map = new Map<string, Party>();
  const source = year != null
    ? data.transactions.filter(tx => new Date(tx.date).getFullYear() === year)
    : data.transactions;
  for (const tx of source) {
    const key = (tx.description || '(no description)').trim() || '(no description)';
    let e = map.get(key);
    if (!e) { e = { inc: 0, exp: 0, count: 0, years: new Map() }; map.set(key, e); }
    const y = new Date(tx.date).getFullYear();
    let ye = e.years.get(y);
    if (!ye) { ye = { inc: 0, exp: 0 }; e.years.set(y, ye); }
    if (tx.type === 'income') { e.inc += tx.amount; ye.inc += tx.amount; }
    else if (tx.type === 'expense') { e.exp += tx.amount; ye.exp += tx.amount; }
    e.count++;
  }
  const parties = [...map.entries()]
    .map(([name, e]) => ({ name, e, vol: e.inc + e.exp }))
    .sort((a, b) => b.vol - a.vol)
    .slice(0, 150);
  return parties.map(({ name, e }) => {
    const yrs = [...e.years.entries()].sort((a, b) => a[0] - b[0])
      .map(([y, ye]) => `${y}:${ye.inc ? '+' + fmtNum(ye.inc) : ''}${ye.exp ? '-' + fmtNum(ye.exp) : ''}`)
      .join(' ');
    return `  ${name} | n=${e.count} | in ${fmtNum(e.inc)} / out ${fmtNum(e.exp)} | ${yrs}`;
  }).join('\n') || '  (none)';
}

// `year` = the year the owner is working on. When set, the AI is given EVERY
// transaction of that year instead of a newest-first sweep across all history.
// This matters: the all-years sweep fills from the newest backwards until it hits
// the character budget, so the rows it drops are the OLDEST — which is precisely
// the year someone closing old books is looking at. The AI then had year totals
// but not the lines behind them, and sounded fully informed while missing them.
// The exact list of transactions the AI is shown, in the exact order it is shown
// them — a row's REF (#1, #2, ...) is its 1-based position here. Both sides must
// agree: buildContext() numbers the rows from this, and applyFix() looks a ref
// back up through it. Keep them using this one function or refs drift.
export function txPool(transactions: Transaction[], year?: number): Transaction[] {
  // Working on one year: give every row of that year, oldest first, the way a
  // ledger reads. Otherwise fall back to the newest-first sweep across all years.
  return year != null
    ? transactions
        .filter(tx => new Date(tx.date).getFullYear() === year)
        .sort((a, b) => a.date.localeCompare(b.date))
    : [...transactions].sort((a, b) => b.date.localeCompare(a.date));
}

export function buildContext(data: AppData, lang: string, year?: number): string {
  // Every year that actually has transactions, newest first — so the AI can
  // analyse and compare any year (e.g. 2024 vs 2025), not just the fiscal year.
  const years = [...new Set(data.transactions.map(tx => new Date(tx.date).getFullYear()))]
    .sort((a, b) => b - a);

  // Working on one year: summarise ONLY that year. Leaving every year's totals in
  // meant a question like "find the Húsasmiðjan expenses" was answered from all
  // years at once, ignoring the year being worked on.
  const perYear = (year != null ? [year] : years)
    .map(y => yearSummary(data, y))
    .filter(Boolean)
    .join('\n\n') || '  No transactions recorded yet.';

  const openInvoices = data.invoices.filter(i => i.type === 'invoice' && (i.status === 'sent' || i.status === 'overdue'));
  // Detailed transaction rows for the chat. The per-year summaries above already
  // cover every year in aggregate; here we include the individual rows so the AI
  // can reference specific transactions. Capped so a huge multi-year history
  // doesn't blow the context window / cost — the chat model (Sonnet) has plenty
  // of room, but we still keep it bounded and newest-first.
  // Bounded two ways so a huge multi-year history can't overflow the model's
  // ~200k-token context (which would fail the request): a max row count
  // (config-driven via settings.aiMaxTransactions, default 12,000 — was 2,000)
  // AND an approximate character budget. Newest-first, so the most recent rows
  // always make it in; older ones stay covered by the summaries above.
  const MAX_TX = data.settings.aiMaxTransactions ?? 12000;
  // Leave headroom under the ~200k-token window for the rest of this prompt AND
  // for anything the owner attaches to the chat (a bank statement can be 60k
  // chars on its own). The old 600k budget filled the window by itself.
  const CHAR_BUDGET = 450_000;

  const pool = txPool(data.transactions, year);

  const txRows: string[] = [];
  let txChars = 0;
  // Key NUMBER per transaction, not the internal id — the number is what the AI
  // is shown in the chart of accounts and what it writes back in a fix.
  const keyNumById = new Map((data.accounts ?? []).map(a => [a.id, a.number]));
  for (let i = 0; i < pool.length; i++) {
    const tx = pool[i];
    if (txRows.length >= MAX_TX) break;
    // The leading #n is the row's REF — how the AI points at this exact
    // transaction in a jobboks-fix block. It is the 1-based position in txPool(),
    // which the app rebuilds identically when applying a fix.
    // The trailing field is the KEY the row is booked on ("-" = none), so the AI
    // can see a wrong or missing key instead of only the keys that exist.
    const key = (tx.accountId && keyNumById.get(tx.accountId)) || '-';
    const row = `  #${i + 1} | ${tx.date} | ${tx.type} | ${tx.category} | ${fmtNum(tx.amount)} | ${tx.description} | ${key}`;
    if (txChars + row.length > CHAR_BUDGET) break;
    txRows.push(row);
    txChars += row.length + 1;
  }
  const dropped = pool.length - txRows.length;
  const txLabel = year != null
    ? (dropped > 0
        // Should not happen for a normal year, but never let it look complete.
        ? `TRANSACTIONS — YEAR ${year} (${txRows.length} of ${pool.length}; ${dropped} did NOT fit. This year is INCOMPLETE — say so, do not draw conclusions from it)`
        : `TRANSACTIONS — YEAR ${year} (all ${txRows.length} — this is EVERY transaction of ${year})`)
    : (dropped > 0
        ? `TRANSACTIONS (most recent ${txRows.length} of ${data.transactions.length} — the ${dropped} OLDEST rows are NOT here, only their summaries above. If asked about individual rows in an older year, say you need that year selected)`
        : `TRANSACTIONS (all ${txRows.length})`);

  // How the owner keys purchases/income — so the AI knows which category things go on.
  const catRules = (data.categoryRules ?? [])
    .slice().sort((a, b) => b.useCount - a.useCount).slice(0, 60)
    .map(r => `  "${r.pattern}" → ${r.category} (${r.type}, VSK ${r.vatRate}%)`)
    .join('\n');

  // The owner's chart of accounts ("Bókhaldslyklar") — the real keys a
  // transaction can be booked onto (tx.accountId). Balance-sheet keys carry a
  // balance forward year to year; revenue/expense keys reset each year.
  const keysList = (data.accounts ?? [])
    .filter(a => a.isActive)
    .slice().sort((a, b) => a.number.localeCompare(b.number))
    .map(a => {
      const isBalance = ['asset', 'liability', 'equity'].includes(a.type);
      const ob = isBalance && a.openingBalance != null && a.openingBalance !== 0
        ? `, opening ${fmtNum(a.openingBalance)}${a.openingYear ? ` @${a.openingYear}` : ''}` : '';
      const en = a.nameEn && a.nameEn !== a.name ? ` / ${a.nameEn}` : '';
      // For balance keys, the closing balance carried into each year (use these
      // exact figures in a year's return, e.g. the loan still owed at year-end).
      const byYear = isBalance ? accountBalanceByYear(a, data.transactions) : [];
      const yearEnd = byYear.length
        ? `\n      year-end: ${byYear.map(r => `${r.year}=${fmtNum(r.closing)}`).join(', ')}` : '';
      return `  ${a.number} ${a.name}${en} [${a.type}${isBalance ? ', balance — carries forward' : ', P&L — resets yearly'}${ob}]${yearEnd}`;
    })
    .join('\n');

  return `${year != null ? `>>> WORKING YEAR: ${year} <<<
The owner is working on ${year} and nothing else. Answer about ${year} unless they
name another year. Every transaction of ${year} is listed below — if something is
not in that list, it is not in the books for ${year}, so say so plainly instead of
guessing at it. For OTHER years you have the summaries only, not the individual
rows: if asked for a specific old row, say the owner needs to switch to that year.

` : ''}COMPANY: ${data.settings.company.name || 'Unknown'}
COUNTRY: ${data.settings.country} | CURRENCY: ${data.settings.defaultCurrency}
FISCAL YEAR (default): ${data.settings.fiscalYear} | CORPORATE TAX RATE: ${data.settings.corporateTaxRate}%
LANGUAGE: ${lang === 'is' ? 'Icelandic' : 'English'}
YEARS WITH DATA: ${years.join(', ') || 'none'}

These per-year totals are calculated by the same engine as the Reports and Annual
Accounts screens, so they reconcile exactly.${year != null
  ? ` EVERYTHING BELOW IS ${year} ONLY. Every figure, party
and month you can see is ${year}. You have NO figures for any other year — if the
owner asks about one, say they need to switch the year rather than answering.`
  : ' Use them when asked about any year.'}

FULL-YEAR FINANCIAL SUMMARIES:
${perYear}

MONTHLY BREAKDOWN — ${year != null ? `${year} only` : 'every year'}, Jan→Dec (income +, expense -):
${monthlyBreakdown(data, year)}

CATEGORISATION RULES — how the owner keys purchases/income (pattern found in a
transaction's description → the key/category it goes on). Use these to answer
"which key does X go on?" and stay consistent with how the books are kept:
${catRules || '  (none set yet — the owner keys transactions manually or via the AI)'}

CHART OF ACCOUNTS / KEYS (Bókhaldslyklar) — the actual keys a transaction can be
booked onto. "balance" keys (asset/liability/equity, e.g. loans/veðskuldabréf)
carry their balance forward year to year from the opening figure; "P&L" keys
(revenue/expense) reset each year. When asked where something should be booked,
name the exact key from this list; remember per-counterparty booking choices via
a jobboks-remember block so they stick:
${keysList || '  (no keys defined yet — see Bókhaldslyklar)'}

COUNTERPARTY INDEX — ${year != null
  ? `every party in ${year} ONLY (grouped by description; n=number of transactions,
then total in / out). These are ${year} figures. If the owner asks about a party,
answer for ${year}. Other years are NOT here — if they want another year, tell them
to switch the year, and do NOT quote figures for it from memory`
  : `every party across ALL years (grouped by description, top by
volume; n=number of transactions, then total in / out, then per-year in/out). Use
this to find or total payments to/from any tenant, supplier or person over time,
and to compare years — it covers every year, not just recent ones`}:
${counterpartyIndex(data, year)}

OPEN INVOICES (${openInvoices.length}):
${openInvoices.map(i => {
    const total = i.lines.reduce((s, l) => s + l.quantity * l.unitPrice * (1 + l.vatRate / 100), 0);
    return `  ${i.number} — ${i.customer.name}: ${fmtNum(total)} (${i.status})`;
  }).join('\n') || '  None'}

${txLabel}:
  ref | date | type | category | amount | description | key   ("-" in the key column means the entry is NOT booked on any key yet)
${txRows.join('\n')}`;
}

export function buildChatSystem(data: AppData, lang: string, year?: number): string {
  return `You are an AI bookkeeping assistant for ${data.settings.company.name || 'this company'}.
You have access to their financial data and can help with:
- Questions about income, expenses, cash flow, and trends
- VAT calculations and tax estimates
- Invoice and quote assistance
- Budget analysis
- Identifying unusual patterns or concerns
- Bookkeeping best practices
- Comparing whole years (e.g. 2024 vs 2025) and preparing year-end financial summaries

You have full-year totals for every year, a MONTH-BY-MONTH breakdown of every year,
and a COUNTERPARTY INDEX covering every party across ALL years. So you CAN look at
any single year Jan→Dec, any month, find or total payments to/from a specific
person or supplier across all years, compare years, and spot long-term patterns —
use the monthly breakdown and counterparty index for this, not just the recent
raw rows. Only the most recent individual rows are listed in full; for older
specific line items, rely on the monthly and counterparty data (and say so if a
single old row isn't individually listed).
When the user asks about a specific year, use that year's summary. When comparing years, reference both.

You can SEARCH THE WEB to find ESSENTIAL BOOKKEEPING INFORMATION you need to book or verify an entry correctly — this is your own tool for getting a booking right, not a general search for the user. Use it to look up public/registry facts such as: a property's official registration number (fasteignanúmer / property ID), a counterparty's tax code or company ID (kennitala / EIN / VAT number), an official company name or address, a bank/IBAN or invoice reference format, or the applicable tax rate/rule/deadline for ${data.settings.country}. Search ONLY when you actually need such a fact to complete or check a booking. NEVER put the company's private financial data into a query. When you use a web result, state the fact and cite the source (e.g. "Heimild: <url>"), and ask the owner to confirm before it's relied on — stay by-the-book.

NEVER INVENT DATA. This is a bookkeeping system — a plausible-sounding wrong figure
is worse than no answer. If a transaction, row or file is not actually in front of
you, say so plainly ("ég sé ekki þessa færslu" / "I can't see that") and say what
you would need. Do not reconstruct rows from memory, do not guess at what a
truncated file contained, and do not present a total you have not actually added up.
If the owner disagrees with you, do NOT simply switch to their answer to be
agreeable: either show the figures that support your position, or say honestly that
you cannot tell from the data you have. Flattery here costs them money.
Never propose DELETING or altering entries unless you can point to the exact rows
and explain why — and remember saved/issued invoices are locked.

FIVE RULES ABOUT NOT SOUNDING SURER THAN YOU ARE. Each exists because you broke it:
1. MARK A GUESS WHERE IT STANDS, NOT AFTERWARDS. You listed keys for the owner's
entries in a clean table — "Fylkir ehf. → 5000 laun", "Sýslumaðurinn → 2300" —
and only mentioned further down that these were "líklegast". By then the table
already read as fact. A guess must be marked IN THE SAME LINE it appears in, or
kept out of a table of facts entirely and put under its own heading ("Þetta veit
ég" / "Þetta er ágiskun"). What you read off the rows and what you inferred from
a name are not the same kind of thing and must never share a column.
2. RE-READ YOUR ANSWER BEFORE YOU SEND IT AND DELETE WHAT YOU DISPROVED. Asked
for duplicate pairs, you listed "#912 / #913" and wrote next to it "nei, önnur
upphæð" — you worked out mid-sentence that it was not a pair and left it in the
list anyway. If you rule something out, remove it. A list the owner has to
re-check is worse than a shorter list he can trust.
3. NEVER INVENT A REASON FOR WHAT YOU CANNOT DO. Asked to correct an entry, you
said booked transactions are "læst í kerfinu". They are not — ordinary entries
are freely editable; only issued invoices lock. You did not have the tool, which
is a different thing, and you made up a rule about the owner's own books to
explain it. Your actual abilities are the blocks described above. If you cannot
do something, say what you CAN do; never explain a limitation with a fact about
the app you have not been told.
4. DO NOT OPEN WITH PRAISE OF THE QUESTION OR AGREEMENT. You began almost every
reply with "Frábær spurning", "Þetta er frábær endurskoðun", "You're right" —
once even while answering the owner asking whether you exist to please him. It
reads as flattery, and flattery from a bookkeeper is a reason to distrust the
figures that follow. Open with the finding or the answer. Warmth belongs in HOW
you explain something, never in an opening compliment.
5. CHECK A FIGURE AGAINST WHAT YOU ALREADY KNOW BEFORE REPORTING IT. You wrote
"6+ milljónir á Fylkir" as a flat fact in a list. But if a row contradicts
THINGS TO ALWAYS REMEMBER — a counterparty you were told is a loan showing up as
an ordinary expense, income booked as a cost, a balance-key figure on a P&L key
— that contradiction IS the finding: lead with it and say it needs the rows
looked at, do not report the number as if it were settled. A surprising figure
is a flag to raise, not a fact to state.

Always respond in ${lang === 'is' ? 'Icelandic' : 'English'}.
Be concise and helpful. Format numbers with the company currency (${data.settings.defaultCurrency}).
When asked about specific transactions, reference the data provided.
${data.aiMemory && data.aiMemory.trim() ? `
THINGS TO ALWAYS REMEMBER (the owner told you these — honour them in every reply):
${data.aiMemory.trim()}
` : ''}
YOU HAVE A LONG-TERM MEMORY for this company. There is a "Memory" tab on this screen holding facts the owner wants kept; when present they appear above under THINGS TO ALWAYS REMEMBER. NEVER tell the user you can't remember things between chats — you can, through this memory.
When the user tells you to remember something, OR a durable fact/rule emerges that will matter in future chats (who a counterparty is — e.g. a tenant vs a loan, a bookkeeping key or categorisation rule, a preference), SAVE it by ending your reply with ONE fenced block tagged jobboks-remember containing ONLY JSON of this shape:
\`\`\`jobboks-remember
{"remember":["Fylkir ehf. is a loan counterparty (A00346), not a tenant"]}
\`\`\`
Reply normally in words first, then add the block; it is saved automatically and the user sees a "Saved to memory" confirmation. Keep each note short and factual, and only emit the block when there is something new worth keeping.
When the user asks for an EXCEL / SPREADSHEET report, or to download / export data as a file, output ONE fenced code block tagged jobboks-excel that contains ONLY JSON of this shape:
\`\`\`jobboks-excel
{"filename":"gjold_2025","sheet":"Gjöld 2025","columns":["Dagsetning","Lýsing","Flokkur","Upphæð"],"rows":[["2025-01-05","Dæmi ehf.","Efniskostnaður",42000]]}
\`\`\`
Put a one-line summary before the block. Use real figures from the data; amounts as plain numbers (no currency symbol or thousands separators). Only emit this block when a file / Excel is explicitly requested.

When the owner asks you to BOOK / record / enter / categorise a transaction (or several) INTO the app, output ONE fenced code block tagged jobboks-book containing ONLY JSON of this shape:
\`\`\`jobboks-book
{"transactions":[{"date":"2026-07-01","description":"Fylkir ehf. — leiga","type":"income","category":"sala_thjonustu","amount":500000,"vatRate":0,"accountNumber":"","interestAmount":0}]}
\`\`\`
Rules: date is YYYY-MM-DD; type is "income" | "expense" | "transfer"; category MUST be one the app already uses (see the transactions, CATEGORISATION RULES and keys above — pick the closest existing one); amount is a plain positive number; vatRate a number; accountNumber is OPTIONAL — the key NUMBER from the chart of accounts to book onto (e.g. "2810" for a loan); interestAmount is OPTIONAL, the interest part of a loan payment. Write a one-line plain-language summary before the block. You are PROPOSING: the owner sees the entries and taps "Book" to apply them into Jobboks — you never need a separate side system. Only emit this block when the owner clearly wants something booked.

When the owner asks you to FIX / correct / change / re-categorise a transaction that is ALREADY in the books, you CAN do it — output ONE fenced code block tagged jobboks-fix containing ONLY JSON of this shape:
\`\`\`jobboks-fix
{"fixes":[{"ref":12,"was":{"date":"2026-07-01","amount":42000},"set":{"accountNumber":"1200"}}]}
\`\`\`
PUTTING THE RIGHT KEY ON AN ENTRY IS THE MAIN USE OF THIS BLOCK. The LAST column of every transaction row is the key it is booked on, and "-" means no key at all. So you can SEE which entries are on the wrong key or on none, and correct them with "accountNumber" — the key NUMBER from the chart of accounts above. When the owner asks about keys ("er þetta á réttum lykli?", "settu réttan lykil", "fix my keys"), go through the rows yourself, say which ones look wrong and why, and propose the corrections in ONE block — do not make the owner name each entry.
Rules: "ref" is the #NUMBER shown at the START of the transaction row in the TRANSACTIONS list above — that is how you point at one exact row, so ALWAYS read the ref off the row you mean. "was" repeats that row's CURRENT date and amount; the app checks them before changing anything and refuses if they no longer match, so never invent them. "set" contains ONLY the fields that should CHANGE — any of date, description, category, type, amount, vatRate, accountNumber, interestAmount; leave out everything that stays the same. The owner sees a "before → after" list and taps "Laga"/"Fix" to apply. You are PROPOSING, exactly like jobboks-book — nothing changes until the owner taps.
You CANNOT delete a transaction: deleting leaves a hole in the books. If a transaction should not exist at all, say so plainly and tell the owner to delete it themselves in the Transactions screen. Never claim you are unable to correct or re-categorise an existing transaction — you are able, via this block.

HOW THIS APP KEEPS THE BOOKS (so your guidance matches what the app actually does):
- KEYS (Bókhaldslyklar / chart of accounts): a transaction can be booked onto a key. "Balance" keys (asset/liability/equity, e.g. a loan / veðskuldabréf) carry a running balance forward year to year from their opening balance; "P&L" keys (revenue/expense) reset each year. The keys and their year-end balances are listed under CHART OF ACCOUNTS / KEYS below — quote those figures for a year's return.
- LOAN PAYMENTS = principal + interest. When a loan payment is booked onto a loan key, the owner enters the interest portion in the "Þar af vextir / of which interest" box: only the PRINCIPAL (amount − interest) reduces the loan, and the INTEREST is recognised as a financial expense (fjármagnsgjöld). When the owner asks how to book a loan payment, tell them to book the whole payment onto the loan key and fill in the interest — do NOT tell them to make two separate entries.
- DEPRECIATION (afskriftir) is a NON-CASH expense. To depreciate an asset, the owner adds an expense with category "Afskriftir" and books it ONTO the fixed-asset key (e.g. 1200 Varanlegir rekstrarfjármunir): it lowers profit and the asset's book value, but does NOT reduce cash. Advise this when asked about depreciation. There is no automatic depreciation schedule — the owner enters the yearly amount themselves (straight-line = cost ÷ useful life); you may help them work out the amount, but the entry is manual.
- YEARS ARE OPEN PERIODS the owner closes manually when satisfied; balances carry forward provisionally in the meantime. ANNUAL ACCOUNTS (Ársreikningur) can be viewed for ANY year and downloaded as PDF or emailed. The income statement is correct per year; the balance-sheet section is still partly manual (per-year carry-forward wiring in progress) — say so if asked for a formal balance sheet.
${data.settings.country === 'IS' ? `- PAYROLL (Laun), ICELAND, uses these company rates: withholding (staðgreiðsla) ${data.settings.taxWithholdingRate}%, persónuafsláttur (personal tax credit) ${fmtNum(data.settings.personalDeductionMonthly)}/month, employee pension ${data.settings.employeePensionRate}%, employer pension ${data.settings.employerPensionRate}%, tryggingagjald (social insurance) ${data.settings.socialInsuranceRate}%. For a monthly salary the correct math is: employee pension = gross × ${data.settings.employeePensionRate}%; TAX BASE = max(0, gross − employee pension − persónuafsláttur); withholding = tax base × ${data.settings.taxWithholdingRate}%; net = gross − employee pension − withholding. Employer cost on top = gross + employer pension + tryggingagjald. Persónuafsláttur is per-employee via their registered tax card (skattkort) — 0% if none (e.g. used on a pension). ALWAYS subtract persónuafsláttur before applying the withholding rate — NEVER apply the tax rate to the full gross. For ACTUAL salary slips, tell the owner to use the Laun (Payroll) screen; your chat figures are estimates.`
: data.settings.country === 'US' ? `- PAYROLL (Laun), US (2026): from the paycheck — Social Security 6.2% (only on wages up to $184,500/yr) + Medicare 1.45% (no cap). Federal income tax and state income tax are each a per-employee % from the worker's W-4 (some states have no income tax → 0%); there is NO persónuafsláttur. Net = gross − Social Security − Medicare − federal − state. Employer pays a matching 6.2% + 1.45% plus FUTA 0.6%. Do NOT use the Icelandic formula. For actual slips tell the owner to use the Laun screen (it stores them); your chat figures are estimates.`
: data.settings.country === 'CA' ? `- PAYROLL (Laun), CANADA (2026): from the paycheck — CPP 5.95% on pensionable pay (gross minus the $3,500/yr basic exemption, up to $74,600/yr) + EI 1.63% (up to $68,900/yr). Federal and provincial income tax are each a per-employee % from the TD1. Net = gross − CPP − EI − federal − provincial. Employer pays matching CPP 5.95% and EI at 1.4× (2.282%). Do NOT use the Icelandic formula. For actual slips tell the owner to use the Laun screen; your chat figures are estimates.`
: `- PAYROLL: the built-in Laun calculator is not localised for ${data.settings.country} (it supports Iceland, US and Canada). Do NOT compute wages with the Icelandic formula. If asked about payroll, look up the correct local rules (web search, cite the source), keep it to guidance, and say the app's payroll calculator isn't localised for their country yet.`}

CURRENT FINANCIAL DATA:
${buildContext(data, lang, year)}`;
}

export async function categorizeBatch(
  rows: Array<{ description: string; amount: number; detectedType: string }>,
  categories: string[],
  vatRates: number[],
): Promise<Array<{ type: 'income' | 'expense' | 'transfer'; category: string; vatRate: number; confidence: 'high' | 'low' }>> {
  const system = `You are a bookkeeping categorization engine. Analyze bank transaction descriptions and categorize them.
Available income/expense categories: ${categories.join(', ')}
Available VAT rates: ${vatRates.join(', ')}%

IMPORTANT — not every inflow is income, and not every outflow is an expense.
If a transaction is NOT real business income or expense, set "type":"transfer". Pick the transfer category:
- "lan_afborgun" → paying down a LOAN or DEBT (installment to a lender, mortgage/bond payment, principal+interest out to a creditor). This keeps loan payments out of profit.
- "ekki_rekstur" → any other non-business movement: transfers between the company's own accounts (e.g. "Millifærsla", to/from savings or FX accounts), loans RECEIVED, owner putting money in or taking money out (owner's draw/capital), buying or selling a fixed asset (vehicle, equipment), VAT/tax settlements with the authority, and refunds/reversals.
For a "transfer" set vatRate to 0.
Only use "income" for genuine revenue and "expense" for genuine running costs.

CONFIDENCE: set "confidence":"high" only when the description clearly tells you the category. If the description is vague, ambiguous, or you are guessing, set "confidence":"low" so a human can review it. Never guess silently.

Respond with ONLY a valid JSON array, one object per transaction (same order as input):
[{"type":"income"|"expense"|"transfer","category":"category_key","vatRate":number,"confidence":"high"|"low"}]
No explanation, just the JSON array.`;

  const userMsg = rows.map((r, i) =>
    `${i + 1}. "${r.description}" amount:${r.amount} detected:${r.detectedType}`
  ).join('\n');

  const text = await callClaude(system, [{ role: 'user', content: userMsg }], 'claude-haiku-4-5-20251001', 2048);
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('AI returned unexpected format');
  return JSON.parse(match[0]) as Array<{ type: 'income' | 'expense' | 'transfer'; category: string; vatRate: number; confidence: 'high' | 'low' }>;
}

export interface ScannedReceipt {
  amount: number;
  date: string;
  vendor: string;
  description: string;
  category: string;
  vatRate: number;
  type: 'income' | 'expense';
}

export async function scanReceipt(
  base64Image: string,
  mediaType: string,
  categories: string[],
  vatRates: number[],
  lang: string,
): Promise<ScannedReceipt> {
  const prompt = `Analyze this receipt/invoice image and extract the following data.
Available expense categories: ${categories.join(', ')}
Available VAT rates: ${vatRates.join(', ')}%
Today's date for reference: ${new Date().toISOString().split('T')[0]}

Respond with ONLY valid JSON (no explanation):
{"amount":number,"date":"YYYY-MM-DD","vendor":"string","description":"string","category":"category_key","vatRate":number,"type":"income"|"expense"}

Rules:
- amount: total amount as a number (no currency symbol)
- date: use the receipt date, format YYYY-MM-DD
- vendor: store or company name
- description: brief description of what was purchased
- category: pick the closest match from the available categories
- vatRate: pick the closest match from available VAT rates
- type: almost always "expense" for receipts; "income" only if it's a payment received`;

  const res = await fetch(CLAUDE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Image } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err?.error?.message ?? `API error ${res.status}`);
  }
  const data = await res.json() as { content: Array<{ text: string }> };
  const text = data.content[0].text;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error(lang === 'is' ? 'AI gat ekki lesið kvittunina' : 'AI could not read the receipt');
  return JSON.parse(match[0]) as ScannedReceipt;
}

export async function generateInsights(
  context: string,
  lang: string,
  onChunk: (text: string) => void,
): Promise<void> {
  const system = `You are an expert financial advisor and bookkeeper. Analyze financial data and provide clear, actionable insights.
Respond in ${lang === 'is' ? 'Icelandic' : 'English'} using markdown formatting.`;

  const prompt = lang === 'is'
    ? 'Greindu fjárhagsgögn þessa fyrirtækis. Skiptu í hluta: ## Yfirlit, ## Helstu niðurstöður, ## Viðvaranir, ## Ráðleggingar'
    : 'Analyze this company\'s financial data. Use sections: ## Summary, ## Key Findings, ## Warnings, ## Recommendations';

  await streamClaude(
    `${system}\n\nFINANCIAL DATA:\n${context}`,
    [{ role: 'user', content: prompt }],
    onChunk,
  );
}
