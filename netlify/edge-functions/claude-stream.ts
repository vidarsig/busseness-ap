// Same gate as netlify/functions/_guard.js, written out again because this runs
// on Deno at the edge and cannot require() the Node helper. Keep the two in step.
//
// This is the expensive endpoint — the in-app chat: a large cached system prompt,
// web search, and 2048 tokens a turn. It used to forward anything at all to
// Anthropic with the server's key and no authentication, which made it a free
// general-purpose Claude API for anyone who found the URL.
const ALLOWED_MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
  'claude-opus-4-5',            // Review Intelligence
]);
const MAX_TOKENS_CEILING = 4096;

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://gculnifrbgwdvnfzcrlz.supabase.co';
// The anon key is PUBLIC — it already ships inside the client bundle — and Supabase's auth
// endpoints REJECT a request that has no apikey header, whatever bearer token it carries.
// Defaulting it to '' meant every verification failed and the guard 401'd the owner out of
// his own assistant. Default it the same way the URL is defaulted.
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdjdWxuaWZyYmd3ZHZuZnpjcmx6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjg0OTgsImV4cCI6MjA5NDgwNDQ5OH0.m8iDYKIF3YDQ4cYtOFkbEz0zHXVkFgKb4oZER4JJE64';

async function signedIn(request: Request): Promise<boolean> {
  const raw = request.headers.get('authorization') || '';
  const token = /^Bearer\s+(.+)$/i.exec(raw.trim())?.[1];
  if (!token) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
    });
    if (!res.ok) return false;
    const user = await res.json().catch(() => null);
    return !!user?.id;
  } catch {
    return false;
  }
}

const fail = (status: number, message: string) =>
  new Response(JSON.stringify({ error: { message } }), {
    status, headers: { 'Content-Type': 'application/json' },
  });

export default async (request: Request) => {
  if (request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // A key pasted into the Netlify dashboard often arrives wrapped in the quotation
  // marks it was copied with, or with a stray newline. Anthropic then answers
  // "invalid x-api-key" and the whole assistant is dark for a reason no screen
  // explains. Strip them — the owner should never have to know this.
  const apiKey = (Deno.env.get('ANTHROPIC_API_KEY') || '').trim().replace(/^["']|["']$/g, '');
  if (!apiKey) return fail(500, 'Anthropic API key not configured on server');

  if (!(await signedIn(request))) return fail(401, 'Sign in to use the assistant');

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return fail(400, 'Bad request');
  }
  if (!ALLOWED_MODELS.has(String(body.model))) return fail(400, 'Unsupported model');
  const max = Number(body.max_tokens);
  body.max_tokens = Number.isFinite(max) && max > 0 ? Math.min(max, MAX_TOKENS_CEILING) : 1024;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    },
  });
};

export const config = { path: '/api/claude-stream' };
