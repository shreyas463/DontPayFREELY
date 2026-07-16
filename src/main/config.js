'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_CONFIG_PATH = path.join(__dirname, '..', '..', 'config', 'default.json');
const USER_CONFIG_DIR = path.join(os.homedir(), '.freelycluely');
const USER_CONFIG_PATH = path.join(USER_CONFIG_DIR, 'config.json');

function deepMerge(base, override) {
  if (Array.isArray(base) || Array.isArray(override)) return override ?? base;
  if (typeof base !== 'object' || base === null) return override ?? base;
  const out = { ...base };
  for (const key of Object.keys(override || {})) {
    if (
      typeof override[key] === 'object' &&
      override[key] !== null &&
      !Array.isArray(override[key]) &&
      typeof base[key] === 'object'
    ) {
      out[key] = deepMerge(base[key], override[key]);
    } else {
      out[key] = override[key];
    }
  }
  return out;
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    return null;
  }
}

let cached = null;

function loadConfig() {
  if (cached) return cached;
  const defaults = readJson(DEFAULT_CONFIG_PATH) || {};
  const user = readJson(USER_CONFIG_PATH) || {};
  cached = deepMerge(defaults, user);
  return cached;
}

function saveUserConfig(partial) {
  const current = readJson(USER_CONFIG_PATH) || {};
  const merged = deepMerge(current, partial);
  if (!fs.existsSync(USER_CONFIG_DIR)) {
    fs.mkdirSync(USER_CONFIG_DIR, { recursive: true });
  }
  fs.writeFileSync(USER_CONFIG_PATH, JSON.stringify(merged, null, 2), 'utf8');
  cached = deepMerge(loadDefaultsOnly(), merged);
  return cached;
}

function loadDefaultsOnly() {
  return readJson(DEFAULT_CONFIG_PATH) || {};
}

function reload() {
  cached = null;
  return loadConfig();
}

module.exports = {
  loadConfig,
  saveUserConfig,
  reload,
  USER_CONFIG_DIR,
  USER_CONFIG_PATH,
};
