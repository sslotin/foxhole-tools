// ═══════════════════════════════════════════════════════════════════
// generate-positions.js — Position table generator
//
// IMPORTANT: The CSV files referenced below must be updated each update.
// Rename/overwrite u<version>_stockpile.csv and u<version>_base.csv with
// fresh exports from the current game version before running this script.
// ═══════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from 'fs';

const metadata = JSON.parse(readFileSync(new URL('../data/metadata.json', import.meta.url), 'utf-8'));

const nameToCode = {};
for (const [code, meta] of Object.entries(metadata)) {
  if (meta.displayName) nameToCode[meta.displayName] = code;
}

function parseDisplayName(line) {
  const idx = line.lastIndexOf(',');
  if (idx === -1) return null;

  let name = line.substring(0, idx).trim();
  if (name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1);
  if (!name || name.startsWith('Empty')) return null;

  if (name.endsWith('(Crate)')) {
    return name.substring(0, name.length - '(Crate)'.length).trim();
  }
  return name;
}

function extractPositions(csvPath) {
  const csv = readFileSync(new URL(csvPath, import.meta.url), 'utf-8');
  const lines = csv.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const positions = {};
  for (let i = 1; i < lines.length; i++) {
    const displayName = parseDisplayName(lines[i]);
    if (!displayName) continue;

    const codeName = nameToCode[displayName];
    if (!codeName) {
      console.log(`UNMAPPED at line ${i}: "${displayName}"`);
      continue;
    }
    positions[i] = codeName;
  }
  return positions;
}

function writePositionsFile(filename, varname, positions) {
  const maxPos = Math.max(...Object.keys(positions).map(Number), 0);
  const result = [];
  for (let i = 1; i <= maxPos; i++) {
    result.push(positions[i] || '');
  }
  const jsContent = `export const ${varname} = [
${result.map(v => JSON.stringify(v)).join(',\n')}
];\n`;
  writeFileSync(new URL(filename, import.meta.url), jsContent);
  console.log(`Written ${filename} — ${Object.keys(positions).length} positions, ${maxPos} lines`);
}

// ── --check flag: compare a CSV against metadata ──────────────────

if (process.argv.includes('--check')) {
  const csvPath = process.argv[process.argv.indexOf('--check') + 1];
  if (!csvPath) {
    console.error('Usage: node parser/scripts/generate-positions.mjs --check <csv-file>');
    process.exit(1);
  }

  const csv = readFileSync(csvPath, 'utf-8');
  const lines = csv.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  let found = 0;
  const notFound = [];

  for (let i = 1; i < lines.length; i++) {
    const displayName = parseDisplayName(lines[i]);
    if (!displayName) continue;

    if (nameToCode[displayName]) {
      found++;
    } else {
      notFound.push(displayName);
    }
  }

  if (notFound.length > 0) {
    console.log(`${notFound.length} item(s) not found in metadata:\n`);
    for (const name of notFound) console.log(`  ${name}`);
    console.log(`\n${found} item(s) found.`);
    process.exit(1);
  } else {
    console.log(`All ${found} item(s) found in metadata.`);
    process.exit(0);
  }
}

// ── Default: generate position tables ─────────────────────────────

const stockpilePositions = extractPositions('../examples/u65_stockpile.csv');
const inventoryPositions = extractPositions('../examples/u65_base.csv');

writePositionsFile('../data/positions-stockpile.js', 'positionsStockpile', stockpilePositions);
writePositionsFile('../data/positions-inventory.js', 'positionsInventory', inventoryPositions);