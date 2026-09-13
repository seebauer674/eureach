const https = require('https');

function callClaude(apiKey, systemPrompt, userMessage, maxTokens = 2048, model = 'claude-sonnet-4-6') {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Failed to parse Anthropic response')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function callGroq(apiKey, systemPrompt, userMessage, maxTokens = 2048, model = 'qwen/qwen3.8-27b') {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
    });
    const options = {
      hostname: 'api.groq.com',
      path: '/openai/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('Failed to parse Groq response')); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Unified generate — returns plain text string from the AI
async function generate({ provider = 'anthropic', apiKey, systemPrompt, userMessage, maxTokens = 2048, model }) {
  if (provider === 'groq') {
    const groqModel = (!model || model.startsWith('claude')) ? 'qwen/qwen3.8-27b' : model;
    const res = await callGroq(apiKey, systemPrompt, userMessage, maxTokens, groqModel);
    if (res.choices && res.choices[0]) return res.choices[0].message.content;
    throw new Error((res.error && res.error.message) || 'Groq error');
  }
  const res = await callClaude(apiKey, systemPrompt, userMessage, maxTokens, model || 'claude-sonnet-4-6');
  if (res.type === 'error') throw new Error((res.error && res.error.message) || 'Anthropic error');
  if (res.content && res.content[0]) return res.content[0].text;
  throw new Error('Unexpected AI response format');
}

module.exports = { generate, callClaude, callGroq };
