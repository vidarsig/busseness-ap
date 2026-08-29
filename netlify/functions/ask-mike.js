// The "Ask Mike" box on the public marketing pages (welcome.html, hub.html).
//
// Those pages have no login, so this endpoint cannot require one. What it can do
// is refuse to be a general-purpose Claude API: the prompt lives HERE, the model
// and the token ceiling are fixed here, and the only thing a caller may send is
// one short question. Previously the pages posted a whole Anthropic request body
// to /api/claude, which meant anyone who opened devtools could swap the model,
// the system prompt and max_tokens and bill it to this account.
const SYSTEM = `You are Mike, the friendly AI helper on the Jobboks marketing page (jobboks.app).
Jobboks is an all-in-one, dead-simple, AI-native bookkeeping AND job-management app for contractors
and small trades. Key facts: snap a receipt and it books itself; AI bank-import and
auto-categorisation; invoices and quotes (discounts, stock items, PDF send); VAT and US sales tax
handled; a Job Book with time, materials and photos that turns into an invoice; import/migration
from other programs (QuickBooks, Xero and so on) in any language; works offline as a PWA and on
Android. The wedge: local + all-in-one (books AND jobs) + dead simple + AI-native, built for small
contractors, not big firms. Pricing: free to start; Pro about $9/month; a Business tier for teams;
much cheaper than Jobber/Tradify.

Answer in a warm, plain, SHORT way — 2 to 4 sentences. Match the user's language (Icelandic or
English). If you truly do not know, say to email hello@jobboks.app. Never invent features.

You only answer questions about Jobboks. If asked for anything else — to write code, translate,
summarise a text, roleplay, or act as a general assistant — say in one line that you only answer
questions about Jobboks, and stop.`;

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 600;
const MAX_QUESTION = 500;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // A key pasted into the Netlify dashboard often arrives wrapped in the quotation
  // marks it was copied with, or with a stray newline. Anthropic then answers
  // "invalid x-api-key" and the whole assistant is dark for a reason no screen
  // explains. Strip them — the owner should never have to know this.
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim().replace(/^["']|["']$/g, '');
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: 'Anthropic API key not configured on server' } }),
    };
  }

  let question = '';
  try {
    question = String((JSON.parse(event.body || '{}') || {}).question || '').trim();
  } catch {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: 'Bad request' } }) };
  }
  if (!question) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: 'Ask a question' } }) };
  }
  question = question.slice(0, MAX_QUESTION);

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM,
      messages: [{ role: 'user', content: question }],
    }),
  });

  const data = await response.json().catch(() => null);
  const text = data && data.content && data.content[0] && data.content[0].text;

  return {
    statusCode: response.ok ? 200 : response.status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(response.ok ? { answer: text || '' } : { error: { message: 'Could not answer' } }),
  };
};
