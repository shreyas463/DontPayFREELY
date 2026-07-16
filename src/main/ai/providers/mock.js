'use strict';

/**
 * Mock provider — no network, no keys. Produces a plausible "assistant"
 * response so the entire capture -> reason -> display pipeline works out
 * of the box. It streams the text token-by-token to exercise the same
 * UI path a real streaming provider would use.
 */

const defaultModel = 'mock-1';

function isConfigured() {
  return true;
}

async function complete({ prompt, transcript, imageDataUrl, onToken, prependNote }) {
  const parts = [];
  if (prependNote) parts.push(prependNote);

  const context = [];
  if (imageDataUrl) context.push('a screenshot of your screen');
  if (transcript && transcript.trim()) context.push('the live transcript');
  const ctxLabel = context.length ? context.join(' and ') : 'your prompt';

  const q = (prompt || transcript || '').trim();

  parts.push(`Here's what I'd say (based on ${ctxLabel}):`);
  parts.push('');
  if (q) {
    parts.push(`• You asked: "${truncate(q, 140)}"`);
  }
  parts.push('• This is a mock answer — the full pipeline is live, but no LLM is wired up yet.');
  parts.push('• Set `ai.provider` to `anthropic`, `openai`, or `gemini` and export the matching API key to get real answers.');
  parts.push('');
  parts.push('Everything else — the stealth overlay, screenshots, hotkeys, and local transcription — is fully functional right now.');

  const full = parts.join('\n');
  await streamOut(full, onToken);
  return full;
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

async function streamOut(text, onToken) {
  if (typeof onToken !== 'function') return;
  const tokens = text.match(/\S+\s*|\n/g) || [text];
  for (const t of tokens) {
    onToken(t);
    // small delay to simulate token streaming
    await new Promise((r) => setTimeout(r, 12));
  }
}

module.exports = { complete, isConfigured, defaultModel };
