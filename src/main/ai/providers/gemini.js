'use strict';

/**
 * Google Gemini provider (generateContent). Vision + streaming.
 * Requires GEMINI_API_KEY (or GOOGLE_API_KEY) in the environment.
 */

const defaultModel = 'gemini-2.0-flash';
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function apiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
}

function isConfigured() {
  return Boolean(apiKey());
}

function configHint() {
  return 'export GEMINI_API_KEY=...';
}

function buildParts({ prompt, transcript, imageDataUrl }) {
  const parts = [];
  const textParts = [];
  if (transcript && transcript.trim()) {
    textParts.push(`Live transcript so far:\n"""\n${transcript.trim()}\n"""`);
  }
  if (prompt && prompt.trim()) textParts.push(prompt.trim());
  if (!textParts.length) {
    textParts.push('Given the screen contents, tell me the single most useful thing right now.');
  }
  parts.push({ text: textParts.join('\n\n') });
  if (imageDataUrl) {
    const m = /^data:(.+?);base64,(.*)$/s.exec(imageDataUrl);
    if (m) parts.push({ inline_data: { mime_type: m[1], data: m[2] } });
  }
  return parts;
}

async function complete({ system, prompt, transcript, imageDataUrl, model, maxTokens, onToken }) {
  const mdl = model || defaultModel;
  const stream = Boolean(onToken);
  const endpoint = stream ? 'streamGenerateContent?alt=sse&' : 'generateContent?';
  const url = `${BASE}/${mdl}:${endpoint}key=${apiKey()}`;

  const body = {
    systemInstruction: system ? { parts: [{ text: system }] } : undefined,
    contents: [{ role: 'user', parts: buildParts({ prompt, transcript, imageDataUrl }) }],
    generationConfig: { maxOutputTokens: maxTokens || 1024 },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${text.slice(0, 300)}`);
  }

  if (!stream) {
    const json = await res.json();
    return (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
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
      if (!data) continue;
      try {
        const evt = JSON.parse(data);
        const text = (evt.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
        if (text) {
          full += text;
          onToken(text);
        }
      } catch (_) {
        /* ignore */
      }
    }
  }
  return full;
}

module.exports = { complete, isConfigured, configHint, defaultModel };
