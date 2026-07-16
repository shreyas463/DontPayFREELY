'use strict';

/* global cluely */

// ---------------------------------------------------------------------------
// Element refs
// ---------------------------------------------------------------------------
const el = {
  stream: document.getElementById('stream'),
  empty: document.getElementById('empty-state'),
  hintList: document.getElementById('hint-list'),
  input: document.getElementById('input'),
  send: document.getElementById('btn-send'),
  shot: document.getElementById('btn-shot'),
  listen: document.getElementById('btn-listen'),
  liveDot: document.getElementById('live-dot'),
  chipAi: document.getElementById('chip-ai'),
  chipListen: document.getElementById('chip-listen'),
  chipSys: document.getElementById('chip-sys'),
  transcriptStrip: document.getElementById('transcript-strip'),
  transcriptLabel: document.getElementById('transcript-label'),
  transcriptText: document.getElementById('transcript-text'),
  settingsBtn: document.getElementById('btn-settings'),
  hideBtn: document.getElementById('btn-hide'),
  drawer: document.getElementById('drawer'),
  drawerBody: document.getElementById('drawer-body'),
  closeDrawer: document.getElementById('btn-close-drawer'),
  permBanner: document.getElementById('perm-banner'),
  permText: document.getElementById('perm-text'),
  permFix: document.getElementById('perm-fix'),
};

const state = {
  attachScreenshot: false,
  listening: false,
  activeAssistantEl: null,
  activeBuffer: '',
  status: null,
};

// ---------------------------------------------------------------------------
// Rendering helpers
// ---------------------------------------------------------------------------
function hideEmpty() {
  if (el.empty) el.empty.classList.add('hidden');
}

function scrollToBottom() {
  el.stream.scrollTop = el.stream.scrollHeight;
}

function addUserMessage(text, imageDataUrl) {
  hideEmpty();
  const msg = document.createElement('div');
  msg.className = 'msg user';
  const role = document.createElement('div');
  role.className = 'role';
  role.textContent = 'you';
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text || '(screenshot)';
  if (imageDataUrl) {
    const img = document.createElement('img');
    img.className = 'thumb';
    img.src = imageDataUrl;
    bubble.appendChild(img);
  }
  msg.appendChild(role);
  msg.appendChild(bubble);
  el.stream.appendChild(msg);
  scrollToBottom();
}

function startAssistantMessage() {
  hideEmpty();
  const msg = document.createElement('div');
  msg.className = 'msg assistant';
  const role = document.createElement('div');
  role.className = 'role';
  role.textContent = 'cluely';
  const bubble = document.createElement('div');
  bubble.className = 'bubble cursor';
  msg.appendChild(role);
  msg.appendChild(bubble);
  el.stream.appendChild(msg);
  state.activeAssistantEl = bubble;
  state.activeBuffer = '';
  scrollToBottom();
}

function showThinking(reason) {
  hideEmpty();
  const msg = document.createElement('div');
  msg.className = 'msg assistant thinking-msg';
  const t = document.createElement('div');
  t.className = 'thinking';
  t.innerHTML = `<span class="spinner"></span><span>${escapeHtml(reason || 'Thinking…')}</span>`;
  msg.appendChild(t);
  el.stream.appendChild(msg);
  scrollToBottom();
  return msg;
}

function clearThinking() {
  document.querySelectorAll('.thinking-msg').forEach((n) => n.remove());
}

function addError(message) {
  clearThinking();
  hideEmpty();
  const div = document.createElement('div');
  div.className = 'error-msg';
  div.textContent = message;
  el.stream.appendChild(div);
  scrollToBottom();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ---------------------------------------------------------------------------
// Sending prompts
// ---------------------------------------------------------------------------
async function sendPrompt() {
  const text = el.input.value.trim();
  if (!text && !state.attachScreenshot) return;
  addUserMessage(text);
  el.input.value = '';
  autoGrow();
  const includeScreenshot = state.attachScreenshot;
  state.attachScreenshot = false;
  el.shot.classList.remove('on');
  showThinking(includeScreenshot ? 'Analyzing your screen…' : 'Thinking…');
  await cluely.ask(text, includeScreenshot);
}

// ---------------------------------------------------------------------------
// Assistant event stream
// ---------------------------------------------------------------------------
cluely.on('assistant:thinking', (p) => {
  clearThinking();
  showThinking(p && p.reason);
});

cluely.on('assistant:start', () => {
  clearThinking();
  startAssistantMessage();
});

cluely.on('assistant:token', (p) => {
  if (!state.activeAssistantEl) startAssistantMessage();
  state.activeBuffer += p.chunk;
  state.activeAssistantEl.textContent = state.activeBuffer;
  scrollToBottom();
});

cluely.on('assistant:done', (p) => {
  if (state.activeAssistantEl) {
    state.activeAssistantEl.classList.remove('cursor');
    const text = (p && p.text) || state.activeBuffer;
    // Render Markdown for the final answer; add a copy button.
    if (window.mdToHtml) {
      state.activeAssistantEl.innerHTML = window.mdToHtml(text);
    } else {
      state.activeAssistantEl.textContent = text;
    }
    attachCopyButton(state.activeAssistantEl, text);
  }
  state.activeAssistantEl = null;
  scrollToBottom();
});

function attachCopyButton(bubble, text) {
  const parent = bubble.parentElement;
  if (!parent || parent.querySelector('.copy-btn')) return;
  const btn = document.createElement('button');
  btn.className = 'copy-btn';
  btn.textContent = 'copy';
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = 'copied';
      setTimeout(() => (btn.textContent = 'copy'), 1200);
    } catch (_) {
      /* ignore */
    }
  });
  parent.appendChild(btn);
}

cluely.on('assistant:error', (p) => {
  addError((p && p.message) || 'Something went wrong.');
  if (state.activeAssistantEl) state.activeAssistantEl.classList.remove('cursor');
  state.activeAssistantEl = null;
});

cluely.on('context:screenshot', (p) => {
  // Attach a thumbnail to the most recent user message if it has none.
  const users = el.stream.querySelectorAll('.msg.user .bubble');
  const last = users[users.length - 1];
  if (last && !last.querySelector('.thumb') && p.imageDataUrl) {
    const img = document.createElement('img');
    img.className = 'thumb';
    img.src = p.imageDataUrl;
    last.appendChild(img);
    scrollToBottom();
  }
});

cluely.on('context:clear', () => {
  el.stream.querySelectorAll('.msg, .error-msg').forEach((n) => n.remove());
  el.empty.classList.remove('hidden');
  cluely.resetContext();
  setTranscript('');
});

cluely.on('ui:focus-input', () => {
  el.input.focus();
});

cluely.on('ui:click-through', (p) => {
  document.body.style.opacity = p.clickThrough ? '0.75' : '1';
});

// A mode was triggered (button or hotkey): show its user bubble, if any.
cluely.on('feature:start', (p) => {
  if (p && p.userBubble) addUserMessage(p.userBubble);
});

// Transient status/notice from main (e.g. permission hints).
let statusTimer = null;
cluely.on('status', (p) => {
  const msg = p && p.message;
  if (!msg) return;
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.getElementById('app').appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => toast.classList.remove('show'), 9000);
});

// ---------------------------------------------------------------------------
// Transcript
// ---------------------------------------------------------------------------
function setTranscript(text, who) {
  if (!text) {
    el.transcriptStrip.classList.add('hidden');
    el.transcriptText.textContent = '';
    return;
  }
  el.transcriptStrip.classList.remove('hidden');
  if (who && el.transcriptLabel) {
    el.transcriptLabel.textContent = who === 'them' ? 'them' : 'you';
    el.transcriptLabel.classList.toggle('them', who === 'them');
  }
  el.transcriptText.textContent = text;
}

cluely.on('transcript:update', (p) => {
  setTranscript(p.text, p.channel);
});

cluely.on('listening:state', (p) => {
  setListeningUI(p.listening);
  if (p.listening) startAudioCapture();
  else stopAudioCapture();
});

// ---------------------------------------------------------------------------
// Audio capture -> 16 kHz mono WAV chunks -> main -> Whisper
//
// Two independent pipelines run at once:
//   'you'  = your microphone (getUserMedia)
//   'them' = system / meeting audio (getDisplayMedia loopback — no BlackHole)
// Each is transcribed separately so the model knows who is speaking.
// ---------------------------------------------------------------------------
function createCapture(channel) {
  let ctx = null;
  let stream = null;
  let source = null;
  let proc = null;
  let chunks = [];
  let rate = 16000;
  let timer = null;

  async function start(getStream) {
    if (stream) return { ok: true };
    let s;
    try {
      s = await getStream();
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
    if (!s) return { ok: false, error: 'no stream' };
    const tracks = s.getAudioTracks();
    if (!tracks.length) {
      s.getTracks().forEach((t) => t.stop());
      return { ok: false, error: 'no audio track' };
    }
    stream = s;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    rate = ctx.sampleRate;
    source = ctx.createMediaStreamSource(new MediaStream(tracks));
    proc = ctx.createScriptProcessor(4096, 1, 1);
    const sink = ctx.createGain();
    sink.gain.value = 0; // run the processor without echoing audio back out
    proc.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(proc);
    proc.connect(sink);
    sink.connect(ctx.destination);
    const secs = (state.status && state.status.transcriptionChunk) || 6;
    timer = setInterval(flush, secs * 1000);
    return { ok: true };
  }

  async function flush() {
    if (!chunks.length) return;
    const merged = mergeFloat32(chunks);
    chunks = [];
    if (rms(merged) < 0.006) return; // skip near-silent chunks
    const wav = encodeWav(downsampleTo16k(merged, rate), 16000);
    const res = await cluely.sendAudioChunk(new Uint8Array(wav), channel);
    if (res && !res.ok && res.reason) {
      addError(res.reason);
      stopListening();
    }
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
    if (proc) {
      proc.disconnect();
      proc.onaudioprocess = null;
      proc = null;
    }
    if (source) {
      source.disconnect();
      source = null;
    }
    if (ctx) {
      ctx.close();
      ctx = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    chunks = [];
  }

  return {
    start,
    stop,
    get active() {
      return !!stream;
    },
  };
}

const micCapture = createCapture('you');
const sysCapture = createCapture('them');

async function startAudioCapture() {
  // Kick off system/loopback capture FIRST (without awaiting) so getDisplayMedia
  // still holds the click's user activation. Failure here is non-fatal — the mic
  // path below is what matters, and system audio only works when the app has the
  // Screen-Recording grant and was toggled from a click (not a bare hotkey).
  if (state.captureSystemAudio !== false) {
    sysCapture
      .start(async () => {
        const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        s.getVideoTracks().forEach((t) => t.stop()); // audio only
        return s;
      })
      .then((res) => setSystemAudioUI(res.ok))
      .catch(() => setSystemAudioUI(false));
  }

  const deviceId = (state.status && state.status.audioDeviceId) || '';
  const audioConstraints = {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  if (deviceId) audioConstraints.deviceId = { exact: deviceId };
  const micRes = await micCapture.start(() =>
    navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
  );
  if (!micRes.ok) {
    addError(`Microphone access failed: ${micRes.error}`);
    stopListening();
  }
}

function stopAudioCapture() {
  micCapture.stop();
  sysCapture.stop();
  setSystemAudioUI(false);
}

function stopListening() {
  setListeningUI(false);
  stopAudioCapture();
}

function setSystemAudioUI(on) {
  state.systemAudio = on;
  if (el.chipSys) {
    el.chipSys.classList.toggle('hidden', !on);
    el.chipSys.classList.toggle('on', on);
  }
}

function mergeFloat32(chunks) {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Float32Array(len);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

function rms(buf) {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

function downsampleTo16k(buffer, inRate) {
  if (inRate === 16000) return buffer;
  const ratio = inRate / 16000;
  const newLen = Math.round(buffer.length / ratio);
  const out = new Float32Array(newLen);
  let pos = 0;
  let idx = 0;
  while (pos < newLen) {
    const nextIdx = Math.round((pos + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let i = idx; i < nextIdx && i < buffer.length; i++) {
      sum += buffer[i];
      count++;
    }
    out[pos] = count ? sum / count : 0;
    pos++;
    idx = nextIdx;
  }
  return out;
}

function encodeWav(samples, rate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (off, str) => {
    for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    off += 2;
  }
  return buffer;
}

// ---------------------------------------------------------------------------
// UI state toggles
// ---------------------------------------------------------------------------
function setListeningUI(on) {
  state.listening = on;
  el.listen.classList.toggle('on', on);
  el.liveDot.classList.toggle('live', on);
  el.chipListen.textContent = on ? 'listening' : 'idle';
  el.chipListen.classList.toggle('on', on);
  if (!on) setTranscript('');
}

// ---------------------------------------------------------------------------
// Input handlers
// ---------------------------------------------------------------------------
function autoGrow() {
  el.input.style.height = 'auto';
  el.input.style.height = Math.min(el.input.scrollHeight, 120) + 'px';
}

el.input.addEventListener('input', autoGrow);
el.input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendPrompt();
  }
});
el.send.addEventListener('click', sendPrompt);

el.shot.addEventListener('click', () => {
  state.attachScreenshot = !state.attachScreenshot;
  el.shot.classList.toggle('on', state.attachScreenshot);
});

el.listen.addEventListener('click', () => {
  const next = !state.listening;
  setListeningUI(next);
  if (next) startAudioCapture();
  else stopAudioCapture();
});

// Quick action modes (assist / say / followup / recap / solve)
document.querySelectorAll('.mode-btn').forEach((btn) => {
  btn.addEventListener('click', () => cluely.runMode(btn.dataset.mode, ''));
});

el.hideBtn.addEventListener('click', () => window.blur());

el.settingsBtn.addEventListener('click', () => {
  el.drawer.classList.remove('hidden');
  renderSettings();
});
el.closeDrawer.addEventListener('click', () => el.drawer.classList.add('hidden'));

// ---------------------------------------------------------------------------
// Settings drawer
// ---------------------------------------------------------------------------
function kbd(accel) {
  return (accel || '')
    .replace('CommandOrControl', '⌘')
    .replace('Command', '⌘')
    .replace('Control', '⌃')
    .replace('Shift', '⇧')
    .replace('Backslash', '\\')
    .replace(/\+/g, ' ');
}

async function renderSettings() {
  const s = await cluely.getStatus();
  state.status = { ...state.status, ...s };
  const sc = s.shortcuts || {};
  const cfg = await cluely.getConfig();

  const rows = [
    ['Toggle overlay', sc.toggleVisibility],
    ['Ask about screen', sc.askScreenshot],
    ['Quick ask (focus)', sc.quickAsk],
    ['Toggle listening', sc.toggleListening],
    ['Click-through', sc.toggleClickThrough],
    ['Clear context', sc.clearContext],
    ['Move overlay', `${kbd(sc.moveUp)} / arrows`],
    ['Quit', sc.quit],
  ];
  const shortcutHtml = rows
    .map(
      ([k, v]) =>
        `<div class="kv"><span class="k">${k}</span><span class="v"><kbd>${kbd(v)}</kbd></span></div>`
    )
    .join('');

  const aiWarn =
    s.ai && !s.ai.configured && s.ai.provider !== 'mock'
      ? `<div class="warn">Provider "<b>${s.ai.provider}</b>" needs a key: ${s.ai.hint || 'missing API key'}. Add it to <code>.env</code> and restart. Until then, mock answers are shown.</div>`
      : '';
  const whisperWarn =
    s.transcription && !s.transcription.available
      ? `<div class="warn">Local Whisper not ready: run <b>npm run whisper:setup</b>.</div>`
      : '';

  // permission rows
  const perm = s.permissions || {};
  const permRow = (label, status, kind) => {
    const ok = status === 'granted';
    return `<div class="kv"><span class="k">${label}</span><span class="v">
      <span class="pill ${ok ? 'ok' : 'bad'}">${status || 'unknown'}</span>
      ${ok ? '' : `<button class="mini-btn" data-perm="${kind}">fix</button>`}
    </span></div>`;
  };

  const providers = ['mock', 'anthropic', 'openai', 'gemini'];
  const providerOpts = providers
    .map((p) => `<option value="${p}" ${p === s.ai.provider ? 'selected' : ''}>${p}</option>`)
    .join('');

  const models = ['tiny.en', 'base.en', 'small.en', 'medium.en'];
  const modelOpts = models
    .map(
      (m) =>
        `<option value="${m}" ${m === s.transcription.model ? 'selected' : ''}>${m}</option>`
    )
    .join('');

  const opacity = (cfg.overlay && cfg.overlay.opacity) != null ? cfg.overlay.opacity : 0.96;
  const chunk = s.transcription.chunkSeconds || 6;

  el.drawerBody.innerHTML = `
    <h4>AI provider</h4>
    <div class="field"><label>Provider</label>
      <select id="set-provider">${providerOpts}</select></div>
    <div class="field"><label>Model <span class="muted">(blank = default)</span></label>
      <input id="set-model" type="text" placeholder="e.g. claude-sonnet-5" value="${cfg.ai && cfg.ai.model ? cfg.ai.model : ''}" /></div>
    ${aiWarn}
    <p class="note">Provider/model changes apply on next restart. Add API keys to <code>.env</code>.</p>

    <h4>Transcription</h4>
    <div class="field"><label>Whisper model</label>
      <select id="set-whisper">${modelOpts}</select></div>
    <div class="field"><label>Microphone / input</label>
      <select id="set-device"><option value="">System default</option></select></div>
    <div class="field"><label>Chunk length: <span id="chunk-val">${chunk}s</span></label>
      <input id="set-chunk" type="range" min="3" max="12" step="1" value="${chunk}" /></div>
    <div class="kv"><span class="k">Whisper ready</span><span class="v">${s.transcription.available ? 'yes' : 'no'}</span></div>
    ${whisperWarn}

    <h4>Overlay</h4>
    <div class="field"><label>Opacity: <span id="op-val">${Math.round(opacity * 100)}%</span></label>
      <input id="set-opacity" type="range" min="40" max="100" step="1" value="${Math.round(opacity * 100)}" /></div>

    <h4>Permissions</h4>
    ${permRow('Screen Recording', perm.screen, 'screen')}
    ${permRow('Microphone', perm.microphone, 'microphone')}

    <h4>Shortcuts</h4>
    ${shortcutHtml}

    <h4>Config</h4>
    <div class="kv"><span class="k">File</span><span class="v"><a class="link" id="open-config">edit config.json</a></span></div>
  `;

  wireSettings();
  populateDevices((cfg.transcription && cfg.transcription.audioDeviceId) || '');
}

function wireSettings() {
  const provider = document.getElementById('set-provider');
  const model = document.getElementById('set-model');
  const whisper = document.getElementById('set-whisper');
  const device = document.getElementById('set-device');
  const chunk = document.getElementById('set-chunk');
  const chunkVal = document.getElementById('chunk-val');
  const opacity = document.getElementById('set-opacity');
  const opVal = document.getElementById('op-val');
  const openCfg = document.getElementById('open-config');

  provider.addEventListener('change', () => {
    cluely.saveConfig({ ai: { provider: provider.value } });
    el.chipAi.textContent = provider.value;
  });
  model.addEventListener('change', () => {
    cluely.saveConfig({ ai: { model: model.value.trim() } });
  });
  whisper.addEventListener('change', () => {
    cluely.saveConfig({ transcription: { model: whisper.value } });
  });
  device.addEventListener('change', () => {
    cluely.saveConfig({ transcription: { audioDeviceId: device.value } });
    state.status.audioDeviceId = device.value;
  });
  chunk.addEventListener('input', () => {
    chunkVal.textContent = `${chunk.value}s`;
  });
  chunk.addEventListener('change', () => {
    cluely.saveConfig({ transcription: { chunkSeconds: Number(chunk.value) } });
    state.status.transcriptionChunk = Number(chunk.value);
  });
  opacity.addEventListener('input', () => {
    opVal.textContent = `${opacity.value}%`;
  });
  opacity.addEventListener('change', () => {
    cluely.saveConfig({ overlay: { opacity: Number(opacity.value) / 100 } });
  });
  if (openCfg) openCfg.addEventListener('click', () => cluely.openConfig());

  document.querySelectorAll('[data-perm]').forEach((btn) => {
    btn.addEventListener('click', () => cluely.openPermSettings(btn.getAttribute('data-perm')));
  });
}

async function populateDevices(selectedId) {
  const sel = document.getElementById('set-device');
  if (!sel) return;
  try {
    // Labels require an active permission grant; request one first.
    await cluely.requestMic();
    const devices = await navigator.mediaDevices.enumerateDevices();
    devices
      .filter((d) => d.kind === 'audioinput')
      .forEach((d) => {
        const opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || `Input ${sel.length}`;
        if (d.deviceId === selectedId) opt.selected = true;
        sel.appendChild(opt);
      });
  } catch (_) {
    /* enumeration blocked; system default still works */
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
function updatePermissionBanner(perm) {
  if (!perm) return;
  const missing = [];
  if (perm.screen !== 'granted') missing.push('Screen Recording');
  if (perm.microphone !== 'granted') missing.push('Microphone');
  if (!missing.length) {
    el.permBanner.classList.add('hidden');
    return;
  }
  el.permText.textContent = `${missing.join(' & ')} permission needed for full functionality.`;
  el.permBanner.classList.remove('hidden');
  el.permFix.onclick = () =>
    cluely.openPermSettings(perm.screen !== 'granted' ? 'screen' : 'microphone');
}

cluely.on('settings:open', () => {
  el.drawer.classList.remove('hidden');
  renderSettings();
});

cluely.on('permissions:update', (perm) => {
  if (state.status) state.status.permissions = perm;
  updatePermissionBanner(perm);
});

async function init() {
  const s = await cluely.getStatus();
  state.status = s;
  state.status.transcriptionChunk = (s.transcription && s.transcription.chunkSeconds) || 6;
  state.status.audioDeviceId = (s.transcription && s.transcription.audioDeviceId) || '';
  el.chipAi.textContent = s.ai.provider;
  el.chipAi.classList.toggle('on', s.ai.configured && s.ai.provider !== 'mock');

  el.hintList.innerHTML = [
    ['Ask about your screen', s.shortcuts.askScreenshot],
    ['Quick ask', s.shortcuts.quickAsk],
    ['Toggle listening', s.shortcuts.toggleListening],
    ['Show / hide', s.shortcuts.toggleVisibility],
  ]
    .map(([label, accel]) => `<li>${label} &nbsp;<kbd>${kbd(accel)}</kbd></li>`)
    .join('');

  updatePermissionBanner(s.permissions);
  setListeningUI(false);
}

init();
