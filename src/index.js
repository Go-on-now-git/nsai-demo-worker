const ALLOWED_ORIGINS = ['https://nsai.tech', 'https://www.nsai.tech'];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

// In-memory rate limit per IP (resets per Worker instance — best-effort, not distributed)
const rateLimitMap = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const windowMs = 60_000;
  const maxReqs = 12;
  const entry = rateLimitMap.get(ip) || { count: 0, start: now };
  if (now - entry.start > windowMs) { rateLimitMap.set(ip, { count: 1, start: now }); return false; }
  if (entry.count >= maxReqs) return true;
  entry.count++;
  rateLimitMap.set(ip, entry);
  return false;
}

const SYSTEM_PROMPTS = {
  pricing: `You are NUB — NSAI's sales operator at nsai.tech. Be direct, confident, and close the sale.

Products:
- NUB Installer ($197 one-time): Self-hosted AI operator, bring your own Anthropic API key, runs on Linux/Mac/Windows/Android. Buy: https://notsoinc.gumroad.com/l/nsai-nub
- NUB + Onboarding ($297 one-time): Installer + 1-hour live setup call with a dedicated NSAI specialist + 30 days priority email support + first automation built for them. Buy: https://notsoinc.gumroad.com/l/nsai-nub-pro
- NSAI Operator ($297/mo, fully managed): We deploy, configure, and run everything. Contact: nub@nsai.tech

Help the prospect pick the right tier based on their situation. Ask one qualifying question if needed. Keep replies under 120 words. Include purchase links when relevant.`,

  download: `You are NUB — NSAI's customer support operator. A customer already purchased and needs help with their download.

Facts:
- Gumroad delivers download links instantly via email after purchase. Subject line is from Gumroad — check spam.
- If they still can't find it: direct them to nub@nsai.tech with their Gumroad order ID.
- Setup call booking (for NUB + Onboarding buyers): https://calendly.com/nsai-tech/30min
- For NUB Installer: run install.sh (Linux/Mac) or install.ps1 (Windows). Need an Anthropic API key from console.anthropic.com.

Be helpful, fast, and specific. Under 100 words.`,

  support: `You are NUB — NSAI's technical support operator. Help users with NUB installation and setup.

Stack: NUB runs on Debian Linux, Node.js, PM2. Interfaces: Telegram bot, web portal (local IP:3000). Requires: Anthropic API key from console.anthropic.com.
Common issues: PM2 not starting (run: pm2 logs nub), Telegram bot not responding (verify BOT_TOKEN in .env), portal not loading (check port 3000).
Escalation: nub@nsai.tech for complex issues.

Give step-by-step numbered instructions. Be precise. Under 150 words.`,

  book: `You are NUB — NSAI's scheduling operator. The user wants to book their 1-hour setup call included with NUB + Onboarding.

Booking link: https://calendly.com/nsai-tech/30min
Tell them: 1) Pick a time slot on Calendly, 2) Have their device ready, 3) Have their Anthropic API key from console.anthropic.com ready. The call is 60 minutes and NUB will be fully configured by the end.

Be brief and encouraging. Under 80 words.`,

  general: `You are NUB — the AI operator built by Not So Holdings LLC (nsai.tech), Wesley Chapel FL. You handle business automation 24/7: client follow-ups, scheduling, research, email sequences, lead qualification, workflow automation via n8n.

Answer questions about NSAI, NUB, and AI automation for small business. Be sharp, direct, and knowledgeable. No filler. If they're ready to buy, push them toward nsai.tech. Under 120 words.`
};

async function handleDemo(request, env) {
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
  return data.content?.[0]?.text || 'NUB is standing by — try again in a moment.';
}

async function notifyLead(env, route, firstMessage) {
  if (!env.TG_BOT_TOKEN || !env.TG_CHAT_ID) return;
  const text = `🔥 <b>NSAI Lead</b>\n\n<b>Route:</b> ${route}\n<b>Message:</b> ${firstMessage?.substring(0,200) || '(none)'}\n<b>Time:</b> ${new Date().toISOString()}`;
  fetch(`https://api.telegram.org/bot${env.TG_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env.TG_CHAT_ID, text, parse_mode: 'HTML' })
  }).catch(() => {});
}

async function handleChat(request, env) {
  const { messages = [], route = 'general', init } = await request.json();
  const systemPrompt = SYSTEM_PROMPTS[route] || SYSTEM_PROMPTS.general;

  // Fire lead notification for high-value routes on first real message
  if (['pricing', 'book'].includes(route) && messages.length <= 2) {
    const firstMsg = messages.find(m => m.role === 'user')?.content || init || '';
    notifyLead(env, route, firstMsg);
  }

  let apiMessages = messages.filter(m => m.role && m.content && m.role !== 'system');
  if (apiMessages.length === 0) {
    apiMessages = [{ role: 'user', content: 'Hello, I need help.' }];
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: 400,
      system: systemPrompt,
      messages: apiMessages.slice(-10)
    })
  });
  const data = await response.json();
  return data.content?.[0]?.text || 'Standing by — try again in a moment.';
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }
    if (request.method !== 'POST') {
      return new Response('Not found', { status: 404 });
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (isRateLimited(ip)) {
      return new Response(JSON.stringify({ error: 'Too many requests. Try again in a minute.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', ...cors }
      });
    }

    const url = new URL(request.url);

    try {
      let text;
      if (url.pathname === '/chat') {
        text = await handleChat(request, env);
      } else {
        text = await handleDemo(request, env);
      }
      return new Response(JSON.stringify({ response: text }), {
        headers: { 'Content-Type': 'application/json', ...cors }
      });
    } catch (err) {
      return new Response(JSON.stringify({ response: 'NUB encountered an issue. Try again.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...cors }
      });
    }
  }
};
