#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin', 'arkpets-codex.cjs');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const models = [
  {
    source: '/Users/psy/workspace/code/Ark-Models/models/002_amiya',
    id: 'amiya',
    displayName: 'Amiya',
  },
  {
    source: '/Users/psy/workspace/code/Ark-Models/models/4179_monstr',
    id: 'monstr',
    displayName: 'Monstr',
  },
  {
    source: '/Users/psy/workspace/code/Ark-Models/models/4182_oblvns_avemujica#1',
    id: 'oblvns-avemujica',
    displayName: 'Oblvns Ave Mujica',
  },
  {
    source: '/Users/psy/workspace/code/Ark-Models/models/2025_shu',
    id: 'shu',
    displayName: 'Shu',
  },
  {
    source: '/Users/psy/workspace/code/Ark-Models/models/003_kalts_sale#14',
    id: 'kaltsit-sale',
    displayName: "Kal'tsit Sale",
  },
];

for (const model of models) {
  const args = [
    CLI,
    'export',
    model.source,
    '--id',
    model.id,
    '--display-name',
    model.displayName,
    '--chrome',
    CHROME,
    '--out',
    path.join(ROOT, 'dist', model.id),
    '--install',
  ];
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
