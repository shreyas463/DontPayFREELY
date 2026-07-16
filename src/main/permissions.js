'use strict';

const { systemPreferences, shell } = require('electron');

/**
 * macOS privacy permission helpers. The overlay needs:
 *   - Screen Recording   -> screenshots (desktopCapturer)
 *   - Microphone         -> live transcription
 *
 * Screen Recording cannot be requested programmatically on macOS; we can only
 * read its status and deep-link the user to the right System Settings pane.
 * Microphone access can be requested at runtime.
 */

function isMac() {
  return process.platform === 'darwin';
}

function getStatus() {
  if (!isMac()) {
    return { screen: 'granted', microphone: 'granted', platform: process.platform };
  }
  return {
    screen: systemPreferences.getMediaAccessStatus('screen'),
    microphone: systemPreferences.getMediaAccessStatus('microphone'),
    platform: 'darwin',
  };
}

async function requestMicrophone() {
  if (!isMac()) return true;
  try {
    return await systemPreferences.askForMediaAccess('microphone');
  } catch (_) {
    return false;
  }
}

const PANES = {
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
};

function openSettings(kind) {
  const url = PANES[kind];
  if (url) shell.openExternal(url).catch(() => {});
}

/** True when everything needed for full functionality is granted. */
function allGranted() {
  const s = getStatus();
  return s.screen === 'granted' && s.microphone === 'granted';
}

module.exports = { getStatus, requestMicrophone, openSettings, allGranted, isMac };
