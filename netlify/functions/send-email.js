// Sends an email (e.g. an invoice) FROM the company's own address via Resend.
// The API key lives ONLY on the server (RESEND_API_KEY env var) — never in the app.
// Set it in Netlify → Site settings → Environment variables after verifying the
// jobboks.app domain in Resend.
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: 'Email sending is not set up yet (RESEND_API_KEY not configured on the server).' } }),
    };
  }

  let payload;
  try { payload = JSON.parse(event.body || '{}'); } catch { return { statusCode: 400, body: 'Bad request' }; }

  const { from, to, subject, html, text, attachments, replyTo } = payload;
  if (!to || !subject || (!html && !text)) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: 'Missing to / subject / body.' } }),
    };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: from || 'Jobboks <accounts@jobboks.app>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
      reply_to: replyTo,
      attachments, // [{ filename, content: base64 }]
    }),
  });

  const data = await res.text();
  return { statusCode: res.status, headers: { 'Content-Type': 'application/json' }, body: data };
};
