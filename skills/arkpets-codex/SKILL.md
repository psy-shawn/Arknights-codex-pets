---
name: arkpets-codex
description: Convert Ark-Models Spine character folders into Codex custom pets using the Arkpets-codex CLI, including setup checks, Chrome/Playwright rendering, contact-sheet review, and installation to ~/.codex/pets.
metadata:
  short-description: Turn Ark-Models Spine assets into Codex pets
---

# Arkpets Codex

Use this skill when the user asks to convert Arknights / Ark-Models character assets into a Codex custom pet.

## Expected Inputs

The user should provide one or more Ark-Models character directories, each containing:

```text
*.skel
*.atlas
*.png
```

Example:

```text
/Users/psy/workspace/code/Ark-Models/models/002_amiya
```

## Required Local Repositories

Converter repository:

```text
/Users/psy/workspace/code/Arkpets-codex
```

Ark-Models source repository:

```text
https://github.com/isHarryh/Ark-Models.git
```

If `Ark-Models` is missing, tell the user to clone it:

```bash
git clone https://github.com/isHarryh/Ark-Models.git
```

## Setup Checks

Before exporting, check:

```bash
node -v
npm -v
test -d node_modules
```

If dependencies are missing in `/Users/psy/workspace/code/Arkpets-codex`, run:

```bash
npm install
```

If Playwright's browser is missing, either use system Chrome:

```text
/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
```

or install bundled Chromium:

```bash
npx playwright install chromium
```

Network installs require user approval.

## Export Workflow

Run from the converter repository:

```bash
node bin/arkpets-codex.cjs export <model-dir> \
  --id <pet-id> \
  --display-name "<Pet Name>" \
  --chrome "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --out dist/<pet-id>
```

Inspect:

```text
dist/<pet-id>/contact-sheet.png
dist/<pet-id>/mapping.json
```

If the contact sheet looks correct, install:

```bash
node bin/arkpets-codex.cjs export <model-dir> \
  --id <pet-id> \
  --display-name "<Pet Name>" \
  --chrome "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --install
```

Installed files:

```text
~/.codex/pets/<pet-id>/pet.json
~/.codex/pets/<pet-id>/spritesheet.webp
```

Tell the user to restart Codex after installing.

## Naming

Use lowercase kebab-case for pet ids:

```text
amiya
kaltsit-sale
oblvns-avemujica
```

Use a readable display name in `--display-name`.

## Important Implementation Details

- Ark-Models `.skel` files commonly use Spine `3.8.99`.
- The converter must use PixiJS v7 + pixi-spine v4.
- The viewer explicitly loads `PIXI.spine38.Spine`.
- The converter rewrites filenames with `#` to safe temporary names to avoid browser URL fragment bugs.
- Do not capture the setup pose. The viewer advances animation with `spine.update(delta)`.

## Troubleshooting

If body parts are folded or misplaced:

- Check `mapping.json` for `"runtime": "PIXI.spine38.Spine"`.
- Check `contact-sheet.png` before installing.
- Make sure the latest `viewer/capture.js` is used.

If Chrome cannot start:

- Pass `--chrome "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`.
- Or run `npx playwright install chromium`.

If the model with `#` in the filename fails:

- Use this converter rather than a direct static file server. It normalizes names to `model.skel`, `model.atlas`, and `model.png`.
