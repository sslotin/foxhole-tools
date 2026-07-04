import { positionsStockpile } from './data/positions-stockpile.js';
import { positionsInventory } from './data/positions-inventory.js';

function codeNameAtPos(lines, i) {
  return lines[i - 1]?.trim() || '';
}

export function parseCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length === 0) throw new Error('CSV is empty');

  // Header: "Hex - Subhex - Type - Name - X: 0.xxx Y: 0.yyy,date"
  const header = lines[0].split(',')[0];
  const coordsMatch = header.match(/ - X: ([\d.]+) Y: ([\d.]+)$/);
  let coords = null;
  let headerBody = header;
  if (coordsMatch) {
    coords = coordsMatch[0].slice(3);
    headerBody = header.slice(0, coordsMatch.index);
  }

  const segments = headerBody.split(' - ');
  const hex = segments[0] || '';
  const subhex = segments[1] || '';
  const stockpileType = segments.length >= 3 ? segments[segments.length - 2] : '';
  const stockpileName = segments.length >= 3 ? segments[segments.length - 1] : '';

  // Stockpiles have ~430 lines, inventories ~220
  const isStockpile = lines.length > 400;
  const posLines = isStockpile ? positionsStockpile : positionsInventory;

  const items = {};

  for (let i = 1; i < lines.length; i++) {
    const codeName = codeNameAtPos(posLines, i);
    if (!codeName) continue;

    const line = lines[i];
    const idx = line.lastIndexOf(',');
    if (idx === -1) continue;

    const count = parseInt(line.substring(idx + 1).trim(), 10);
    if (isNaN(count)) continue;

    const key = isStockpile ? codeName + '-crated' : codeName;
    if (!items[key]) {
      items[key] = { count };
    } else {
      items[key].count += count;
    }
  }

  if (Object.keys(items).length === 0) {
    throw new Error('CSV contains no items');
  }

  return { hex, subhex, stockpileName, stockpileType, coords, items, isStockpile };
}