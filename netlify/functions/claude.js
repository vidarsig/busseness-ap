const { check } = require('./_guard');

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

  // Signed-in callers only, and only the models and sizes the app asks for.
  // The public marketing pages do not come through here — they have their own
  // locked-down /api/ask-mike.
  const gate = await check(event.headers, event.body);
  if (gate.error) {
    return {
      statusCode: gate.error.status,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message: gate.error.message } }),
    };
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: gate.body,
  });

  const data = await response.text();

  // "invalid x-api-key" tells a contractor nothing and reads like his mistake. It is
  // the server's key that is wrong, and only the owner of this deployment can fix it.
  if (response.status === 401 && /x-api-key|authentication/i.test(data)) {
    return {
      statusCode: 401,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { message:
        'The assistant is not connected right now — the AI key on the server is missing or not valid. '
        + 'Everything else in Jobboks works as normal.' } }),
    };
  }

  return {
    statusCode: response.status,
    headers: { 'Content-Type': 'application/json' },
    body: data,
  };
};
