'use strict';

const { desktopCapturer, screen } = require('electron');

/**
 * Captures the primary display and returns a PNG data URL.
 *
 * Because the overlay window has content protection enabled, it does not
 * appear in the capture — the model sees the user's actual screen, not the
 * assistant floating on top of it.
 */
async function captureScreen() {
  const primary = screen.getPrimaryDisplay();
  const { width, height } = primary.size;
  const scale = primary.scaleFactor || 1;

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    },
  });

  if (!sources.length) {
    throw new Error('No screen sources available (check Screen Recording permission).');
  }

  // Prefer the source matching the primary display id.
  const match =
    sources.find((s) => String(s.display_id) === String(primary.id)) || sources[0];

  const image = match.thumbnail;
  if (!image || image.isEmpty()) {
    throw new Error('Captured an empty image (grant Screen Recording permission in System Settings).');
  }

  return image.toDataURL();
}

module.exports = { captureScreen };
