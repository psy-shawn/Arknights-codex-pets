# Deployment Guide

This guide records the repositories and tools needed to reproduce the Ark-Models to Codex pet workflow.

## Git Repositories

### Arkpets Codex

This repository contains the converter:

```bash
git clone <your-fork-or-share-url> Arkpets-codex
cd Arkpets-codex
```

If you are using the local working copy from this Codex session:

```bash
cd /Users/psy/workspace/code/Arkpets-codex
```

### Ark-Models

Source Spine assets come from:

```bash
git clone https://github.com/isHarryh/Ark-Models.git
```

Expected model layout:

```text
Ark-Models/
└── models/
    └── 002_amiya/
        ├── build_char_002_amiya.atlas
        ├── build_char_002_amiya.png
        └── build_char_002_amiya.skel
```

## Toolchain

### Node.js

Install Node.js 20 or newer.

macOS with Homebrew:

```bash
brew install node
node -v
npm -v
```

### Chrome Or Chromium

The converter renders Spine animations in a real browser. There are two supported options.

Use system Google Chrome:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --version
```

Or install Playwright's bundled Chromium:

```bash
npx playwright install chromium
```

When using system Chrome, pass:

```bash
--chrome "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

When using bundled Chromium, omit `--chrome`.

### NPM Dependencies

From the Arkpets Codex repository:

```bash
npm install
```

Important packages:

- `pixi.js@7`: browser renderer
- `pixi-spine@4`: Spine 3.7/3.8/4.0/4.1 runtimes for PixiJS v7
- `playwright`: browser automation
- `pngjs`: PNG decoding, atlas composition, and validation

## First Run

```bash
node bin/arkpets-codex.cjs export /path/to/Ark-Models/models/002_amiya \
  --id amiya \
  --display-name "Amiya" \
  --chrome "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --out dist/amiya
```

Inspect:

```text
dist/amiya/contact-sheet.png
```

Install into Codex:

```bash
node bin/arkpets-codex.cjs export /path/to/Ark-Models/models/002_amiya \
  --id amiya \
  --display-name "Amiya" \
  --chrome "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --install
```

Codex custom pets are installed to:

```text
~/.codex/pets/<pet-id>/
├── pet.json
└── spritesheet.webp
```

Restart Codex after installing new pets.

## Known Compatibility Notes

- Ark-Models `.skel` files commonly report Spine `3.8.99`.
- This converter explicitly loads `PIXI.spine38.Spine`.
- Do not use PixiJS v8 with `pixi-spine@4`; PixiJS v8 requires a different Spine integration.
- Ark-Models filenames may include `#`. The converter copies assets to safe temporary names and rewrites the atlas page name to avoid URL fragment bugs.
- The converter advances Spine animations with `spine.update(delta)`. Capturing setup pose directly produces folded or misplaced body parts.

## Common Errors

### `viewer did not initialize`

Usually means Chrome could not load the model or runtime files. Check the printed browser logs.

### `expected .skel, .atlas, and .png`

The selected model directory does not contain the required Ark-Models asset triplet.

### `Executable doesn't exist` from Playwright

Either install bundled Chromium:

```bash
npx playwright install chromium
```

Or pass your system Chrome path with `--chrome`.

### Parts Are Folded Or Misplaced

Confirm the generated `mapping.json` says:

```json
"runtime": "PIXI.spine38.Spine"
```

Also confirm you are using this converter's current `viewer/capture.js`, not an older script that manually set `trackTime` without advancing the Spine state.
