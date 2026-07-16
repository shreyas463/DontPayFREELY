'use strict';

const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');

/**
 * Menu-bar (tray) icon. Because the Dock icon is hidden, this is the primary
 * way to control the app when the overlay is hidden — show/hide, listen,
 * ask, click-through, and quit, all with their hotkeys shown inline.
 */
function createTray(handlers, config, getState) {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'trayTemplate.png');
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    // Fallback: a 1x1 so Tray construction never throws.
    image = nativeImage.createEmpty();
  }
  image.setTemplateImage(true);

  const tray = new Tray(image);
  tray.setToolTip('FreelyCluely');

  const sc = (config && config.shortcuts) || {};

  function accelFor(name) {
    // Electron menu accelerators use the same syntax as globalShortcut.
    return sc[name] || undefined;
  }

  function build() {
    const state = getState ? getState() : {};
    const menu = Menu.buildFromTemplate([
      {
        label: state.visible ? 'Hide overlay' : 'Show overlay',
        accelerator: accelFor('toggleVisibility'),
        click: () => handlers.toggleVisibility(),
      },
      { type: 'separator' },
      {
        label: 'Ask about screen',
        accelerator: accelFor('askScreenshot'),
        click: () => handlers.askScreenshot(),
      },
      {
        label: state.listening ? 'Stop listening' : 'Start listening',
        accelerator: accelFor('toggleListening'),
        click: () => handlers.toggleListening(),
      },
      {
        label: state.clickThrough ? 'Disable click-through' : 'Enable click-through',
        accelerator: accelFor('toggleClickThrough'),
        click: () => handlers.toggleClickThrough(),
      },
      {
        label: 'Clear context',
        accelerator: accelFor('clearContext'),
        click: () => handlers.clearContext(),
      },
      { type: 'separator' },
      { label: 'Settings…', click: () => handlers.openSettings() },
      {
        label: 'Quit FreelyCluely',
        accelerator: accelFor('quit'),
        click: () => handlers.quit(),
      },
    ]);
    tray.setContextMenu(menu);
  }

  build();

  return {
    tray,
    refresh: build,
    destroy: () => tray.destroy(),
  };
}

module.exports = { createTray };
