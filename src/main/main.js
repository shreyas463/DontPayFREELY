'use strict';

// Load environment (API keys) from a local .env if present.
try {
  require('dotenv').config();
} catch (_) {
  /* dotenv is a hard dep, but never crash on it */
}

const { app, BrowserWindow, ipcMain, shell, session, desktopCapturer } = require('electron');
const path = require('path');

const { loadConfig, saveUserConfig, reload, USER_CONFIG_PATH } = require('./config');
const { createOverlayWindow } = require('./window');
const { registerShortcuts } = require('./shortcuts');
const { captureScreen } = require('./screenshot');
const { createTray } = require('./tray');
const permissions = require('./permissions');
const ai = require('./ai');
const transcription = require('./transcription');
const { MODES } = require('./prompts');

let win = null;
let trayCtl = null;
let config = loadConfig();
let clickThrough = Boolean(config.overlay && config.overlay.clickThrough);
let listening = false;

function overlayState() {
  return {
    visible: Boolean(win && win.isVisible()),
    listening,
    clickThrough,
  };
}

function refreshTray() {
  if (trayCtl) trayCtl.refresh();
}

// Hide from the macOS Dock — part of staying unobtrusive.
if (process.platform === 'darwin' && app.dock) {
  app.dock.hide();
}

// Single instance only.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

// ---------------------------------------------------------------------------
// Shortcut handlers
// ---------------------------------------------------------------------------

function toggleVisibility() {
  if (!win) return;
  if (win.isVisible()) {
    win.hide();
  } else {
    win.showInactive();
  }
  refreshTray();
}

function openSettings() {
  ensureVisible();
  if (win) win.show();
  send('settings:open', {});
}

function ensureVisible() {
  if (win && !win.isVisible()) win.showInactive();
}

function askScreenshot() {
  // "Ask about screen" = the Assist mode (screen + recent transcript).
  runFeature('assist', '');
}

function solveScreen() {
  runFeature('solve', '');
}

function sayNext() {
  runFeature('say', '');
}

function quickAsk() {
  ensureVisible();
  if (win) win.show(); // focus so the user can type
  send('ui:focus-input', {});
}

function toggleListening() {
  listening = !listening;
  ensureVisible();
  send('listening:state', { listening, available: transcription.isAvailable() });
  if (listening && !transcription.isAvailable()) {
    send('assistant:error', { message: transcription.unavailableReason() });
  }
  refreshTray();
}

function toggleClickThrough() {
  clickThrough = !clickThrough;
  applyClickThrough();
  send('ui:click-through', { clickThrough });
  refreshTray();
}

function applyClickThrough() {
  if (!win) return;
  win.setIgnoreMouseEvents(clickThrough, { forward: true });
}

function clearContext() {
  send('context:clear', {});
}

function quitApp() {
  app.quit();
}

// ---------------------------------------------------------------------------
// Core completion flow
// ---------------------------------------------------------------------------

let lastScreenshot = null;

// Dual-channel transcript: 'you' = your mic, 'them' = system/meeting audio.
// Kept as labeled turns so the model knows who said what.
let transcript = []; // { channel: 'you'|'them', text, ts }
const MAX_TURNS = 200;

function formatTranscript(limit) {
  const turns = limit ? transcript.slice(-limit) : transcript;
  return turns.map((t) => (t.channel === 'them' ? 'Them: ' : 'You: ') + t.text).join('\n');
}

function addTranscriptTurn(channel, text) {
  const turn = { channel, text, ts: Date.now() };
  transcript.push(turn);
  if (transcript.length > MAX_TURNS) transcript = transcript.slice(-MAX_TURNS);
  send('transcript:update', { channel, text, full: formatTranscript(0) });
}

async function runCompletion({ imageDataUrl, prompt, system }) {
  if (imageDataUrl) lastScreenshot = imageDataUrl;
  const requestId = `req-${Date.now()}`;
  send('assistant:start', { requestId });

  try {
    const full = await ai.complete(config, {
      system: system || undefined,
      prompt,
      transcript: formatTranscript(16),
      imageDataUrl: imageDataUrl || null,
      onToken: (chunk) => send('assistant:token', { requestId, chunk }),
    });
    send('assistant:done', { requestId, text: full });
  } catch (err) {
    send('assistant:error', { message: err.message });
  }
}

// Runs a named meeting/interview mode (assist, say, followup, recap, solve, ask).
let featureBusy = false;
async function runFeature(mode, userText) {
  const def = MODES[mode];
  if (!def || featureBusy) return;
  featureBusy = true;
  ensureVisible();

  // Tell the renderer which user bubble (if any) to show for this mode.
  const bubble = def.userBubble === null ? userText || '' : def.userBubble;
  send('feature:start', { mode, userBubble: bubble, small: !!def.small });

  try {
    let imageDataUrl = null;
    if (def.needsScreen) {
      send('assistant:thinking', { reason: 'Looking at your screen…' });
      try {
        imageDataUrl = await captureScreen();
        send('context:screenshot', { imageDataUrl });
      } catch (err) {
        send('status', {
          message: 'Screen capture needs permission — grant Screen Recording in System Settings.',
        });
      }
    } else {
      send('assistant:thinking', { reason: 'Thinking…' });
    }

    const prompt = def.build({ transcript: formatTranscript(16), userText: userText || '' });
    await runCompletion({ imageDataUrl, prompt, system: def.system });
  } finally {
    featureBusy = false;
  }
}

// ---------------------------------------------------------------------------
// IPC from the renderer
// ---------------------------------------------------------------------------

function registerIpc() {
  ipcMain.handle('app:getStatus', () => ({
    ai: ai.status(config),
    transcription: {
      available: transcription.isAvailable(),
      reason: transcription.unavailableReason(),
      provider: (config.transcription && config.transcription.provider) || 'whisper-local',
      model: (config.transcription && config.transcription.model) || 'base.en',
      chunkSeconds: (config.transcription && config.transcription.chunkSeconds) || 6,
      audioDeviceId: (config.transcription && config.transcription.audioDeviceId) || '',
    },
    permissions: permissions.getStatus(),
    listening,
    clickThrough,
    shortcuts: config.shortcuts,
    overlay: config.overlay,
    configPath: USER_CONFIG_PATH,
  }));

  ipcMain.handle('perm:status', () => permissions.getStatus());
  ipcMain.handle('perm:requestMic', () => permissions.requestMicrophone());
  ipcMain.handle('perm:openSettings', (_e, { kind }) => {
    permissions.openSettings(kind);
    return { ok: true };
  });

  ipcMain.handle('app:getConfig', () => config);

  ipcMain.handle('app:saveConfig', (_e, partial) => {
    config = saveUserConfig(partial || {});
    return config;
  });

  // Text prompt typed into the overlay — grounded via the Ask mode
  // (transcript context + our system prompt), screenshot optional.
  ipcMain.handle('assistant:ask', async (_e, { prompt, includeScreenshot }) => {
    ensureVisible();
    let imageDataUrl = null;
    if (includeScreenshot) {
      try {
        imageDataUrl = await captureScreen();
        send('context:screenshot', { imageDataUrl });
      } catch (err) {
        send('assistant:error', { message: `Screenshot failed: ${err.message}` });
      }
    }
    const def = MODES.ask;
    const built = def.build({ transcript: formatTranscript(16), userText: prompt });
    await runCompletion({ prompt: built, system: def.system, imageDataUrl });
    return { ok: true };
  });

  // Run a named mode (assist / say / followup / recap / solve) from a UI button.
  ipcMain.handle('assistant:runMode', async (_e, { mode, text }) => {
    await runFeature(mode, text);
    return { ok: true };
  });

  // Renderer captured a WAV audio chunk for transcription.
  // channel: 'you' (microphone) or 'them' (system/meeting audio loopback).
  ipcMain.handle('audio:chunk', async (_e, { buffer, channel }) => {
    if (!transcription.isAvailable()) {
      return { ok: false, reason: transcription.unavailableReason() };
    }
    const ch = channel === 'them' ? 'them' : 'you';
    try {
      const wav = Buffer.from(buffer);
      const text = await transcription.transcribeWav(wav, config);
      if (text) addTranscriptTurn(ch, text);
      return { ok: true, text };
    } catch (err) {
      return { ok: false, reason: err.message };
    }
  });

  ipcMain.handle('context:reset', () => {
    transcript = [];
    lastScreenshot = null;
    return { ok: true };
  });

  ipcMain.handle('window:setSize', (_e, { width, height }) => {
    if (win && width && height) win.setSize(Math.round(width), Math.round(height), false);
    return { ok: true };
  });

  ipcMain.handle('window:setClickThrough', (_e, { value }) => {
    clickThrough = Boolean(value);
    applyClickThrough();
    return { clickThrough };
  });

  ipcMain.handle('shell:openConfig', () => {
    shell.openPath(USER_CONFIG_PATH).catch(() => {});
    return { ok: true };
  });

  ipcMain.handle('app:quit', () => app.quit());
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

let saveBoundsTimer = null;
function persistBounds() {
  if (!win || win.isDestroyed()) return;
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
  saveBoundsTimer = setTimeout(() => {
    const b = win.getBounds();
    config = saveUserConfig({ overlay: { bounds: b } });
  }, 400);
}

// Grant the media permissions the renderer needs for mic + loopback capture,
// so getUserMedia / getDisplayMedia succeed under our own Screen-Recording grant.
function setupMediaSession() {
  const s = session.defaultSession;
  const allow = (p) =>
    p === 'media' || p === 'microphone' || p === 'audioCapture' || p === 'display-capture';
  s.setPermissionRequestHandler((_wc, permission, cb) => cb(allow(permission)));
  s.setPermissionCheckHandler((_wc, permission) => allow(permission));

  // System-audio loopback: hand getDisplayMedia a screen source with 'loopback'
  // audio so the renderer can capture what's playing (Zoom/Meet/etc.) WITHOUT
  // a virtual audio device like BlackHole. macOS 13+ / Electron on darwin.
  s.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => {
          if (sources.length) callback({ video: sources[0], audio: 'loopback' });
          else callback();
        })
        .catch(() => callback());
    },
    { useSystemPicker: false }
  );
}

app.whenReady().then(async () => {
  setupMediaSession();
  win = createOverlayWindow(config);

  // Restore last window position/size if we saved one.
  const savedBounds = config.overlay && config.overlay.bounds;
  if (savedBounds && typeof savedBounds.x === 'number') {
    win.setBounds(savedBounds);
  }

  win.on('moved', persistBounds);
  win.on('resize', persistBounds);
  win.on('show', refreshTray);
  win.on('hide', refreshTray);

  win.once('ready-to-show', () => {
    if (!config.overlay || config.overlay.startVisible !== false) {
      win.showInactive();
    }
    applyClickThrough();
  });

  registerIpc();

  // Menu-bar control surface (Dock icon is hidden).
  trayCtl = createTray(
    {
      toggleVisibility,
      askScreenshot,
      toggleListening,
      toggleClickThrough,
      clearContext,
      openSettings,
      quit: quitApp,
    },
    config,
    overlayState
  );

  registerShortcuts(win, config, {
    toggleVisibility,
    askScreenshot,
    solveScreen,
    sayNext,
    quickAsk,
    toggleListening,
    toggleClickThrough,
    clearContext,
    quit: quitApp,
  });

  // Proactively ensure microphone access so listening works on first try.
  permissions.requestMicrophone().then(() => {
    send('permissions:update', permissions.getStatus());
  });

  app.on('second-instance', () => {
    ensureVisible();
    if (win) win.focus();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      win = createOverlayWindow(config);
    }
  });
});

app.on('will-quit', () => {
  const { globalShortcut } = require('electron');
  globalShortcut.unregisterAll();
  if (trayCtl) trayCtl.destroy();
});

// Keep running with no visible windows (overlay may be hidden).
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
