'use strict';

/**
 * OpenAI provider (Chat Completions, GPT-4o-class vision). Streaming + vision.
 * Requires OPENAI_API_KEY in the environment.
 */

const defaultModel = 'gpt-4o';
const API_URL = 'https://api.openai.com/v1/chat/completions';

function isConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function configHint() {
  return 'export OPENAI_API_KEY=...';
}

function buildUserContent({ prompt, transcript, imageDataUrl }) {
  const content = [];
  const textParts = [];
  if (transcript && transcript.trim()) {
    textParts.push(`Live transcript so far:\n"""\n${transcript.trim()}\n"""`);
  }
  if (prompt && prompt.trim()) textParts.push(prompt.trim());
  if (!textParts.length) {
    textParts.push('Given the screen contents, tell me the single most useful thing right now.');
  }
  content.push({ type: 'text', text: textParts.join('\n\n') });
  if (imageDataUrl) {
    content.push({ type: 'image_url', image_url: { url: imageDataUrl } });
  }
  return content;
}

async function complete({ system, prompt, transcript, imageDataUrl, model, maxTokens, onToken }) {
  const body = {
    model: model || defaultModel,
    max_tokens: maxTokens || 1024,
    stream: Boolean(onToken),
    messages: [
      { role: 'system', content: system || '' },
      { role: 'user', content: buildUserContent({ prompt, transcript, imageDataUrl }) },
    ],
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI ${res.status}: ${text.slice(0, 300)}`);
  }

  if (!onToken) {
    const json = await res.json();
    return json.choices?.[0]?.message?.content || '';
  }

  return await consumeSSE(res, onToken);
}

async function consumeSSE(res, onToken) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const evt = JSON.parse(data);
        const delta = evt.choices?.[0]?.delta?.content;
        if (delta) {
          full += delta;
          onToken(delta);
        }
      } catch (_) {
        /* ignore */
      }
    }
  }
  return full;
}

module.exports = { complete, isConfigured, configHint, defaultModel };
