const { check } = require('./_guard');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
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

  return {
    statusCode: response.status,
    headers: { 'Content-Type': 'application/json' },
    body: data,
  };
};
