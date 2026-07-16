#!/usr/bin/env node
'use strict';

/**
 * Ensures local Whisper is ready:
 *  1. verifies `nodejs-whisper` is installed (optionalDependency)
 *  2. triggers a one-time model download by running a tiny transcription
 *
 * Run with: npm run whisper:setup
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

async function main() {
  let nodewhisper;
  try {
    ({ nodewhisper } = require('nodejs-whisper'));
  } catch (err) {
    console.error('✗ nodejs-whisper is not installed.');
    console.error('  Install it with:  npm install nodejs-whisper');
    console.error('  (it builds whisper.cpp; requires cmake + a C++ toolchain)');
    process.exit(1);
  }

  const model = process.env.WHISPER_MODEL || 'base.en';
  console.log(`→ Preparing Whisper model "${model}" (first run downloads + builds; this can take a few minutes)…`);

  // Generate 1s of silence as a 16 kHz mono WAV to force model download/build.
  const tmp = path.join(os.tmpdir(), 'freelycluely-setup.wav');
  fs.writeFileSync(tmp, silenceWav(1, 16000));

  try {
    await nodewhisper(tmp, {
      modelName: model,
      autoDownloadModelName: model,
      removeWavFileAfterTranscription: false,
      whisperOptions: { outputInText: false, language: 'en' },
    });
    console.log('✓ Whisper is ready. Local transcription will work now.');
  } catch (err) {
    console.error('✗ Whisper setup failed:', err.message);
    console.error('  Ensure cmake and a C++ compiler are installed (xcode-select --install on macOS).');
    process.exit(1);
  } finally {
    fs.promises.unlink(tmp).catch(() => {});
  }
}

function silenceWav(seconds, rate) {
  const n = seconds * rate;
  const buffer = Buffer.alloc(44 + n * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + n * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(rate, 24);
  buffer.writeUInt32LE(rate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(n * 2, 40);
  return buffer;
}

main();
