import { AppData } from '../types';
import { calcProfitLoss, calcVATSummary, filterByYear, accountBalanceByYear } from './calculations';

const CLAUDE_URL = '/api/claude';
const CLAUDE_STREAM_URL = '/api/claude-stream';

export interface ChatMessage { role: 'user' | 'assistant'; content: string; }

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
function monthlyBreakdown(data: AppData): string {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const years = [...new Set(data.transactions.map(t => new Date(t.date).getFullYear()))].sort((a, b) => b - a);
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
function counterpartyIndex(data: AppData): string {
  interface Party { inc: number; exp: number; count: number; years: Map<number, { inc: number; exp: number }>; }
  const map = new Map<string, Party>();
  for (const tx of data.transactions) {
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

export function buildContext(data: AppData, lang: string): string {
  // Every year that actually has transactions, newest first — so the AI can
  // analyse and compare any year (e.g. 2024 vs 2025), not just the fiscal year.
  const years = [...new Set(data.transactions.map(tx => new Date(tx.date).getFullYear()))]
    .sort((a, b) => b - a);

  const perYear = years
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
  const CHAR_BUDGET = 600_000; // ≈180k tokens, safe margin under the 200k window
  const sorted = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date));
  const txRows: string[] = [];
  let txChars = 0;
  for (const tx of sorted) {
    if (txRows.length >= MAX_TX) break;
    const row = `  ${tx.date} | ${tx.type} | ${tx.category} | ${fmtNum(tx.amount)} | ${tx.description}`;
    if (txChars + row.length > CHAR_BUDGET) break;
    txRows.push(row);
    txChars += row.length + 1;
  }
  const txLabel = data.transactions.length > txRows.length
    ? `TRANSACTIONS (most recent ${txRows.length} of ${data.transactions.length} — older years are covered by the summaries above)`
    : `TRANSACTIONS (all ${txRows.length})`;

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

  return `COMPANY: ${data.settings.company.name || 'Unknown'}
COUNTRY: ${data.settings.country} | CURRENCY: ${data.settings.defaultCurrency}
FISCAL YEAR (default): ${data.settings.fiscalYear} | CORPORATE TAX RATE: ${data.settings.corporateTaxRate}%
LANGUAGE: ${lang === 'is' ? 'Icelandic' : 'English'}
YEARS WITH DATA: ${years.join(', ') || 'none'}

These per-year totals are calculated by the same engine as the Reports and Annual
Accounts screens, so they reconcile exactly. Use them when asked about any year.

FULL-YEAR FINANCIAL SUMMARIES:
${perYear}

MONTHLY BREAKDOWN — every year, Jan→Dec (income +, expense -):
${monthlyBreakdown(data)}

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

COUNTERPARTY INDEX — every party across ALL years (grouped by description, top by
volume; n=number of transactions, then total in / out, then per-year in/out). Use
this to find or total payments to/from any tenant, supplier or person over time,
and to compare years — it covers every year, not just recent ones:
${counterpartyIndex(data)}

OPEN INVOICES (${openInvoices.length}):
${openInvoices.map(i => {
    const total = i.lines.reduce((s, l) => s + l.quantity * l.unitPrice * (1 + l.vatRate / 100), 0);
    return `  ${i.number} — ${i.customer.name}: ${fmtNum(total)} (${i.status})`;
  }).join('\n') || '  None'}

${txLabel}:
${txRows.join('\n')}`;
}

export function buildChatSystem(data: AppData, lang: string): string {
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

CURRENT FINANCIAL DATA:
${buildContext(data, lang)}`;
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
