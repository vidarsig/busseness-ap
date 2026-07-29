// Creates a Stripe Checkout payment link for one invoice, so a customer can pay by
// ACH bank debit (low fee — the winner for big contractor invoices) or card. The
// secret key lives ONLY on the server (STRIPE_SECRET_KEY env var) — never in the
// app. Set it in Netlify → Site settings → Environment variables after you create
// your Stripe account and connect your bank. No card/bank details ever touch this
// app: the customer enters them on Stripe's own hosted page.
//
// When the customer pays, the money lands in your bank; your bank import then
// auto-links that deposit to the invoice — so no webhook is needed to reconcile.

// Stripe zero-decimal currencies take the amount as-is; everything else in cents.
// (ISK is NOT on Stripe's zero-decimal list — verify ISK handling before taking
// ISK online; online pay here is US-first / USD.)
const ZERO_DECIMAL = new Set(['bif','clp','djf','gnf','jpy','kmf','krw','mga','pyg','rwf','ugx','vnd','vuv','xaf','xof','xpf']);

function json(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return json(503, { error: { message: 'Online payments are not set up yet (STRIPE_SECRET_KEY not configured on the server).' } });
  }

  let p;
  try { p = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: 'Bad request' }; }

  const { amount, currency, description, invoiceNumber, origin, methods, connectedAccountId } = p;
  const cur = String(currency || 'usd').toLowerCase();
  const amt = Number(amount);
  if (!amt || amt <= 0) return json(400, { error: { message: 'Missing or invalid amount.' } });

  const unit = ZERO_DECIMAL.has(cur) ? Math.round(amt) : Math.round(amt * 100);
  const base = String(origin || 'https://jobboks.app').replace(/\/$/, '');

  const form = new URLSearchParams();
  form.append('mode', 'payment');
  // ACH bank debit first (cheapest), card as fallback. Caller may override.
  (Array.isArray(methods) && methods.length ? methods : ['us_bank_account', 'card'])
    .forEach(m => form.append('payment_method_types[]', m));
  form.append('line_items[0][quantity]', '1');
  form.append('line_items[0][price_data][currency]', cur);
  form.append('line_items[0][price_data][unit_amount]', String(unit));
  form.append('line_items[0][price_data][product_data][name]', String(description || `Invoice ${invoiceNumber || ''}`).trim() || 'Invoice');
  form.append('success_url', `${base}/?paid=1`);
  form.append('cancel_url', `${base}/?paid=0`);
  if (invoiceNumber) form.append('metadata[invoice]', String(invoiceNumber));

  // Direct charge on the contractor's connected account: the money settles in THEIR
  // Stripe balance / bank, and they are the merchant of record. The Stripe-Account
  // header is how a platform acts on a connected account (acct_…). Without it, the
  // charge would land on the platform account — so a connected id is required for
  // the multi-tenant "each contractor gets paid into their own bank" model.
  const headers = { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' };
  if (connectedAccountId) headers['Stripe-Account'] = String(connectedAccountId);

  let res, data;
  try {
    res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers,
      body: form.toString(),
    });
    data = await res.json();
  } catch (e) {
    return json(502, { error: { message: `Could not reach Stripe: ${e.message}` } });
  }

  if (!res.ok) {
    return json(res.status, { error: { message: (data && data.error && data.error.message) || 'Stripe error' } });
  }
  return json(200, { url: data.url, id: data.id });
};
