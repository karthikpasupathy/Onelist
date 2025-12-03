// Vercel Edge Function for OpenAI proxy
export const config = { runtime: 'edge' };

export default async function handler(req) {
  try {
    const { model = 'gpt-4o', messages = [], temperature = 0.5, max_tokens = 900 } = await req.json();
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Missing OPENAI_API_KEY environment variable' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({ model, messages, temperature, max_tokens }),
    });

    const data = await resp.json();
    
    if (!resp.ok) {
      const msg = data?.error?.message || 'OpenAI request failed';
      return new Response(JSON.stringify({ error: msg }), {
        status: resp.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const answer = data.choices?.[0]?.message?.content || '';
    return new Response(JSON.stringify({ answer }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err?.message || 'Unhandled error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
