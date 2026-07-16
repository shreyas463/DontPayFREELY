'use strict';

/**
 * Anthropic (Claude) provider. Supports vision (screenshot) + streaming.
 * Requires ANTHROPIC_API_KEY in the environment.
 */

const defaultModel = 'claude-sonnet-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function configHint() {
  return 'export ANTHROPIC_API_KEY=...';
}

function buildContent({ prompt, transcript, imageDataUrl }) {
  const content = [];
  if (imageDataUrl) {
    const m = /^data:(.+?);base64,(.*)$/s.exec(imageDataUrl);
    if (m) {
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: m[1], data: m[2] },
      });
    }
  }
  const textParts = [];
  if (transcript && transcript.trim()) {
    textParts.push(`Live transcript so far:\n"""\n${transcript.trim()}\n"""`);
  }
  if (prompt && prompt.trim()) {
    textParts.push(prompt.trim());
  }
  if (!textParts.length) {
    textParts.push('Given the screen contents, tell me the single most useful thing right now.');
  }
  content.push({ type: 'text', text: textParts.join('\n\n') });
  return content;
}

async function complete({ system, prompt, transcript, imageDataUrl, model, maxTokens, onToken }) {
  const body = {
    model: model || defaultModel,
    max_tokens: maxTokens || 1024,
    system,
    stream: Boolean(onToken),
    messages: [{ role: 'user', content: buildContent({ prompt, transcript, imageDataUrl }) }],
  };

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 300)}`);
  }

  if (!onToken) {
    const json = await res.json();
    return (json.content || []).map((c) => c.text || '').join('');
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
        if (evt.type === 'content_block_delta' && evt.delta && evt.delta.text) {
          full += evt.delta.text;
          onToken(evt.delta.text);
        }
      } catch (_) {
        /* ignore keep-alives / partials */
      }
    }
  }
  return full;
}

module.exports = { complete, isConfigured, configHint, defaultModel };
