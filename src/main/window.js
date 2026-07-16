'use strict';

const { BrowserWindow, screen } = require('electron');
const path = require('path');

/**
 * Creates the stealth overlay window.
 *
 * The combination of flags below is what makes the window feel like Cluely:
 *  - transparent + frameless  -> no chrome, floats over everything
 *  - alwaysOnTop 'screen-saver' level -> stays above full-screen apps
 *  - setContentProtection(true) -> excluded from screen capture / screen share
 *  - skipTaskbar + no dock icon (set in app) -> doesn't show up in switchers
 *  - visibleOnAllWorkspaces -> follows you across spaces
 */
function createOverlayWindow(config) {
  const overlay = config.overlay || {};
  const primary = screen.getPrimaryDisplay();
  const workArea = primary.workArea;

  const width = overlay.width || 480;
  const height = overlay.height || 560;

  const pos = computePosition(overlay.position || 'top-right', workArea, width, height);

  const win = new BrowserWindow({
    width,
    height,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    alwaysOnTop: true,
    acceptFirstMouse: true,
    roundedCorners: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
    },
  });

  // Float above full-screen apps and other always-on-top windows.
  win.setAlwaysOnTop(true, 'screen-saver');

  // Follow the user across desktops / spaces, and show over full-screen apps.
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Keep it out of Mission Control / the app switcher — one less place it shows.
  if (typeof win.setHiddenInMissionControl === 'function') {
    win.setHiddenInMissionControl(true);
  }

  // The stealth feature: exclude this window from screen capture & sharing.
  if (overlay.contentProtection !== false) {
    win.setContentProtection(true);
  }

  if (typeof overlay.opacity === 'number') {
    win.setOpacity(overlay.opacity);
  }

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  return win;
}

function computePosition(position, workArea, width, height) {
  const margin = 24;
  const { x, y, width: aw, height: ah } = workArea;
  switch (position) {
    case 'top-left':
      return { x: x + margin, y: y + margin };
    case 'top-center':
      return { x: x + Math.round((aw - width) / 2), y: y + margin };
    case 'bottom-right':
      return { x: x + aw - width - margin, y: y + ah - height - margin };
    case 'bottom-left':
      return { x: x + margin, y: y + ah - height - margin };
    case 'center':
      return { x: x + Math.round((aw - width) / 2), y: y + Math.round((ah - height) / 2) };
    case 'top-right':
    default:
      return { x: x + aw - width - margin, y: y + margin };
  }
}

module.exports = { createOverlayWindow };
