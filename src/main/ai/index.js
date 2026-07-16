'use strict';

/**
 * Provider abstraction for the LLM that produces answers.
 *
 * Every provider exports:
 *   async complete({ system, prompt, imageDataUrl, model, maxTokens, onToken }) -> string
 *
 * `imageDataUrl` is an optional base64 data URL of a screenshot (vision).
 * `onToken(textChunk)` is called for streaming providers; may be omitted.
 *
 * The default provider is `mock`, which lets the whole app run end-to-end
 * with zero API keys. Swap in a real provider by setting ai.provider in
 * ~/.freelycluely/config.json (or config/default.json) and supplying the
 * matching API key via environment variable.
 */

const providers = {
  mock: require('./providers/mock'),
  anthropic: require('./providers/anthropic'),
  openai: require('./providers/openai'),
  gemini: require('./providers/gemini'),
};

function resolveProvider(name) {
  const key = (name || 'mock').toLowerCase();
  if (providers[key]) return providers[key];
  return providers.mock;
}

/**
 * Runs a completion using the configured provider.
 * Falls back to the mock provider if the real one is misconfigured
 * (e.g. missing API key), so the UI never hard-fails.
 */
async function complete(config, req) {
  const aiCfg = config.ai || {};
  const provider = resolveProvider(aiCfg.provider);
  const args = {
    system: req.system || aiCfg.systemPrompt || '',
    prompt: req.prompt || '',
    imageDataUrl: req.imageDataUrl || null,
    transcript: req.transcript || '',
    model: aiCfg.model || provider.defaultModel,
    maxTokens: aiCfg.maxTokens || 1024,
    onToken: req.onToken,
  };

  try {
    if (provider.isConfigured && !provider.isConfigured()) {
      const hint = provider.configHint ? provider.configHint() : '';
      const mock = providers.mock;
      return await mock.complete({
        ...args,
        prependNote:
          `⚠︎ Provider "${aiCfg.provider}" is selected but not configured` +
          (hint ? ` (${hint})` : '') +
          `. Showing a mock answer.\n\n`,
      });
    }
    return await provider.complete(args);
  } catch (err) {
    return `⚠︎ AI request failed: ${err.message}`;
  }
}

function status(config) {
  const aiCfg = config.ai || {};
  const provider = resolveProvider(aiCfg.provider);
  const configured = provider.isConfigured ? provider.isConfigured() : true;
  return {
    provider: aiCfg.provider || 'mock',
    model: aiCfg.model || provider.defaultModel || '(default)',
    configured,
    hint: !configured && provider.configHint ? provider.configHint() : null,
  };
}

module.exports = { complete, status, resolveProvider };
