#!/usr/bin/env node

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');

const ROOT = path.resolve(__dirname, '..');
const VIEWER_ROOT = path.join(ROOT, 'viewer');
const CELL_WIDTH = 192;
const CELL_HEIGHT = 208;
const COLUMNS = 8;
const ROWS = 9;
const ATLAS_WIDTH = COLUMNS * CELL_WIDTH;
const ATLAS_HEIGHT = ROWS * CELL_HEIGHT;

const ROW_SPECS = [
  { state: 'idle', frames: 6, role: 'idle' },
  { state: 'running-right', frames: 8, role: 'move' },
  { state: 'running-left', frames: 8, role: 'move', mirror: true },
  { state: 'waving', frames: 4, role: 'interact' },
  { state: 'jumping', frames: 5, role: 'jump' },
  { state: 'failed', frames: 8, role: 'failed' },
  { state: 'waiting', frames: 6, role: 'wait' },
  { state: 'running', frames: 6, role: 'work' },
  { state: 'review', frames: 6, role: 'review' },
];

function usage(exitCode = 0) {
  console.log(`Usage:
  arkpets-codex export <model-dir> --id <pet-id> --display-name <name> [options]

Options:
  --out <dir>             Output directory. Default: dist/<pet-id>
  --description <text>    pet.json description
  --chrome <path>         Chrome/Chromium executable path
  --install               Copy pet.json and spritesheet.webp to ~/.codex/pets/<pet-id>
  --help                  Show this help
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  if (argv[2] === '--help' || argv[2] === '-h') usage(0);
  if (argv[2] !== 'export') usage(1);
  const modelDir = argv[3];
  if (!modelDir || modelDir.startsWith('--')) usage(1);

  const options = {
    command: 'export',
    modelDir: path.resolve(modelDir),
    install: false,
  };

  for (let index = 4; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--install') {
      options.install = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') usage(0);
    const next = argv[index + 1];
    if (!next) throw new Error(`missing value for ${arg}`);
    if (arg === '--id') options.id = next;
    else if (arg === '--display-name') options.displayName = next;
    else if (arg === '--out') options.out = path.resolve(next);
    else if (arg === '--description') options.description = next;
    else if (arg === '--chrome') options.chrome = next;
    else throw new Error(`unknown option: ${arg}`);
    index += 1;
  }

  if (!options.id) throw new Error('missing --id');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(options.id)) {
    throw new Error('--id must use lowercase letters, numbers, and hyphens');
  }
  if (!options.displayName) throw new Error('missing --display-name');
  options.out ??= path.join(process.cwd(), 'dist', options.id);
  options.description ??= `${options.displayName} from Ark-Models, rendered from Spine into a Codex custom pet.`;
  return options;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html';
  if (filePath.endsWith('.js')) return 'text/javascript';
  if (filePath.endsWith('.png')) return 'image/png';
  if (filePath.endsWith('.atlas')) return 'text/plain';
  if (filePath.endsWith('.skel')) return 'application/octet-stream';
  return 'application/octet-stream';
}

function vendorPath(name) {
  const mapping = {
    'pixi.js': ['pixi.js', 'dist/pixi.js'],
    'base.js': ['@pixi-spine/base', 'dist/base.js'],
    'runtime-3.7.js': ['@pixi-spine/runtime-3.7', 'dist/runtime-3.7.js'],
    'runtime-3.8.js': ['@pixi-spine/runtime-3.8', 'dist/runtime-3.8.js'],
    'runtime-4.1.js': ['@pixi-spine/runtime-4.1', 'dist/runtime-4.1.js'],
    'loader-base.js': ['@pixi-spine/loader-base', 'dist/loader-base.js'],
    'loader-uni.js': ['@pixi-spine/loader-uni', 'dist/loader-uni.js'],
  };
  const entry = mapping[name];
  if (!entry) return null;
  const [packageName, relativeFile] = entry;
  const packageEntry = require.resolve(packageName);
  const packageRoot = packageEntry.includes(`${path.sep}lib${path.sep}`)
    ? path.dirname(path.dirname(packageEntry))
    : path.dirname(packageEntry);
  return path.join(packageRoot, relativeFile);
}

function startServer(assetRoot) {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const requestedPath = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);

    let filePath;
    if (requestedPath.startsWith('/vendor/')) {
      filePath = vendorPath(path.basename(requestedPath));
    } else if (requestedPath.startsWith('/assets/')) {
      filePath = path.normalize(path.join(assetRoot, requestedPath.slice('/assets/'.length)));
      if (!filePath.startsWith(assetRoot)) filePath = null;
    } else {
      filePath = path.normalize(path.join(VIEWER_ROOT, requestedPath));
      if (!filePath.startsWith(VIEWER_ROOT)) filePath = null;
    }

    if (!filePath) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }

    fs.readFile(filePath, (error, bytes) => {
      if (error) {
        response.writeHead(404);
        response.end('Not found');
        return;
      }
      response.writeHead(200, { 'Content-Type': contentType(filePath) });
      response.end(bytes);
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function prepareAssets(modelDir, outDir) {
  const files = fs.readdirSync(modelDir);
  const skel = files.find((file) => file.endsWith('.skel'));
  const atlas = files.find((file) => file.endsWith('.atlas'));
  const png = files.find((file) => file.endsWith('.png'));
  if (!skel || !atlas || !png) {
    throw new Error(`expected .skel, .atlas, and .png in ${modelDir}`);
  }

  const assetRoot = path.join(outDir, '.capture-assets');
  ensureDir(assetRoot);
  fs.copyFileSync(path.join(modelDir, skel), path.join(assetRoot, 'model.skel'));
  fs.copyFileSync(path.join(modelDir, png), path.join(assetRoot, 'model.png'));

  const atlasText = fs.readFileSync(path.join(modelDir, atlas), 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim().endsWith('.png') ? 'model.png' : line)
    .join('\n');
  fs.writeFileSync(path.join(assetRoot, 'model.atlas'), atlasText);
  return assetRoot;
}

function pickAnimation(animations, role) {
  const names = animations.map((name) => ({ name, lower: name.toLowerCase() }));
  const first = (...patterns) => {
    for (const pattern of patterns) {
      const found = names.find(({ lower }) => pattern.test(lower));
      if (found) return found.name;
    }
    return null;
  };

  if (role === 'idle') return first(/relax/, /idle/, /default/, /wait/, /sit/) ?? animations[0];
  if (role === 'move') return first(/move/, /run/, /walk/) ?? pickAnimation(animations, 'idle');
  if (role === 'interact') return first(/interact/, /attack/, /skill/, /start/, /touch/, /special/, /relax/) ?? pickAnimation(animations, 'idle');
  if (role === 'jump') return first(/jump/, /move/, /run/, /walk/) ?? pickAnimation(animations, 'idle');
  if (role === 'failed') return first(/sleep/, /die/, /fail/, /down/, /sit/) ?? pickAnimation(animations, 'idle');
  if (role === 'wait') return first(/sit/, /wait/, /relax/, /idle/) ?? pickAnimation(animations, 'idle');
  if (role === 'work') return first(/default/, /interact/, /special/, /relax/, /idle/) ?? pickAnimation(animations, 'idle');
  if (role === 'review') return first(/sit/, /relax/, /idle/, /default/) ?? pickAnimation(animations, 'idle');
  return animations[0];
}

function dataUrlToBuffer(dataUrl) {
  return Buffer.from(dataUrl.replace(/^data:[^;]+;base64,/, ''), 'base64');
}

function dataUrlToPng(dataUrl) {
  return PNG.sync.read(dataUrlToBuffer(dataUrl));
}

function normalizeTransparentRgb(png) {
  for (let index = 0; index < png.data.length; index += 4) {
    if (png.data[index + 3] === 0) {
      png.data[index] = 0;
      png.data[index + 1] = 0;
      png.data[index + 2] = 0;
    }
  }
}

function pasteCell(atlas, cell, row, column) {
  for (let y = 0; y < CELL_HEIGHT; y += 1) {
    for (let x = 0; x < CELL_WIDTH; x += 1) {
      const source = (y * CELL_WIDTH + x) * 4;
      const target = ((row * CELL_HEIGHT + y) * atlas.width + column * CELL_WIDTH + x) * 4;
      atlas.data[target] = cell.data[source];
      atlas.data[target + 1] = cell.data[source + 1];
      atlas.data[target + 2] = cell.data[source + 2];
      atlas.data[target + 3] = cell.data[source + 3];
    }
  }
}

function validateAtlas(atlas) {
  if (atlas.width !== ATLAS_WIDTH || atlas.height !== ATLAS_HEIGHT) {
    throw new Error(`expected ${ATLAS_WIDTH}x${ATLAS_HEIGHT}, got ${atlas.width}x${atlas.height}`);
  }
  const errors = [];
  for (let row = 0; row < ROW_SPECS.length; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      let nonTransparent = 0;
      for (let y = 0; y < CELL_HEIGHT; y += 1) {
        for (let x = 0; x < CELL_WIDTH; x += 1) {
          const index = ((row * CELL_HEIGHT + y) * atlas.width + column * CELL_WIDTH + x) * 4;
          if (atlas.data[index + 3] !== 0) nonTransparent += 1;
          if (atlas.data[index + 3] === 0 && (atlas.data[index] || atlas.data[index + 1] || atlas.data[index + 2])) {
            errors.push(`transparent RGB residue at row ${row}, column ${column}`);
          }
        }
      }
      const used = column < ROW_SPECS[row].frames;
      if (used && nonTransparent < 50) errors.push(`${ROW_SPECS[row].state} column ${column} is empty`);
      if (!used && nonTransparent !== 0) errors.push(`${ROW_SPECS[row].state} unused column ${column} is not empty`);
    }
  }
  if (errors.length) throw new Error(errors.slice(0, 5).join('\n'));
}

function makeContactSheet(atlas, outPath) {
  const scale = 0.5;
  const labelHeight = 24;
  const sheet = new PNG({
    width: Math.round(ATLAS_WIDTH * scale),
    height: Math.round(ATLAS_HEIGHT * scale + ROWS * labelHeight),
    colorType: 6,
  });
  sheet.data.fill(255);

  for (let y = 0; y < sheet.height; y += 1) {
    for (let x = 0; x < sheet.width; x += 1) {
      const index = (y * sheet.width + x) * 4;
      const checker = (Math.floor(x / 12) + Math.floor(y / 12)) % 2 === 0 ? 238 : 220;
      sheet.data[index] = checker;
      sheet.data[index + 1] = checker;
      sheet.data[index + 2] = checker;
      sheet.data[index + 3] = 255;
    }
  }

  for (let row = 0; row < ROWS; row += 1) {
    const rowOffsetY = row * (Math.round(CELL_HEIGHT * scale) + labelHeight) + labelHeight;
    for (let column = 0; column < COLUMNS; column += 1) {
      for (let y = 0; y < Math.round(CELL_HEIGHT * scale); y += 1) {
        for (let x = 0; x < Math.round(CELL_WIDTH * scale); x += 1) {
          const sourceX = column * CELL_WIDTH + Math.floor(x / scale);
          const sourceY = row * CELL_HEIGHT + Math.floor(y / scale);
          const source = (sourceY * atlas.width + sourceX) * 4;
          const targetX = column * Math.round(CELL_WIDTH * scale) + x;
          const targetY = rowOffsetY + y;
          const target = (targetY * sheet.width + targetX) * 4;
          const alpha = atlas.data[source + 3] / 255;
          sheet.data[target] = Math.round(atlas.data[source] * alpha + sheet.data[target] * (1 - alpha));
          sheet.data[target + 1] = Math.round(atlas.data[source + 1] * alpha + sheet.data[target + 1] * (1 - alpha));
          sheet.data[target + 2] = Math.round(atlas.data[source + 2] * alpha + sheet.data[target + 2] * (1 - alpha));
          sheet.data[target + 3] = 255;
        }
      }
    }
  }
  fs.writeFileSync(outPath, PNG.sync.write(sheet));
}

async function encodeWebp(page, pngPath, webpPath) {
  const dataUrl = `data:image/png;base64,${fs.readFileSync(pngPath).toString('base64')}`;
  const webpDataUrl = await page.evaluate(async (source) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0);
    return canvas.toDataURL('image/webp', 1);
  }, dataUrl);
  fs.writeFileSync(webpPath, dataUrlToBuffer(webpDataUrl));
}

async function exportPet(options) {
  ensureDir(options.out);
  const assetRoot = prepareAssets(options.modelDir, options.out);
  const server = await startServer(assetRoot);
  const { port } = server.address();
  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  };
  if (options.chrome) launchOptions.executablePath = options.chrome;

  const browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 320, height: 320 }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (message) => logs.push(`${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => logs.push(`pageerror: ${error.message}`));

  await page.goto(`http://127.0.0.1:${port}/?asset=${encodeURIComponent('/assets/model.skel')}`, { waitUntil: 'networkidle' });
  try {
    await page.waitForFunction(() => Boolean(window.arkpetsCapture), null, { timeout: 15000 });
  } catch (error) {
    throw new Error(`viewer did not initialize: ${error.message}\n${logs.join('\n')}`);
  }

  const info = await page.evaluate(() => ({
    animations: window.arkpetsCapture.animations,
    animationInfo: window.arkpetsCapture.animationInfo,
    runtime: window.arkpetsCapture.runtime,
    globals: window.arkpetsCapture.globals,
  }));

  const atlas = new PNG({ width: ATLAS_WIDTH, height: ATLAS_HEIGHT, colorType: 6 });
  atlas.data.fill(0);
  const framesRoot = path.join(options.out, 'frames');
  ensureDir(framesRoot);
  const rowMappings = ROW_SPECS.map((spec) => ({
    spec,
    animation: pickAnimation(info.animations, spec.role),
  }));
  const idleMapping = rowMappings.find(({ spec }) => spec.state === 'idle') ?? rowMappings[0];
  const idleAnimationInfo = info.animationInfo.find(({ name }) => name === idleMapping.animation);
  const idleDuration = Math.max(idleAnimationInfo?.duration ?? 0, 0.001);
  const sizeBasisFit = await page.evaluate(
    ({ animation, duration }) => window.arkpetsCapture.measureFit(animation, duration),
    { animation: idleMapping.animation, duration: idleDuration },
  );
  const mappings = [];

  for (let row = 0; row < rowMappings.length; row += 1) {
    const { spec, animation } = rowMappings[row];
    mappings.push({ state: spec.state, animation, frames: spec.frames, mirror: Boolean(spec.mirror) });
    const stateDir = path.join(framesRoot, spec.state);
    ensureDir(stateDir);
    const dataUrls = await page.evaluate((captureOptions) => window.arkpetsCapture.capture(captureOptions), {
      animation,
      frames: spec.frames,
      mirror: Boolean(spec.mirror),
      fit: sizeBasisFit,
    });
    for (let column = 0; column < dataUrls.length; column += 1) {
      const frame = dataUrlToPng(dataUrls[column]);
      normalizeTransparentRgb(frame);
      fs.writeFileSync(path.join(stateDir, `${String(column).padStart(2, '0')}.png`), PNG.sync.write(frame));
      pasteCell(atlas, frame, row, column);
    }
  }

  normalizeTransparentRgb(atlas);
  validateAtlas(atlas);

  const spritesheetPng = path.join(options.out, 'spritesheet.png');
  const spritesheetWebp = path.join(options.out, 'spritesheet.webp');
  fs.writeFileSync(spritesheetPng, PNG.sync.write(atlas));
  await encodeWebp(page, spritesheetPng, spritesheetWebp);

  const petJson = {
    id: options.id,
    displayName: options.displayName,
    description: options.description,
    spritesheetPath: 'spritesheet.webp',
  };
  fs.writeFileSync(path.join(options.out, 'pet.json'), `${JSON.stringify(petJson, null, 2)}\n`);
  fs.writeFileSync(path.join(options.out, 'mapping.json'), `${JSON.stringify({
    id: options.id,
    displayName: options.displayName,
    modelDir: options.modelDir,
    runtime: info.runtime,
    globals: info.globals,
    animations: info.animationInfo,
    sizeBasis: {
      state: idleMapping.spec.state,
      animation: idleMapping.animation,
      fit: sizeBasisFit,
    },
    mappings,
  }, null, 2)}\n`);
  makeContactSheet(atlas, path.join(options.out, 'contact-sheet.png'));

  if (options.install) {
    const installDir = path.join(os.homedir(), '.codex', 'pets', options.id);
    ensureDir(installDir);
    fs.copyFileSync(path.join(options.out, 'pet.json'), path.join(installDir, 'pet.json'));
    fs.copyFileSync(spritesheetWebp, path.join(installDir, 'spritesheet.webp'));
  }

  await browser.close();
  server.close();

  return { output: options.out, runtime: info.runtime, animations: info.animations, mappings, installed: options.install };
}

(async () => {
  try {
    const options = parseArgs(process.argv);
    const result = await exportPet(options);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
})();
