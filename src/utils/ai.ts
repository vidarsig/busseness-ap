import { AppData } from '../types';
import { calcProfitLoss, calcVATSummary, filterByYear } from './calculations';

const CLAUDE_URL = '/api/claude';
const CLAUDE_STREAM_URL = '/api/claude-stream';

export interface ChatMessage { role: 'user' | 'assistant'; content: string; }

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

export async function streamClaude(
  system: string,
  messages: ChatMessage[],
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
  const MAX_TX = 2000;
  const sorted = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date));
  const recent = sorted.slice(0, MAX_TX);
  const txLabel = data.transactions.length > MAX_TX
    ? `TRANSACTIONS (most recent ${MAX_TX} of ${data.transactions.length} — older years are covered by the summaries above)`
    : `TRANSACTIONS (all ${recent.length})`;

  return `COMPANY: ${data.settings.company.name || 'Unknown'}
COUNTRY: ${data.settings.country} | CURRENCY: ${data.settings.defaultCurrency}
FISCAL YEAR (default): ${data.settings.fiscalYear} | CORPORATE TAX RATE: ${data.settings.corporateTaxRate}%
LANGUAGE: ${lang === 'is' ? 'Icelandic' : 'English'}
YEARS WITH DATA: ${years.join(', ') || 'none'}

These per-year totals are calculated by the same engine as the Reports and Annual
Accounts screens, so they reconcile exactly. Use them when asked about any year.

FULL-YEAR FINANCIAL SUMMARIES:
${perYear}

OPEN INVOICES (${openInvoices.length}):
${openInvoices.map(i => {
    const total = i.lines.reduce((s, l) => s + l.quantity * l.unitPrice * (1 + l.vatRate / 100), 0);
    return `  ${i.number} — ${i.customer.name}: ${fmtNum(total)} (${i.status})`;
  }).join('\n') || '  None'}

${txLabel}:
${recent.map(tx => `  ${tx.date} | ${tx.type} | ${tx.category} | ${fmtNum(tx.amount)} | ${tx.description}`).join('\n')}`;
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

You have full-year totals for every year that has data. When the user asks about a
specific year, use that year's summary. When comparing years, reference both.

Always respond in ${lang === 'is' ? 'Icelandic' : 'English'}.
Be concise and helpful. Format numbers with the company currency (${data.settings.defaultCurrency}).
When asked about specific transactions, reference the data provided.

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
