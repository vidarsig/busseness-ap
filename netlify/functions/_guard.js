// Shared gate for the two in-app AI endpoints.
//
// Both used to forward whatever arrived straight to Anthropic with the server's
// key and no authentication at all, so anyone who found the URL had a free
// general-purpose Claude API billed to this account — any model, any prompt, any
// length. With a few hundred subscribers that is a bill someone else writes.
//
// Two locks, because either alone leaks:
//   1. A caller must present a signed-in Supabase session. These endpoints are
//      only ever used from inside the app, which always has one.
//   2. Even then, only the models and sizes the app actually asks for get through
//      — a stolen session should not buy an unlimited context either.
const ALLOWED_MODELS = new Set([
  'claude-haiku-4-5-20251001',
  'claude-sonnet-4-6',
  'claude-opus-4-5',            // Review Intelligence
]);
const MAX_TOKENS_CEILING = 4096;

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://gculnifrbgwdvnfzcrlz.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

function bearer(headers) {
  const raw = (headers && (headers.authorization || headers.Authorization)) || '';
  const m = /^Bearer\s+(.+)$/i.exec(String(raw).trim());
  return m ? m[1] : '';
}

// Ask Supabase who the token belongs to. One round trip, no extra secret to
// keep: an invalid or expired token simply is not a user.
async function verify(token) {
  if (!token) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {}),
      },
    });
    if (!res.ok) return false;
    const user = await res.json().catch(() => null);
    return !!(user && user.id);
  } catch {
    return false;
  }
}

// Returns { error } when the request should be refused, else { body } with the
// sanitised request to forward.
async function check(headers, rawBody) {
  if (!(await verify(bearer(headers)))) {
    return { error: { status: 401, message: 'Sign in to use the assistant' } };
  }
  let body;
  try {
    body = JSON.parse(rawBody || '{}');
  } catch {
    return { error: { status: 400, message: 'Bad request' } };
  }
  if (!ALLOWED_MODELS.has(body.model)) {
    return { error: { status: 400, message: 'Unsupported model' } };
  }
  const max = Number(body.max_tokens);
  body.max_tokens = Number.isFinite(max) && max > 0 ? Math.min(max, MAX_TOKENS_CEILING) : 1024;
  return { body: JSON.stringify(body) };
}

module.exports = { check };
