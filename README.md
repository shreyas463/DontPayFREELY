# FreelyCluely

An open-source, stealth AI overlay assistant for macOS — a working replica of [Cluely](https://cluely.com).

It floats a **transparent, always-on-top window** that is **invisible to screen sharing and recording**, watches your screen (screenshots), listens to your audio (local transcription), and feeds that context to an LLM to give you real-time answers — all driven by global hotkeys.

> Built as a technical/educational project. Use it responsibly and only where you're permitted to.

---

## What works

- **Stealth overlay** — frameless, translucent, always-on-top, follows you across spaces, excluded from screen capture via Electron `setContentProtection`.
- **Menu-bar control** — a tray icon (the Dock icon is hidden) to show/hide, ask, listen, toggle click-through, open settings, and quit.
- **Screenshot understanding** — captures the primary display and sends it to a vision model.
- **Live transcription** — microphone audio → 16 kHz WAV chunks → **local Whisper** (whisper.cpp), no cloud. Pick any input device (route a loopback device for system audio).
- **Real-time answers** — streaming responses, **Markdown-rendered** (code blocks, lists, bold), with one-click copy.
- **Global hotkeys** — toggle, ask, listen, move, click-through, clear, quit.
- **Click-through mode** — let mouse events pass through the overlay.
- **In-app settings** — switch AI provider/model, Whisper model, input device, chunk length, and opacity without touching JSON.
- **Permission handling** — detects missing Screen Recording / Microphone access and deep-links you to the right macOS pane.
- **Window memory** — remembers its last position and size.
- **Pluggable AI** — ships with a zero-config **mock** provider; drop in **Claude**, **OpenAI**, or **Gemini** by picking it in settings + adding an API key.

## Quick start

```bash
npm install          # installs Electron (+ tries nodejs-whisper)
npm start            # launches the overlay
```

On first launch you get the stealth overlay with the **mock** AI provider — the entire pipeline (overlay, screenshots, hotkeys, transcription) works with **no API keys**.

### Enable local transcription

```bash
npm run whisper:setup    # installs/builds whisper.cpp + downloads a model (needs cmake + Xcode CLT)
```

### Enable a real LLM

1. `cp .env.example .env` and add the key for your provider.
2. Set the provider in `config/default.json` (or `~/.freelycluely/config.json`):
   ```json
   { "ai": { "provider": "anthropic" } }
   ```
   Options: `anthropic`, `openai`, `gemini`.
3. Restart.

## Default hotkeys

| Action | Shortcut |
|---|---|
| Show / hide overlay | ⌘ \ |
| Ask about screen (screenshot) | ⌘ Enter |
| Quick ask (focus input) | ⌘ ⇧ Space |
| Toggle listening | ⌘ ⇧ L |
| Toggle click-through | ⌘ ⇧ M |
| Clear context | ⌘ ⇧ K |
| Move overlay | ⌘ + arrows |
| Quit | ⌘ ⇧ Q |

All remappable in the config file.

## macOS permissions

- **Screen Recording** — required for screenshots (System Settings → Privacy & Security → Screen Recording → enable your terminal/Electron).
- **Microphone** — required for transcription.

## Architecture

```
src/
├── main/                 # Electron main process
│   ├── main.js           # lifecycle, IPC, orchestration
│   ├── window.js         # stealth overlay window (content protection, always-on-top)
│   ├── tray.js           # menu-bar icon + context menu
│   ├── permissions.js    # macOS screen/mic permission checks + deep links
│   ├── shortcuts.js      # global hotkeys
│   ├── screenshot.js     # desktopCapturer screen capture
│   ├── transcription.js  # local Whisper (whisper.cpp) wrapper
│   ├── config.js         # layered config (defaults + user overrides)
│   └── ai/
│       ├── index.js      # provider abstraction + graceful fallback
│       └── providers/    # mock, anthropic, openai, gemini
├── preload/preload.js    # safe IPC bridge (contextIsolation)
└── renderer/             # overlay UI (HTML/CSS/JS)
    ├── renderer.js       # UI logic, audio capture + WAV encoding
    └── markdown.js       # tiny XSS-safe Markdown renderer

assets/                   # generated app + tray icons (npm run icons)
build/                    # electron-builder entitlements
scripts/                  # icon generator, whisper setup
```

## Packaging a distributable

```bash
npm run icons            # regenerate icons from code
npm run dist             # build a signed-ish .dmg + .zip into dist/ (macOS)
npm run dist:dir         # unpacked .app for quick local testing
```

`electron-builder` is configured in `package.json` (`build`): universal mac targets, hardened-runtime entitlements in `build/entitlements.mac.plist`, `LSUIElement` so it runs as a menu-bar accessory, and the mic/screen usage strings macOS requires.

### Notes on system audio

Microphone capture works out of the box. Capturing **system/output audio** (the other side of a call) on macOS requires a loopback device such as [BlackHole](https://github.com/ExistentialAudio/BlackHole) or ScreenCaptureKit; route it to an input and select it as the mic. This is a macOS limitation, not an app one.

## License

MIT
