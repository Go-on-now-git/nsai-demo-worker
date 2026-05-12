export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    if (request.method !== 'POST') return new Response('Not found', { status: 404 });

    try {
      const { name, type, challenge } = await request.json();

      const prompt = `You are NUB — an AI operator built by Not So Holdings LLC (nsai.tech). A prospect just submitted their business info through the live demo. Respond like a sharp, direct AI consultant who just analyzed their situation. Be specific to their industry and challenge. 3-4 sentences max. No fluff, no generic advice. Make them feel like you already understand their business.

Business type: ${type || 'General Business'}
Their challenge: ${challenge || 'Not specified'}
Name: ${name || 'there'}`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 300,
          messages: [{ role: 'user', content: prompt }]
        })
      });

      const data = await response.json();
      const text = data.content?.[0]?.text || 'NUB is standing by — try again in a moment.';

      return new Response(JSON.stringify({ response: text }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        }
      });
    } catch (err) {
      return new Response(JSON.stringify({ response: 'NUB encountered an issue. Try again.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
