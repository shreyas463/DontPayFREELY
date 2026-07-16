'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/**
 * Safe, minimal API surface exposed to the renderer. No Node access leaks;
 * everything the UI can do is enumerated here.
 */
const api = {
  // --- invoke (request/response) ---
  getStatus: () => ipcRenderer.invoke('app:getStatus'),
  getConfig: () => ipcRenderer.invoke('app:getConfig'),
  saveConfig: (partial) => ipcRenderer.invoke('app:saveConfig', partial),
  ask: (prompt, includeScreenshot) =>
    ipcRenderer.invoke('assistant:ask', { prompt, includeScreenshot }),
  sendAudioChunk: (buffer, channel) => ipcRenderer.invoke('audio:chunk', { buffer, channel }),
  resetContext: () => ipcRenderer.invoke('context:reset'),
  setSize: (width, height) => ipcRenderer.invoke('window:setSize', { width, height }),
  setClickThrough: (value) => ipcRenderer.invoke('window:setClickThrough', { value }),
  openConfig: () => ipcRenderer.invoke('shell:openConfig'),
  quit: () => ipcRenderer.invoke('app:quit'),

  // permissions
  permStatus: () => ipcRenderer.invoke('perm:status'),
  requestMic: () => ipcRenderer.invoke('perm:requestMic'),
  openPermSettings: (kind) => ipcRenderer.invoke('perm:openSettings', { kind }),

  // --- events (main -> renderer) ---
  on: (channel, handler) => {
    const allowed = new Set([
      'assistant:thinking',
      'assistant:start',
      'assistant:token',
      'assistant:done',
      'assistant:error',
      'context:screenshot',
      'context:clear',
      'transcript:update',
      'listening:state',
      'ui:focus-input',
      'ui:click-through',
      'settings:open',
      'permissions:update',
    ]);
    if (!allowed.has(channel)) return () => {};
    const listener = (_e, payload) => handler(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
};

contextBridge.exposeInMainWorld('cluely', api);
