// Stripe Connect (Express) onboarding for a contractor, so each subscriber gets
// paid into THEIR OWN bank — the app never holds their keys or banking details.
//
// The PLATFORM secret key (Jobboks') lives ONLY here (STRIPE_SECRET_KEY env var in
// Netlify) and is set up once by the platform owner, who must also enable Connect
// in the Stripe Dashboard. Each contractor taps "Connect Stripe" in the app: we
// create a connected account and a hosted onboarding link; they enter their own
// business + bank details on Stripe's page and come back. We store only the
// account id (acct_…, NOT a secret) so payments can be created on their behalf.
//
// Actions (JSON body { action, ... }):
//   create  { country, email?, accountId?, origin } → { accountId, url }
//     Makes an Express account if accountId is absent, then returns a fresh
//     onboarding Account Link to redirect the contractor to.
//   status  { accountId }                           → { accountId, chargesEnabled, detailsSubmitted, payoutsEnabled }
//     Reads the account so the app can tell whether the contractor can get paid.

function json(statusCode, obj) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

// Minimal Stripe REST helper (no SDK) — mirrors create-checkout.js.
async function stripe(key, path, method, form) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${key}`,
      ...(form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: form ? form.toString() : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    return json(503, { error: { message: 'Online payments are not set up on the platform yet (STRIPE_SECRET_KEY not configured).' } });
  }

  let p;
  try { p = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: 'Bad request' }; }
  const action = String(p.action || '');

  try {
    if (action === 'status') {
      const accountId = String(p.accountId || '');
      if (!accountId) return json(400, { error: { message: 'Missing accountId.' } });
      const r = await stripe(key, `accounts/${encodeURIComponent(accountId)}`, 'GET');
      if (!r.ok) return json(r.status, { error: { message: r.data?.error?.message || 'Stripe error' } });
      return json(200, {
        accountId,
        chargesEnabled: !!r.data.charges_enabled,
        payoutsEnabled: !!r.data.payouts_enabled,
        detailsSubmitted: !!r.data.details_submitted,
      });
    }

    if (action === 'create') {
      const base = String(p.origin || 'https://jobboks.app').replace(/\/$/, '');
      let accountId = String(p.accountId || '');

      // Create an Express connected account the first time. Request the capabilities
      // needed for direct charges: card + ACH bank debit + transfers.
      if (!accountId) {
        const f = new URLSearchParams();
        f.append('type', 'express');
        f.append('country', String(p.country || 'US').toUpperCase());
        if (p.email) f.append('email', String(p.email));
        f.append('capabilities[card_payments][requested]', 'true');
        f.append('capabilities[transfers][requested]', 'true');
        f.append('capabilities[us_bank_account_ach_payments][requested]', 'true');
        const acc = await stripe(key, 'accounts', 'POST', f);
        if (!acc.ok) return json(acc.status, { error: { message: acc.data?.error?.message || 'Stripe error' } });
        accountId = acc.data.id;
      }

      // A one-time onboarding link. The contractor finishes on Stripe's hosted page,
      // then returns to the app, which re-checks status.
      const lf = new URLSearchParams();
      lf.append('account', accountId);
      lf.append('refresh_url', `${base}/?stripe=refresh`);
      lf.append('return_url', `${base}/?stripe=return`);
      lf.append('type', 'account_onboarding');
      const link = await stripe(key, 'account_links', 'POST', lf);
      if (!link.ok) return json(link.status, { error: { message: link.data?.error?.message || 'Stripe error' } });

      return json(200, { accountId, url: link.data.url });
    }

    return json(400, { error: { message: `Unknown action: ${action}` } });
  } catch (e) {
    return json(502, { error: { message: `Could not reach Stripe: ${e.message}` } });
  }
};
