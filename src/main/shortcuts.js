'use strict';

const { globalShortcut, screen } = require('electron');

const MOVE_STEP = 60;

/**
 * Registers all global hotkeys. Returns an unregister function.
 * Handlers are provided by the caller (main.js) so this module stays
 * free of app-specific state.
 */
function registerShortcuts(win, config, handlers) {
  const sc = config.shortcuts || {};
  const bindings = [];

  const bind = (accel, fn) => {
    if (!accel) return;
    let ok = false;
    try {
      ok = globalShortcut.register(accel, fn);
    } catch (err) {
      console.warn(`[shortcuts] invalid accelerator "${accel}": ${err.message}`);
    }
    bindings.push({ accel, ok });
    if (!ok) console.warn(`[shortcuts] failed to register: ${accel}`);
  };

  bind(sc.toggleVisibility, () => handlers.toggleVisibility());
  bind(sc.askScreenshot, () => handlers.askScreenshot());
  bind(sc.quickAsk, () => handlers.quickAsk());
  bind(sc.toggleListening, () => handlers.toggleListening());
  bind(sc.toggleClickThrough, () => handlers.toggleClickThrough());
  bind(sc.clearContext, () => handlers.clearContext());
  bind(sc.quit, () => handlers.quit());

  bind(sc.moveUp, () => moveWindow(win, 0, -MOVE_STEP));
  bind(sc.moveDown, () => moveWindow(win, 0, MOVE_STEP));
  bind(sc.moveLeft, () => moveWindow(win, -MOVE_STEP, 0));
  bind(sc.moveRight, () => moveWindow(win, MOVE_STEP, 0));

  return {
    bindings,
    unregister: () => globalShortcut.unregisterAll(),
  };
}

function moveWindow(win, dx, dy) {
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  const display = screen.getDisplayNearestPoint({ x, y });
  const wa = display.workArea;
  const [w, h] = win.getSize();
  const nx = clamp(x + dx, wa.x, wa.x + wa.width - w);
  const ny = clamp(y + dy, wa.y, wa.y + wa.height - h);
  win.setPosition(nx, ny, false);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

module.exports = { registerShortcuts };
