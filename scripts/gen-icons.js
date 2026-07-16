#!/usr/bin/env node
'use strict';

/**
 * Generates all app icons from code (no design tools / binary assets in git).
 *
 *   - assets/trayTemplate.png      (menu-bar icon, macOS template style)
 *   - assets/trayTemplate@2x.png
 *   - assets/icon.png              (1024² app icon, used by electron-builder)
 *
 * Run with: npm run icons
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'assets');

// --- minimal PNG encoder (RGBA, 8-bit) ------------------------------------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // filter byte (0) per scanline
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- drawing helpers -------------------------------------------------------
function make(width, height, painter) {
  const rgba = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = painter(x, y, width, height);
      const i = (y * width + x) * 4;
      rgba[i] = r;
      rgba[i + 1] = g;
      rgba[i + 2] = b;
      rgba[i + 3] = a;
    }
  }
  return encodePng(width, height, rgba);
}

function smoothCircleAlpha(x, y, cx, cy, r, feather) {
  const d = Math.hypot(x - cx, y - cy);
  if (d <= r - feather) return 1;
  if (d >= r + feather) return 0;
  return 1 - (d - (r - feather)) / (2 * feather);
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

// Tray: an "aperture / eye" — filled ring, template (black + alpha).
function trayPainter(x, y, w, h) {
  const cx = w / 2;
  const cy = h / 2;
  const outer = smoothCircleAlpha(x, y, cx, cy, w * 0.42, w * 0.05);
  const hole = smoothCircleAlpha(x, y, cx, cy, w * 0.18, w * 0.05);
  const a = Math.max(0, outer - hole);
  return [0, 0, 0, Math.round(a * 255)];
}

// App icon: rounded-square gradient bg + white ring + accent pupil.
function iconPainter(x, y, w, h) {
  const t = y / h;
  // rounded-rect mask
  const radius = w * 0.22;
  const inset = 0;
  const rx = Math.min(Math.max(x, inset + radius), w - inset - radius);
  const ry = Math.min(Math.max(y, inset + radius), h - inset - radius);
  const distCorner = Math.hypot(x - rx, y - ry);
  const mask =
    distCorner <= radius
      ? Math.max(0, Math.min(1, (radius - distCorner) / 2 + 0.5))
      : (x >= inset && x <= w - inset && y >= inset && y <= h - inset ? 1 : 0);
  if (mask <= 0) return [0, 0, 0, 0];

  // gradient background (accent -> deep indigo)
  let r = lerp(0x7c, 0x4a, t);
  let g = lerp(0x8c, 0x54, t);
  let b = lerp(0xff, 0xe6, t);

  const cx = w / 2;
  const cy = h / 2;
  // white ring
  const ringOuter = smoothCircleAlpha(x, y, cx, cy, w * 0.3, w * 0.01);
  const ringInner = smoothCircleAlpha(x, y, cx, cy, w * 0.19, w * 0.01);
  const ring = Math.max(0, ringOuter - ringInner);
  if (ring > 0) {
    r = lerp(r, 0xff, ring);
    g = lerp(g, 0xff, ring);
    b = lerp(b, 0xff, ring);
  }
  // accent pupil
  const pupil = smoothCircleAlpha(x, y, cx, cy, w * 0.1, w * 0.01);
  if (pupil > 0) {
    r = lerp(r, 0x58, pupil);
    g = lerp(g, 0xe6, pupil);
    b = lerp(b, 0xc8, pupil);
  }
  return [r, g, b, Math.round(mask * 255)];
}

function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, 'trayTemplate.png'), make(32, 32, trayPainter));
  fs.writeFileSync(path.join(OUT, 'trayTemplate@2x.png'), make(64, 64, trayPainter));
  fs.writeFileSync(path.join(OUT, 'icon.png'), make(1024, 1024, iconPainter));
  console.log('✓ Wrote trayTemplate.png, trayTemplate@2x.png, icon.png to assets/');
}

main();
