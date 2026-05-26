import { AppData } from '../types';

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
    body: JSON.stringify({ model, max_tokens: 2048, stream: true, system, messages }),
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

export function buildContext(data: AppData, lang: string): string {
  const year = data.settings.fiscalYear;
  const yearTx = data.transactions.filter(tx => new Date(tx.date).getFullYear() === year);
  const income = yearTx.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expenses = yearTx.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const catBreakdown: Record<string, number> = {};
  yearTx.forEach(tx => { catBreakdown[tx.category] = (catBreakdown[tx.category] ?? 0) + tx.amount; });

  const openInvoices = data.invoices.filter(i => i.type === 'invoice' && (i.status === 'sent' || i.status === 'overdue'));
  const recent = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 50);

  return `COMPANY: ${data.settings.company.name || 'Unknown'}
COUNTRY: ${data.settings.country} | CURRENCY: ${data.settings.defaultCurrency}
FISCAL YEAR: ${year} | LANGUAGE: ${lang === 'is' ? 'Icelandic' : 'English'}

YEAR-TO-DATE ${year}:
Income: ${Math.round(income).toLocaleString()} | Expenses: ${Math.round(expenses).toLocaleString()} | Net: ${Math.round(income - expenses).toLocaleString()}
Transactions: ${yearTx.length}

CATEGORY BREAKDOWN:
${Object.entries(catBreakdown).map(([c, a]) => `  ${c}: ${Math.round(a).toLocaleString()}`).join('\n')}

OPEN INVOICES (${openInvoices.length}):
${openInvoices.map(i => {
    const total = i.lines.reduce((s, l) => s + l.quantity * l.unitPrice * (1 + l.vatRate / 100), 0);
    return `  ${i.number} — ${i.customer.name}: ${Math.round(total).toLocaleString()} (${i.status})`;
  }).join('\n') || '  None'}

RECENT TRANSACTIONS (last 50):
${recent.map(tx => `  ${tx.date} | ${tx.type} | ${tx.category} | ${Math.round(tx.amount).toLocaleString()} | ${tx.description}`).join('\n')}`;
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
): Promise<Array<{ type: 'income' | 'expense'; category: string; vatRate: number }>> {
  const system = `You are a bookkeeping categorization engine. Analyze bank transaction descriptions and categorize them.
Available categories: ${categories.join(', ')}
Available VAT rates: ${vatRates.join(', ')}%
Respond with ONLY a valid JSON array, one object per transaction (same order as input):
[{"type":"income"|"expense","category":"category_key","vatRate":number}]
No explanation, just the JSON array.`;

  const userMsg = rows.map((r, i) =>
    `${i + 1}. "${r.description}" amount:${r.amount} detected:${r.detectedType}`
  ).join('\n');

  const text = await callClaude(system, [{ role: 'user', content: userMsg }], 'claude-haiku-4-5-20251001', 2048);
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('AI returned unexpected format');
  return JSON.parse(match[0]) as Array<{ type: 'income' | 'expense'; category: string; vatRate: number }>;
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
