'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Local speech-to-text using whisper.cpp via the optional `nodejs-whisper`
 * dependency. The renderer captures microphone (and, if configured, system)
 * audio, encodes 16 kHz mono WAV chunks, and hands them here for transcription.
 *
 * If `nodejs-whisper` isn't installed / built, this degrades gracefully:
 * `isAvailable()` returns false and the UI shows a setup hint instead of
 * crashing. Run `npm run whisper:setup` to install + fetch a model.
 */

let nodewhisper = null;
let loadError = null;

try {
  // Lazy require — it's an optional dependency.
  ({ nodewhisper } = require('nodejs-whisper'));
} catch (err) {
  loadError = err;
}

const TMP_DIR = path.join(os.tmpdir(), 'freelycluely-audio');

function ensureTmp() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

function isAvailable() {
  return Boolean(nodewhisper);
}

function unavailableReason() {
  if (nodewhisper) return null;
  return (
    'Local Whisper is not installed. Run `npm run whisper:setup` to install ' +
    'nodejs-whisper and download a model.' +
    (loadError ? ` (${loadError.message})` : '')
  );
}

let counter = 0;

/**
 * Transcribe a 16 kHz mono WAV buffer. Returns the recognized text (trimmed).
 */
async function transcribeWav(wavBuffer, config) {
  if (!nodewhisper) throw new Error(unavailableReason());
  ensureTmp();

  const tCfg = (config && config.transcription) || {};
  counter += 1;
  const file = path.join(TMP_DIR, `chunk-${Date.now()}-${counter}.wav`);
  fs.writeFileSync(file, wavBuffer);

  try {
    const result = await nodewhisper(file, {
      modelName: tCfg.model || 'base.en',
      autoDownloadModelName: tCfg.model || 'base.en',
      removeWavFileAfterTranscription: false,
      withCuda: false,
      logger: { log() {}, error() {}, warn() {}, info() {}, debug() {} },
      whisperOptions: {
        outputInText: false,
        outputInSrt: false,
        outputInVtt: false,
        translateToEnglish: false,
        language: tCfg.language || 'en',
        wordTimestamps: false,
        splitOnWord: true,
      },
    });
    return cleanTranscript(result);
  } finally {
    fs.promises.unlink(file).catch(() => {});
  }
}

/**
 * whisper.cpp output often includes [timestamp] prefixes and bracketed
 * non-speech markers. Strip them down to plain text.
 */
function cleanTranscript(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .split('\n')
    .map((line) => line.replace(/\[[0-9:.\s\-\->]+\]/g, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\[(BLANK_AUDIO|MUSIC|SILENCE|NOISE|APPLAUSE)\]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = { isAvailable, unavailableReason, transcribeWav, cleanTranscript };
