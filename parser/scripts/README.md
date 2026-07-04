# Game Update Workflow

## Quick Status (Jul 5, 2026)

| Script | Status |
|---|---|
| `process-game-data.js` | Last run: Jul 5. **433 items** in `metadata.json` (224 items, 176 vehicles, 33 structures) |
| `generate-positions` | Last run: Jul 5. **433 stockpile** + **219 inventory** positions. All English CSVs pass `--check` (0 unknown). |
| Coverage | 380/433 metadata items in position tables (88%). 53 uncovered — event vehicles, trains, ships not in standard CSVs. |

**Quick commands:**
- `npm run check-diff -- parser/examples/u64_stockpile.csv` — verify stockpile CSV vs metadata
- `npm run check-diff -- parser/examples/u64_base.csv` — verify base/inventory CSV vs metadata
- `npm run generate-positions` — rebuild position tables from the two canonical CSVs
- `node parser/scripts/process-game-data.js` — extract icons + metadata from game exports (can take ~60s, needs game_data/ exports)

---

## Step-by-step

### 1. Update reference CSVs

Copy fresh CSVs from the game into `parser/examples/`. You need at least:

- A **stockpile** CSV (seaport or storage depot, ~430 lines)
- A **base/inventory** CSV (frontline bunker base, ~220 lines)

Name them `u64_stockpile.csv` and `u64_base.csv` respectively (overwrite the
existing files).

### 2. Check diff against metadata

```sh
npm run check-diff -- parser/examples/u64_stockpile.csv
```

This lists any item display names in the CSV that aren't in `metadata.json`.
Unknown items are likely new game additions or renames.

### 3. Rebuild position tables

```sh
npm run generate-positions
```

This reads `examples/u64_stockpile.csv` and `examples/u64_base.csv`, matches each line
against `metadata.json` by display name, and writes `data/positions-*.js`.

Any **UNMAPPED** items printed during this step are display names in the CSV
that don't match anything in `metadata.json`. These are likely new game items
that need to be added to `metadata.json` first.

### 4. Iterative fixes

After adding new items to `metadata.json`, re-run:

```sh
npm run check-diff -- parser/examples/u64_stockpile.csv
npm run generate-positions
```

### 5. Finalize

When `check-diff` exits with code 0 (all items known in metadata):

```sh
npm run build
```

## Script reference

| Script | Purpose |
|---|---|
| `generate-positions.mjs` | Default: rebuild `data/positions-*.js`. With `--check <csv>`: compare CSV against metadata, show unknown items |
| `process-game-data.js` | Extract icons + metadata from game export files (rarely needed) |