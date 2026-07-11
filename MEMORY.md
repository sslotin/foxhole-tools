# MEMORY.md — Project Context & Status

> **Dev-server note (read first):** The **user runs their own dev server at `:7173`** —
> the agent must **NEVER start, stop, or restart it** (and must not run a dev server on
> `:5173`/`:5174` either; those are stray and should be left alone/killed, not adopted).
> If a UI change does not appear, it is almost always a **stale Vite HMR / module-graph
> desync** (e.g. a `does not provide an export` error after several rapid source edits) —
> **not** a code bug. The fix is for the **user** to restart `npm run dev` (or `npx vite`)
> so the server re-transforms from scratch. When this happens, **advise the user to restart
> their server; do NOT restart it yourself.** Always `npm run build` first to confirm the
> code itself is valid (a clean build rules out a real syntax error).

Last updated: Jul 11, 2026 (energy import/produce toggle + sticky-hover focus + Facilities panel styling + docs accuracy pass).

## Recent UI changes (Jul 11, 2026)
- **Basic resources are terminal only while IMPORTED (Jul 11):** `BASIC_RESOURCES`
  (Metal, Coal, Sulfur, Components, Oil, Energy) stop the expansion *because they are
  imported by default* (the `DEFAULT_IMPORTED` set seeds `effectiveImports`), NOT because of a
  hard `BASIC_RESOURCES` check. `planner.mjs expandState` terminal condition is
  `imported.has(R) || recipesFor(R).length === 0` — `BASIC_RESOURCES.has(R)` was REMOVED. So a
  basic the user opts out of importing (via `toggleSkipAutoImport`, i.e. excluded from
  `effectiveImports`) or assigns a recipe to is **manufactured with its default recipe** — this
  is how a user "breaks down" a basic and explores further. Clicking a basic in the Imports list
  calls `toggleSkipAutoImport` (same net effect as `toggleImported` for non-basics: toggles
  imported↔produced); **hovering** a basic opens its recipe options in the right panel. Design
  principle from the user: basics are just the initial algorithm pass's stop condition; the user
  can explore deeper if they want.

- **Energy import↔produce toggle (store-coordinated, Jul 11):** `calc.energyImported`
  moves the pseudo-resource between *Imports* (shown only when imported mode has a deficit,
  `energyDeficitMWh > 1e-6`) and *Intermediates* (shown when `energyProducedMWh > 1e-6`, i.e.
  produced mode). The two controls that touch Energy live in **`store.mjs`** and stay consistent:
  - `toggleEnergy()` flips the flag AND clears any `selectedRecipes.Energy` (so the toggle is
    always authoritative — no stale selection can linger while imported, which would make a
    later re-click *unassign* instead of assign).
  - `chooseRecipe('Energy', recipe)` (assigning a power recipe) sets `energyImported = false`
    (an imported pseudo-resource can't also run a power plant); unassigning leaves the flag as-is.
  - `resolvePlan` makes **import mode authoritative**: when `energyImported` is true it forces
    `assigned.Energy = null` (the resolver ignores any selected power recipe, which is preserved
    in `selectedRecipes` and reactivates on produce). In produce mode a manual selection is kept,
    else the default power recipe. So: clicking the energy row toggles import↔produce; selecting a
    power recipe in the right panel produces with it (even from import mode); unassigning reverts
    to import/default. Fully tested in `facilities.test.mjs` + `store.test.mjs`.
- **Recipe-row click (right panel → `handleRecipePick` in `FacilityCalc.vue`):** clicking an
  *inactive* recipe PINs it (`chooseRecipe(item, r)`); clicking the *already-active* recipe
  **DEACTIVATES** it — clears the `selectedRecipes` pin AND **force-imports** the resource (adds
  it to `calc.imported` if missing; for basics removes it from `calc.skipAutoImport` if present).
  IMPORTANT: this is a FORCE-add, NOT a toggle. Using `toggleImported` here was a bug — when a
  resource was already imported *before* being pinned (e.g. Petrol imported, then switched to the
  Reformer which consumes Water), unassigning toggled it back OUT of imports, so it reverted to its
  default-produced recipe and stayed visible — looking like "can't unassign". Force-add keeps it
  imported. Regression test: `src/facility-calc/unassign-import.test.mjs` (7 cases, incl. the
  already-imported-before case for both Reformer and Oil Refinery, AND left-panel resource clicks).
- **Left-panel resource-row click (`handleInputClick`):** for a NON-basic resource it mirrors the
  recipe-row click. If the resource is **pinned** (manual `selectedRecipes[codeName]` set) it
  clears the pin AND force-imports (add if missing); otherwise it toggles import↔produce via
  `toggleImported`. The pin-clear is essential — `toggleImported` alone is overridden by the pin
  because `expandState` force-produces a pinned recipe, so clicking the resource looked like a
  no-op ("can't unassign Petrol"). Covered by the same `unassign-import.test.mjs` cases.
- **Sticky hover focus:** hovering a left-panel resource row sets `focused = codeName`; the right
  panel then filters to that resource's recipe options. `focused` persists while the mouse travels
  from the row left→right into the right panel (per-row `@mouseleave` was removed; focus only resets
  on leaving the whole `.fac-calc` root), so options stay visible while you move to click them.
- **Target change resets assigned recipes:** a `watch(() => calc.desired, …)` in
  `store.mjs` (deep + `flush: 'sync'`) clears `calc.selectedRecipes` whenever the target set
  or any target quantity changes — recipes are always recalculated from defaults for the new
  plan. (The watch source MUST be a getter, not the array object, or reassignment of
  `calc.desired` isn't tracked.) Import/energy mode flags (`imported`, `skipAutoImport`,
  `energyImported`) are mode preferences and are intentionally left untouched.

## Product Context

Logistical tools for Foxhole (online war game). Users paste CSVs from in-game bases into a web app to track supplies.

**Two base types:**
- **Frontline bases** (~220 lines) — individual items players use. Inventory mode: compact display, delta tracking, zero-count items hidden.
- **Storage depots** (~430 lines) — crates shipped in bulk (60 crates/container, 1-14 containers/vehicle). Stockpile mode: planning, source/target merging, shopping list auto-fill.

Items must be logically grouped (consumption is correlated). Also hosts an advanced logi guide at `public/guide/`.

---

## Stack & Structure

```
foxhole/
├── parser/                 # CSV/metadata module (Vue-independent)
│   ├── csv-parser.js       # CSV → structured items
│   ├── metadata.json       # 715 entries: codeName → {displayName, stats, recipes, ...}
│   ├── data/
│   │   ├── positions-stockpile.js   # 433 stockpile positions mapped
│   │   ├── positions-inventory.js   # 219 inventory positions mapped
│   │   ├── recipes.json            # Factory/MPF crate + facility conversion recipes
│   │   ├── missing.txt             # Missing game icon files & inconsistencies
│   ├── scripts/
│   │   ├── process-game-data.js    # ⭐ Unified: metadata + icons + recipes from game exports
│   │   ├── generate-positions.js   # Rebuild positions from CSVs + --check mode
│   │   └── README.md
│   └── examples/           # 7 sample CSVs (5 English, 2 Russian)
├── src/                    # Vue 3 app (Composition API, `<script setup>`)
│   ├── main.js → App.vue → components/
│   └── components/         # Item, Crate, Shippable, InventoryReport, StockpileReport, Filter, etc.
├── public/
│   ├── icons/              # Item icons (100×100 PNGs, subtype overlay composited in)
│   ├── guide/              # Advanced logi guide (static HTML)
│   └── tutorial.mp4
└── game_data/              # Game data exports (for process-game-data.js)
```

**Stack:** Vue 3 + Vite 6 + Sass + Vitest. `canvas` + `glob` are build-time deps only.

---

## Data Flow

### CSV Parsing
```
Paste → App.vue.addCSV(text) → parser/csv-parser.parseCSV(text)
  → Split lines, parse header (hex, subhex, type, owner, coords)
  → For each item line (index 1+): look up position array[i-1] → codeName
  → If stockpile (>400 lines): suffix codeName with "-crated"
  → Return { hex, subhex, stockpileName, stockpileType, coords, items, isStockpile }
```

**Position tables** (`positions-*.js`): arrays mapping 1-based line indices → codeNames. Generated by `generate-positions.mjs` from `metadata.json` + reference CSVs. Imported as ES modules — no `fs` dependency, works in browser. Avoids language-dependent name matching (Russian CSVs parse identically).

### Modes
| Mode | Lines | Features |
|---|---|---|
| Inventory | ~220 | Single report, delta tracking, compact groups, "live guns" min(guns, ammo/3) |
| Stockpile | ~430 | Multi-source/target, crate planning, category filters, shopping list auto-fill, export |
| **Search** | — | **Default landing view (`src/components/Search.vue`)**, shown when `submissions.length === 0`. Left panel: search bar + live results (icon + `displayName`, all 715 entries (625 searchable; 31 upgrade families, 90 hidden tier members)). Case-insensitive substring match on `displayName` only; results list hidden until you type. Click an entry → right panel shows a **wiki-style infobox** (`src/metadata-format.js`) of cleaned/labeled fields + a collapsible "unformatted fields" list + the full raw JSON. The landing view also shows a collapsible **item categories** table (11 metadata-shape classes). × button clears the search; emptying the box resets to the default placeholder view. Paste still works globally to switch to CSV modes. |

**Facility cost calculator** (sub-mode of Search): each result row for a *facility-produced* item shows a green **+** button (`src/facility-calc/`). Clicking it pins the item to the top of the left panel (`src/components/FacDesired.vue`, green-tinted row matching the search-result row height/styling, editable quantity + remove) and reveals the calculator (`src/components/FacilityCalc.vue`) in the right panel. **Search results filter:** when the calculator is active (item pinned), results are filtered to show only facility-producible items. **Search scope:** matches `displayName`, `codeName`, and `description` — sorted so `displayName` matches appear first. Removing the last pinned item closes the calculator (no title/close button). The calculator resolves the recipe graph bottom-up through the 158 facility recipes (base + modification tiers; mines = raw-from-node leaves) and shows **two panels**: **left** = Raw resources + Intermediate resources; **right** = building/modification groups. Recipes run at **fractional scale** (no integer-run rounding, no discretization leftovers); byproducts are produced exactly and reused to offset downstream demand, but final surplus is ignored (not shown). Only the **production time** is shown per active recipe (not run counts). Headers are grey (`#999`, matching the stockpile report's secondary label shade), not green.

  The right panel groups recipes by **primary output** (what the recipe is "for" conceptually — see `primaryOutput` in `recipes.mjs`). No group headers are shown — the grouping is purely structural (recipes for the same primary output are visually adjacent, separated from other groups by spacing). Each recipe row carries a **facility icon** on its left edge with a `title` tooltip showing the modification name (hover to see e.g. "Assembly Bay", "Excavator", "Coke Furnace"). **Modification display names come from the game data** (`*_UpgradeSlotComponent.json` files, sourced by `parser/scripts/process-game-data.js`), not prettified enum keys — the enum key `Recycler` is in-game "Assembly Bay", `RocketFactory` is "Rocket Battery Workshop", etc. The recipe object carries `modName` (in-game name) and `mod` (enum key). The displayed recipe set is the **stable closure** of all recipes that could possibly be involved (`reachableRecipes` in `resolver.mjs`, independent of `selectedRecipes`) — so toggling a recipe choice never adds/removes sections, only flips lit/dim. Each recipe is presented under its **primary output** (a multi-output recipe co-producing a byproduct appears under what the recipe primarily produces, e.g. the Excavator Sulfur mine — which also makes Coal — appears under "Coal"). Each recipe row is **clickable to select it** (no radio buttons). Clicking the **already-active recipe deactivates it: the resource stops being produced and is imported** (it clears the manual `selectedRecipes` pin AND marks the resource imported via `toggleImported`/`toggleSkipAutoImport`; `expandState`'s override loop force-assigns a pinned recipe even when imported, so the pin MUST be cleared). Energy's active recipe deactivates via `toggleEnergy()` (flips to import mode). This is the user's "click the assigned recipe to unassign it => import it" model — distinct from clicking an *inactive* recipe, which pins it. Each recipe row is laid out as a **5-column grid**: facility icon (28×28), inputs (flex column), arrow separator, outputs (flex column), time (top-right corner, shown only for the active recipe). Dimming is driven by **activatability**, not by active-ness: a recipe is *activatable* (rendered full-bright, clickable) iff it **produces an item in the current plan's imports, intermediates, or the Energy pseudo-resource** — `relevantItems = plan.raw ∪ plan.inputs ∪ plan.intermediate ∪ {Energy}` (logic in `src/facility-calc/activation.mjs`, pure & unit-tested: Property 1, Property 2, Invariants 1–4). The **clickable** set is `activatableRecipes ∪ activeRecipes` (see `clickableRecipes()` in activation.mjs) — so an active/pinned recipe is **never dimmed**, even if its output has left the relevant set; it stays clickable so it can be deactivated. ~2669 of 8427 reachable recipes are *not* activatable (e.g. a recipe whose only outputs are a desired target, or a byproduct the plan covers elsewhere) and are **dimmed** (`opacity: 0.4`, `pointer-events: none` so un-clickable). Because `reachableRecipes` explores the full recipe graph while `rel` only contains plan items, dimmed rows are expected and shown greyed-out, not interactive. The currently-selected recipe (the one in the active plan) additionally gets a green background (`#2a5a2a`) and shows its production time; activatable alternatives stay full-bright so they're clearly clickable. Selecting a recipe that newly needs an item flips that item's recipes from dim to activatable. **Primary-output groups** are ordered with any group that contains a **target-producing recipe** (one whose primary output is a pinned/desired item) sorted first, then alphabetical by group label — so the product group that actually makes what you pinned sits at the top. Within each group, recipes producing a target output also sort above intermediate producers (secondary sort by facility/mod). Aggregated resource counts are **ceiled** for display (you must source a whole unit even if the fractional plan needs less) via `Math.ceil(n - 1e-6)`; the resolver still runs fractionally so byproduct reuse and timings stay exact. Left panel sections: **Raw resources**, **Intermediate resources**, **By-products** (leftover co-produced surplus not reused downstream, in its own section).

  **Reactivity gotcha (solved):** recipe objects are stored in reactive `calc.selectedRecipes` and read back inside the resolver's computed. Vue 3 deep-reactivity wraps them in proxies on read, so the object the resolver sees is a *different reference* than the raw objects returned by `recipesFor()` in the template — breaking identity-based `activeRecipes.has(entry.r)` and making the selected recipe never light up. Fix: every recipe object is `markRaw(...)` at construction in `recipes.mjs`, so Vue never proxies them and identity is preserved. State lives in a shared reactive store (`src/facility-calc/store.mjs`); the resolver is a FIFO worklist (`src/facility-calc/resolver.mjs`). **codeName canonicalization:** four facility-recipe codeNames are lowercase in the raw export (`metal`, `coal`, `heavyartilleryammo`, `lightartilleryammo`) but their icons + metadata exist only under PascalCase; `recipes.mjs` `CANON` canonicalizes all four on read so icon paths and metadata lookups resolve. **(Jul 11 fix):** also added `HalftrackW/C/DefensiveC/ArtilleryC/OffensiveW/TwinW` → `HalfTrack*` (export uses lowercase 't'; metadata is `HalfTrack*`) and `Facilitymaterials4` → `FacilityMaterials4` (lowercase 'm'). These were indexed under wrong/absent keys so the Large Assembly Station halftrack recipes were invisible in the calculator. Regression test: `src/facility-calc/recipes.test.mjs` (asserts every indexed recipe's inputs/outputs resolve to metadata + the halftrack recipes resolve). |

## Detail panel, routing & scroll (Jul 10, 2026)
- **No vue-router.** Navigation is `history.pushState` + a `popstate` listener. `Search.vue` owns
  `selectedCodeName` (a `ref`); selecting an item sets it and pushes `/data/<codeName>` via a
  `watch(selectedCodeName, syncUrl)`. `ItemDetail` renders with `:codeName="selectedCodeName"`
  (no `:key`, so the component instance is reused across items — only the prop changes).
- **Layout** (`Search.vue`, flex row `.ms`, `height: calc(100vh - 8px)`): left `.panel` (370px) =
  search bar + `.results` (`overflow-y:auto`); right `.detail` = `flex:1; overflow:auto; padding`.
  **`.detail` is the scroll container for the item page** (not the window).
- **Scroll-to-top on open** (Jul 10): a `watch(selectedCodeName, …)` in `Search.vue` resets
  `detailEl.scrollTop = 0` inside `nextTick` — instant (no smooth scroll) — whenever a *new* item
  is opened, including clicks on in-detail links (Production-box "used in" items, kill-table ammo
  links). `detailEl` is a `ref` on the `.detail` div. Clicking the same item toggles it off.
- **'+' (`.add-fac`) in search results → `addToFacility(codeName)`**: calls `addDesired()` (which sets `calc.active=true`) and then clears `selectedCodeName`, so the right `.detail` panel switches from `ItemDetail` to `FacilityCalc`. I.e. clicking '+' both adds the target AND jumps to the calculator view (clearing the metadata view).
- `ItemDetail` emits `select` (bubbled from child links via `ProductionBox`/`FacItem`); `Search.select`
  handles it, so every in-detail navigation reuses the same path and scrolls to top.
- **Dev-server note:** Vite HMR usually applies UI changes, but if something doesn't appear, restart
  `npm run dev`. Always `npm run build` to compile/typecheck.
- **build:data auto-restarts the dev server** (`vite.config.js` → `vite-plugin-restart` watching `parser/data/metadata.json` + `recipes.json`, `contentCheck:false`) — running `build:data` triggers a server restart that also re-serves `public/icons/` fresh, so no manual restart is needed after regenerating data. Source/HMR changes still work normally. Do NOT watch `public/icons/**` (hundreds of recursive inotify watches → ENOSPC crash).

## Facility Cost Calculator — Algorithm

**Inputs:** `desired = [{codeName, qty}]` (pinned items) + `selectedRecipes = {item → recipe}` (user's per-item recipe override; defaults via `defaultRecipe` = base recipe, else first available).

**`resolvePlan`** (`resolver.mjs`) — FIFO worklist, fractional-scale resolution:

1. Seed queue with `desired` items (each flagged `root: true`).
2. Pop an item/qty. **Reuse surplus first**: subtract any accumulated `excess[item]` (byproduct surplus from earlier steps) from `need`; if that satisfies it, skip manufacturing.
3. Pick the recipe: `selectedRecipes[item]` or `defaultRecipe(item)`. If none exists → it's a **leaf**: add to `raw` (you must source it).
4. `runs = need / outObj.quantity` (fractional — no integer rounding, no discretization excess).
5. Record/merge a process at key `procKey(recipe, item)` (accumulate `runs` + `time = duration × runs` if the same recipe+item recurs).
6. **Mines** (recipe with `inputs.length === 0`) → output is *gathered* from a resource node: add to `raw` (never intermediate), and stop (no inputs to recurse).
7. **Real manufacturing** (has inputs): if the item is non-root → add to `intermediate` (net, after byproduct reuse).
8. **Byproducts → surplus**: every *other* output of the recipe accumulates into `excess[otherCodeName] += runs × other.quantity` (reused in step 2 by any downstream demand for that item).
9. Enqueue each input as `{item, qty: input.quantity × runs, root: false}`.
10. Cycle guard: bail after 200k iterations (the recipe graph is acyclic in practice).
11. Returns `{ raw, intermediate, byproducts, processes, involved }`:
    - `raw` — leaves with no recipe, or gathered from nodes (mines).
    - `intermediate` — manufactured items (net of byproduct reuse), excluding the root/desired outputs.
    - `byproducts` — leftover `excess` entries (> EPS) after all demand is met: co-produced surplus that nothing consumed.
    - `processes` — every recipe step that ran, `{recipe, runs, time, item}`, sorted by `facLabel` then item.
    - `involved` — Set of every manufactured item (roots + intermediates).

**`reachableRecipes`** (`resolver.mjs`) — **graph closure**, independent of `selectedRecipes` (for stable UI sections):

1. Seed BFS with `desired` codeNames.
2. For each item, walk *all* `recipesFor(item)` (every alternative, not the chosen one), mark each recipe reachable and recurse into all its inputs.
3. Returns `Map<recipe, presentedItem>` where `presentedItem` = `recipe.primaryOutput` (defined in `recipes.mjs`). For multi-output recipes this means the recipe is always presented under its designated primary product (e.g. Excavator Sulfur mine → presented under "Coal"), not under whichever output triggered the BFS inclusion.

**`reachableRecipes`** (`resolver.mjs`) — **graph closure**, independent of `selectedRecipes` (for stable UI sections):

1. Seed BFS with `desired` codeNames.
2. For each item, walk *all* `recipesFor(item)` (every alternative, not the chosen one), mark each recipe reachable and recurse into all its inputs.
3. Returns `Map<recipe, presentedItem>` where `presentedItem` = `recipe.primaryOutput` (defined in `recipes.mjs`). For multi-output recipes this means the recipe is always presented under its designated primary product (e.g. Excavator Sulfur mine → presented under "Coal"), not under whichever output triggered the BFS inclusion.

**Display rules** (in `FacilityCalc.vue`):
- Recipe rows use a **5-column grid**: facility icon (with hover tooltip), inputs (flex column, each on its own line), arrow separator, outputs (flex column, each on its own line), time (top-right corner, shown only for the active recipe).
- `activeItems = new Set(plan.processes.map(p => p.item))` — drives **activatability** (lit vs dim) of each recipe row.
- Counts ceiled for display via `Math.ceil(n - 1e-6)`; the resolver stays fractional.
- Left panel: **Inputs** / **Intermediates** / **By-products**.
  - **Inputs** section: split into two subsections separated by a thin horizontal line:
  - **Irreducible inputs** (top) — items with no facility recipe at all, must be sourced from outside. Non-clickable.
  - **Reducible inputs** (below separator) — items that have at least one facility recipe (node mines or facility recipes), could be produced instead of imported. Clickable items toggle import status between Inputs and Intermediates; items in `plan.raw` (node-only mines) stay non-clickable.
- **Intermediates** section: clickable rows — clicking moves an item to Inputs (prunes its supply chain, assumes you import it).
- **By-products** section: not clickable.
- **ALWAYS_RAW resources** (`Metal`, `Coal`, `Sulfur`, `Components`, `Oil`): no longer force-moved to Inputs. Instead, a **two-pass plan resolution** auto-imports them by default (so they appear in Inputs), but they remain clickable — clicking removes the auto-import, letting them appear in Intermediates (if manufactured) or By-products (if co-produced). Items with no facility recipe at all (leaf items) always appear in Inputs with no toggle.
- Right panel: recipes grouped by **primary output** (the `primaryOutput` field on each recipe), sorted target-producers-first then alphabetically by group label. Each recipe row shows its facility/mod via icon + label on the left.
- **Power & Energy** (`powerDelta` from raw recipes, MW; not a material item):
  - Power is the facility's **raw** draw/generation: `effectivePower(recipe) = powerDelta` (never divided by 5). A powered (grid-connected) **multi-order facility runs 5× faster**, so the `÷5` lives on **time**, not power: `effectiveDuration(recipe) = duration / 5` for consumers (`powerDelta < 0`, non-pad); producers and **pads** (Small/Large Assembly Station, Dry Dock) keep raw duration. Energy MWh = `effectivePower × effectiveDuration / 3.6e6` (total energy is unchanged from the old model — only the power/time split differs).
  - Each recipe row (PowerChip) shows `P MW × Ds` where `P = |powerDelta|/1000` (raw) and `D = effectiveDuration` (the 5×-speed time); a ` (/5)` suffix marks the multi-order speed-up. The **Facilities** panel lists each facility with raw MW (consumers red, producers green) + active time, **power-producing buildings sorted LAST**; `Peak: xMW` = sum of per-facility **consumption** only (producers excluded — they supply, not demand). Aggregation + peak are pure in `src/facility-calc/power.mjs` (unit-tested by `power.test.mjs`). The PowerChip (the `P MW × Ds` line) is never clipped — `.io-inputs/.io-outputs .power-chip` keeps `overflow: visible`.
  - **Engine Rooms (T2/T3) and ReservePower are excluded from the calculator entirely** (`SKIP_FACILITIES` in `recipes.mjs`) — their only output, ReservePower, is consumed by nothing.
  - **Energy** (left panel, `Energy` section): net MWh = Σ over `plan.processes` of `effectivePower(recipe) × effectiveDuration(recipe) / 3.6e6`, ceiled up to 1 decimal (`ceil1`). Negative net = more produced than consumed → labeled "produced".
  - **Sulfuric Reactor** (Power Station mod) is a **power producer**: its `primaryOutput` is the synthetic `"Energy"` (grouped under an "Energy" heading in the right panel); Sulfur is its (byproduct) item output.

---

## Key Data Structures

### Metadata structure & wiki-field coverage (Jul 9, 2026)

`metadata.json` (**715 entries**, `parser/data/metadata.json`) is keyed by `codeName`.
Each entry is classified into **11 behavioral classes** by `src/components/metadata-format.js`
(`Mount/Deployed` exists in the classifier but currently has 0 items):
`Structure` (270), `Land Vehicle` (139), `Material/Supply` (62), `Ammunition` (45),
`Tool/Equip` (46), `Firearm` (50), `Misc` (29), `Ship` (24), `Aircraft` (13),
`Grenade/Thrown` (10), `Melee Weapon` (3). The display subheader uses
`chassisName` (e.g. "Rifle", "Raw Material"); the coarse class is only a fallback for items lacking one.
**28** entries are upgrade `isFamily` pages; **79** tier members are `inFamily` (hidden from
search, rolled into their family). Searchable pages = **625**. **434** entries carry `resistances`,
**389** carry a `destruction` table.

The Search detail panel (`Search.vue`) renders a wiki-style **infobox** + two catch-all lists:
- **unformatted fields** — raw metadata keys the infobox did NOT show (internal/physics noise).
- **missing wiki fields** — fields the official wiki infobox exposes but our data lacks.

**CRITICAL — data-source limitation (verified Jul 9):** `process-game-data.js` reads weapon/vehicle/
structure stats from the `BP*DynamicData.json` tables under `game_data/.../Blueprints/Data/`.
Those tables DO NOT contain several fields the wiki shows. Confirmed absent (string-search across
ALL non-localization JSON in `game_data`):
- `reloadTime` — **0/715** items have it; wiki shows reload for every gun.
- `FiringMode` for guns (e.g. "Bolt-action", "Automatic") — only 2 grenade items have it.
- `encumbrance` for rifles — present for 227 items but **missing for RifleW / RifleLightW / SniperRifleW / SMGW** etc.
- `range_effective` / `range_max` in meters — our `weaponData.maximumRange` is in raw game units (e.g. 2700), not meters.

So reload, gun firing mode, rifle encumbrance, and effective/max range **cannot be shown** — they are not in the
exported game data this repo holds (the wiki sources them from client `.uasset` binaries not exported here).
The `metadata-format.js` formatter correctly omits them and the "missing wiki fields" list transparently reports them.

### `metadata.json` — Full Item Catalog (715 entries)

Keyed by `codeName`. Each entry contains:

| Field | Type | Description |
|---|---|---|
| `displayName` | string | Human-readable name (English) |
| `description` | string | Item description |
| `iconPath` | string | Relative PNG path (e.g., `War/Content/Textures/UI/ItemIcons/RifleCIcon.png`) |
| `itemType` | `"item"` / `"vehicle"` / `"structure"` | Classification |
| `faction` | `"Wardens"` / `"Colonials"` / `null` | Faction lock (null = both) |
| `requiresTech` | boolean | Whether tech-unlockable |
| `encumbrance` | number | Carry weight |
| `equipmentSlot` | string | Slot type (Primary, Secondary, Large, etc.) |
| `itemCategory` | string | Category enum cleaned |
| `itemProfileType` | string | Profile enum cleaned |
| `uiCategory` | string | Computed UI grouping |
| `isStockpilable` | boolean | Can be stored in stockpile |
| `cratesExist` | boolean | Has crate form |
| `effectiveQuantityPerCrate` | number | Computed crate yield |
| `objectPath` | string | Source blueprint file reference |

**Stats sub-objects** (present only for relevant item types):

| Sub-object | Contains | Applies to |
|---|---|---|
| `weaponData` | `suppressionMultiplier`, `maxAmmo`, `maxApexHalfAngle`, `baselineApexHalfAngle`, `stabilityCostPerShot`, `agility`, `shoulderingDuration`, `stabilityGainRate`, `coverProvided`, `maximumRange`, `maximumReachability`, `damageMultiplier`, `artilleryAccuracyMinDist`, `artilleryAccuracyMaxDist` | Rifles, SMGs, pistols, etc. |
| `ammoData` | `damage`, `suppression`, `explosionRadius`, `damageInnerRadius`, `damageFalloff`, `accuracyRadius`, `damageType` (with nested type info), `breachingModifier` | Ammo, grenades, shells |
| `grenadeData` | `minTossSpeed`, `maxTossSpeed`, `grenadeFuseTimer`, `grenadeRangeLimit`, `armourDamageModifier` | Grenades, thrown weapons |
| `meleeData` | `chargingMaxSpeedModifier`, `blockingMaxSpeedModifier`, `quickAttack`, `longAttack` (each with stamina/damage/delay) | Bayonets, swords, hammers |
| `vehicleData` | `maxHealth`, `minorDamagePercent`, `majorDamagePercent`, `repairCost`, `fuelCapacity`, `fuelConsumptionPerSecond`, `engineForce`, `massOverride`, `tankArmour`, `tankArmourMinPenetrationChance`, `rotationRate`, `reverseSpeedModifier`, `defaultSurfaceMovementRate`, `hasTierUpgrades`, `buildCost`, `altBuildCost` | All vehicles |
| `vehicleProfile` | `usesRollTrace`, `canTriggerMine`, `usesGas`, `drivingSpeedThreshold`, `maxVehicleAngle`, `enableStealth`, etc. | Vehicle behavior profile |
| `vehicleMovementProfile` | `mass`, `brakeForce`, `handbrakeForce`, `airResistance`, `rollingResistance`, `lowSpeedEngineForceMultiplier`, `lowGearCutoff`, `centerOfGravityHeight`, `usesDifferentialSteering` | Vehicle handling |
| `airData` | `enginePower`, `maxSpeed`, `maxSpeedFromEngine`, `maxEngineRPM`, `overspeedEngineRPM`, `simulationScale`, `wheelBrakeCoefficient`, `assistModeMaxRoll`, `assistModeMaxPitch`, `minSpeedFlaps`, etc. | Aircraft |
| `shipData` | `secondsToMaxRPM`, `maxPropellerRPM`, `maxRudderAngle`, `rudderTurnRate`, `thrustVectoringPercent`, `ballastFloodRate`, `ballastBlowRate`, `maxDivePlaneAngle`, etc. | Ships |
| `structureData` | `maxHealth`, `decayStartHours`, `decayDurationHours`, `repairCost`, `structuralIntegrity`, `storedItemCapacity`, `buildCost` | Structures, defenses |
| `structureProfile` | `supportsAdvancedConstruction`, `isRepairable`, `isRuinable`, `enableStealth`, `bypassesRapidDecay`, etc. | Structure behavior |
| `mountData` | `suppressionMultiplier`, `maxHorizontalDeviation`, `maxVerticalDeviation`, `coverProvided`, `maxAmmo`, `reloadTime`, `firingCone` info | Deployed weapons (tripod, ISG, etc.) |
| `aircraftPartData` | `maxHealth`, `maxIntegrity`, `criticalIntegrity`, `partType`, `slotType`, `enginePowerModifier`, `liftModifier`, `dragModifier`, `structureMassModifier` | Aircraft components |
| `armourProfile` | `health`, `penetrationResistanceChance`, `penetrationResistanceReduction`, `subsystemDisableChanceMultiplier`, `canBePenetrated` | Armour/damage profiles |
| `itemComponent` | `firingMode`, `firingRate`, `maxAmmo`, `reloadTime`, `compatibleAmmoCodeName`, `equippedGripType`, `deployCodeName`, `projectileClass` (nested with explosive/detonation info) | Weapon component data |
| `itemProfile` | `isStockpilable`, `isStackable`, `isConvertibleToCrate`, `isCratable`, `usableInVehicle`, `stackTransferLimit`, `retrieveQuantity`, `reserveStockpileMaxQuantity` | Item behavior flags |
| `productionCategories` | `factory`, `massProduction` | Factory/MPF queue type enum |
| `crateCost` | Array of `{codeName, quantity, displayName}` | Factory/MPF crate inputs |

### `data/positions-*.js`
```js
["AssaultRifleAmmo", "RifleAmmo", ...]  // positions[i-1] for 1-based index
```
Empty strings = unmapped positions.

# `parser/data/recipes.json` — Production Recipe Index

| Section | Contents |
|---|---|
| `factory.crateRecipes` | 241 Factory/MPF crate recipes — codeName → `{inputs, outputs, duration, retrieveTimes, researchLevel}` |
| `facilities.{key}` | 19 facility blueprints with `baseRecipes` + per-modification recipes |

### `src/components/items.js`
```js
codeName → { short, target }  // hardcoded targets, needs audit vs latest metadata
```

### Report object
```js
{ hex, subhex, stockpileName, stockpileType, coords,
  items: { "RifleW": { count: 10 } }  // or "RifleW-crated" in stockpile
  isStockpile: true/false }
```

### CSV Formats
- **Inventory:** `Hex - Subhex - BaseType - Access - X:... Y:...,Date` then `ItemName,Count`
- **Stockpile:** `Hex - Subhex - StockpileType - Owner - X:... Y:...,Date` then mixed `ItemName (Crate),Count` and `ItemName,Count` (vehicles/structures)

---

## Operational notes (agentic workflow)
- **Loop-police:** `metadata-format.js`, `process-game-data.js`, `ItemDetail.vue` are auto-blocked
  from being read after ~4 reads in a session. Use `grep`/`sed`/`python3` to inspect and make
  targeted edits; re-reading the same large file yields no new info — move forward with edits.
- **Semantic-loop guard:** when iterating, you must *act* with concrete edits, not re-plan. If a turn
  is flagged as a semantic loop, stop re-deriving and apply the next concrete change.
- **Don't fully read large JSON** (`metadata.json`, `recipes.json`, game_data exports): use `jq`/
  `grep`/`head`/`python3` to inspect structure and spot-check.
- **Data provenance (authoritative).** Every displayed value is derived from the exported `game_data/`
  files via `process-game-data.js`. The foxhole wiki (and `enrich-wiki.mjs`) is **NOT** a data source —
  it is used only for *testing and sanity checks* (comparing our game-derived values against the wiki
  to catch extraction bugs). Where a field is absent from the game exports, it is omitted unless the
  user supplies the value in conversation (a "conversation exception"), stored as an explicit override
  — never scraped from the wiki. (Wiki is also Cloudflare-blocked, HTTP 403, for direct fetch.)
- **Resistance matrix stores a RESISTANCE FRACTION** (`0` = full damage, `1` = immune), NOT a damage
  multiplier. Effective damage = `base × (1 − fraction)`.
- **Dev-server:** restart `npm run dev` if a UI change doesn't appear; always `npm run build` to check.
- **Small implementations; minimal comments.** Don't dump full example files into comments — rely on
  the example CSVs / `data/` files. Prefer `python3`/shell one-offs in `tmp/` for research.

## Scripts Reference

### Primary (use these)

| Command | Action |
|---|---|
| `node parser/scripts/process-game-data.js` | ⭐ Regenerate `metadata.json` + `recipes.json` + `public/icons/` from `game_data/` exports. Walks all blueprint files, extracts full stats + profiles + icons + recipes in one pass. Also reads sibling `*_UpgradeSlotComponent.json` files for in-game modification display names (e.g. enum `Recycler` → "Assembly Bay"). **Auto-restarts the dev server** (via `vite-plugin-restart` in `vite.config.js`, watching `parser/data/metadata.json`+`recipes.json` with `contentCheck:false`) — the parser does `rmSync`+`mkdirSync` on `public/icons/`, which Vite's chokidar watcher loses track of (icons get served as SPA-fallback HTML); the auto-restart re-serves them fresh. No manual restart needed after build:data. |
| `npm run generate-positions` | Rebuild `parser/data/positions-*.js` from `examples/u65_stockpile.csv` + `u65_base.csv` |
| `npm run check-diff -- <csv>` | Compare CSV display names vs `metadata.json` (exit 0 = all known) |

### Utility

| Command | Action |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Production build |
| `npm run test` | Vitest (no test files yet) |

---

## Default Recipe Overrides (Jul 7, 2026)

Some items have multiple facility recipes. When the user hasn't explicitly selected one, the `defaultRecipe()` function in `recipes.mjs` now prefers certain non-base recipes over the base recipe:

| Item | Preferred Recipe | Rationale |
|---|---|---|
| `FacilityMaterials2` (Processed Construction Materials) | **BlastFurnace** — 3 Cmats + 55 Components + 6 Heavy Oil → 3 PCon | Heavy oil recipe — more efficient per Cmat (3 PCon vs 1), uses components instead of just Cmats |
| `FacilityMaterials3` (Steel) | **EngineeringStation** (enriched oil variant) — 9 PCon + 375 Coke + 90 Enriched Oil + 100 Water → 3 Steel | Uses enriched oil for superior yield (3 Steel vs 1 per run) |

The override map `DEFAULT_OVERRIDES` keys by codeName and matches by `facilityKey` + `mod`, with optional `hasInput` to disambiguate mods with multiple recipes for the same output. Falls back to the base recipe (no mod) if the preferred recipe doesn't match.

---

## Data Freshness (Jul 7, 2026)

| Metric | Value |
|---|---|
| `metadata.json` entries | **715** (245 items, 176 vehicles, 294 structures; 31 families, 90 hidden tier members, 625 searchable) |
| Stockpile positions | **424** positions, **424** lines, **all mapped** ✅ |
| Inventory positions | **221** positions, **221** lines, **all mapped** ✅ |
| Missing icons | **5** genuinely missing source PNG files (event-only content) |
| Production recipes | **244** crate recipes (Factory/MPF) + **22** facility files (**276** conversion entries) |

### Jul 7 — ShipPart recipes missing build costs

**Root cause:** `parseAssemblyItem()` in `process-game-data.js` only looked up resource costs from `vehicleData` (`BPVehicleDynamicData.json`). Ship parts (`ShipPart1`, `ShipPart2`, `ShipPart3`) and `FortLargeRadarPart` are **structures** (blueprints in `Structures/Ships/`), not vehicles — their build costs are in `structureData` (`BPStructureDynamicData.json`). When `vehicleData[codeName]` returned undefined for these items, the script fell through to the "no cost data" fallback and emitted empty inputs, making them appear free to produce.

**Fix:** Extended `parseAssemblyItem()` to fall back to `structureData` when the item isn't in `vehicleData`, using new helpers `extractStructureResourceInputs()` and `extractStructureAltResourceInputs()` that mirror the vehicle ones but read from `BPStructureDynamicData.json`.

**All 5 English CSVs pass `check-diff`** — zero unknown items (only 4 duplicates from crate detection).

### Jul 6 — VehicleProxy collision fix

**Root cause:** 4 vehicle blueprints (`Crane`, `Construction`, `LargeCrane`, `Motorboat`) share their `CodeName` with `*VehicleProxy.json` structure files in `Structures/`. Since the script processes `Structures/` after `Vehicles/`, the proxy entries overwrote the real vehicle data, causing `BMS - Class 2 Mobile Auto-Crane`, `BMS - Universal Assembly Rig`, `BMS - Overseer Sky-Hauler`, and `BMS - Grouper` to be missing from metadata.

**Fix:** Files containing `VehicleProxy` in their name are now skipped during metadata extraction. The 4 proxy structures were never useful as user-facing items (they're just build-menu placement proxies).

**Result:** -4 structures, +4 vehicles, same total (666). All u65 CSV lines now map correctly.

**Root cause:** `process-game-data.js` `parseConversion()` only read `ItemOutput`/`ItemInput` from facility conversion entries. The Infantry Kit Factory (`BPFacilityFactorySmallArms.json`) uses `CrateOutput`/`CrateInput` instead — its 19 base recipes (uniforms) and 28 modification recipes (Small Arms Workshop, Special Weapons, Heavy Ammo) were silently emitted with empty `outputs[]`.

**Fix:** `parseConversion()` now also reads `CrateOutput`, `CrateInput`, `LiquidOutput`, `LiquidInput`. Added a `CANON` map with case-insensitive `canon()` lookup in the extraction script so the generated `recipes.json` has correct code names (e.g. `Stickybomb` → `StickyBomb`, `lighttankammo` → `LightTankAmmo`).

**Canonicalization:** Added `Stickybomb` → `StickyBomb` and `RPGAmmo` → `RpgAmmo` to the `CANON` map in `recipes.mjs` (the game data uses lowercase/inconsistent casing for some CrateOutput code names).

### Jul 6 — Vehicle factory facilities now included (Small/Large Assembly Station, Dry Dock)

**Root cause:** The 3 vehicle factory facilities (`BPFacilityVehicleFactory1/2/3.json`) were missing from `FACILITY_FILES` entirely. They use a different recipe format (`AssemblyItems`) instead of `ConversionEntries`, with input costs stored in `BPVehicleDynamicData.json` (`ResourceAmounts`, `AltResourceAmounts`, `UpgradeResourceAmounts`).

**Fix:** Added VF1/VF2/VF3 to `FACILITY_FILES`. Added `parseAssemblyItem()` which reads the `AssemblyItems` format and looks up resource costs from the vehicle dynamic data. All vehicle pad recipes use `AltResourceAmounts` (processed materials) — the `UpgradeResourceAmounts` field is for garage tier upgrades, not pad recipes. The prerequisite vehicle is included as an input for upgrade variants.

**Stats:** ~118 new vehicle/assembly recipes across 3 facilities. Items without vehicle data (ship parts, fort parts, rocket parts) emit with just outputs + duration (no inputs).

### Jul 10 — Facility building power (PowerGridInfo) now extracted

**Root cause:** A facility's power draw lives on the building, not per recipe — `PowerGridInfo.PowerDelta` on the facility blueprint's `Properties` (e.g. Materials Factory = −2000, Metalworks = −5000). `parseConversion()` only read each conversion entry's own `PowerDelta`, which is `0` for most recipes, so nearly every recipe showed `powerDelta: 0`.

**Fix:** In `process-game-data.js`, extract `buildingPower = Properties.PowerGridInfo.PowerDelta` per facility and apply it to every emitted recipe: `powerDelta = recipePowerDelta ? recipePowerDelta : buildingPower` (the per-recipe value is the recipe's TOTAL power and overrides the building base; a `0` recipe inherits the building base). Applied to both `parseConversion` and vehicle-pad `parseAssemblyItem` recipes. Engine rooms (`EngineRoomT2/3`) are excluded entirely via `SKIP_FACILITIES`.

**Note — powerless buildings (source data):** only `Water Pump`, **base** `Oil Well` (its `Electric`/`Fracker` upgrades DO draw power), and — per the exported `PowerGridInfo` — also the resource **harvesters** (Salvage/Components/Sulfur/Coal mines), **Offshore Platform**, and **Concrete Mixer** have `0` building power. The user believed only Water Pump + base Oil Well lack power; the game data says the harvesters/platform/concrete mixer are also `0`. Trust the data.

---

## Known Gaps

1. **items.js** — hardcoded short names + targets, likely outdated vs metadata
2. **StockpileReport.vue categories** — hardcoded groupings (facility, SAW, HMF, SIFA)
3. **Vehicle/structure display** — no smart grouping or planning
4. **InventoryReport.vue categories** — may miss newer items
5. **No tests** — unit or integration tests don't exist
6. **Guide** — `public/guide/` static HTML may be out of sync with app features
7. ~~**Icon extraction**~~ — **Fixed Jul 5:** `process-game-data.js` now correctly resolves icon paths via `EXPORTS_ROOT` instead of `Blueprints/`. 6 genuinely missing files remain (typos/event-only content). 656 icons extracted successfully.
8. **Ship interior components** — 12 ship engine rooms/parts rooms missing from export (sub-items, not standalone)

---

## Known data quirks (verified against game_data exports)

- **Handheld weapon reload is NOT in game exports.** `ReloadTime` appears in 0 export files; only
  `mountData.reloadDuration` (deployed weapons) and a never-hit `itemComponent.reloadTime` exist.
  Reload / fire-rate / firing-mode were historically wiki-enriched, but the wiki is no longer a data
  source — these are omitted; do not re-add them from the wiki.
- **Vehicle speed is a physics-sim output, not a scalar.** `defaultSurfaceMovementRate` is normalized
  0..1 (no km/h in exports). A linear fit from `engineForce/mass/airResistance/rollingResistance`
  reaches only R²≈0.53; the ratio `wikiKmh/dsmr` spans ~2.7–90. Aircraft/ship speed lives only in
  `airData`/`shipData` and is not surfaced.
- **5 firearms have no `encumbrance`** in exports (SMGHeavyW/C, RifleW, RifleLightC, RifleAutomaticW).
  No other source exists (wiki decommissioned) → rendered gracefully as absent.
- **`maxAmmo: 0` is correct** for 9 melee/launchers (Sword, Bayonet, RPG, Mortar, FlameBackpack, …)
  and flamethrowers (fuel tank, not a magazine) — not a bug.
- **`engineForce: 0` is correct** for 42 towed/relic vehicles (trailers, train cars, relic APC) —
  they are pulled, not self-propelled.
- **Factory/MPF `crateRecipes` must be gated by `productionCategories`** (factory/massProduction
  queue type, sourced from `BPFactory.json`/`BPMassProduction.json` via `loadProductionCategories()`
  in `process-game-data.js`). Many facility-only items (Cmats, Coal, Metal, large ammo, aircraft
  parts…) carry a legacy `CostPerCrate` in `BPItemDynamicData` but are **NOT** Factory/MPF products —
  listing them there is the (fixed) bug where e.g. Construction Materials appeared makeable at a
  Factory/MPF. `productionRecipes` (`src/components/production-recipes.js`) guards the Factory +
  MPF-item rows with `isFactoryMpfItem(entry) = !!entry.productionCategories`. Vehicles/structures
  correctly have `productionCategories: null` yet ARE MPF-eligible via build cost (`isMpfEligible`) —
  do **not** gate those by it.

### Production-recipe display rules (Jul 11, 2026) — which facility builds what

`src/components/production-recipes.js` (`productionRecipes`) decides which recipe rows a metadata
page shows. Verified against the foxhole wiki (Garage / MPF / Construction Yard / Dry Dock / Aircraft
Hangar lists) and the exported `productionCategories` / `vehicleBuildType` / `buildLocationType`.
Key invariants (regression-tested in `production-recipes.test.mjs`):

- **MPF items** need `productionCategories.massProductionQueueType != null`. Tools (`Utility`) and
  meds (`Medical`) have a `factoryQueueType` but a **null** `massProductionQueueType` → Factory-only,
  never MPF. Gating uses a separate `isMpfItem` (= massProductionQueueType set); the Factory row keeps
  `isFactoryMpfItem` (= any `productionCategories`).
- **An item with a `facility-out` recipe (`recipesFor(codeName).length > 0`) is produced ONLY there**
  → suppress its generic `build` row (Garage/Shipyard/Construction Yard/Dry Dock/World) AND its MPF
  row. This covers: vehicles modified at a Small/Large Assembly Station (e.g. `TruckMobilityC` from
  `TruckC`), trains (Large Assembly Station), fighters/bombers (Aircraft Assembly), all large ships
  (Dry Dock), emplacements (Battery Line). `isMpfEligible` excludes any vehicle with a facility-out
  recipe for the same reason.
- **MPF builds anything made at a Garage or Shipyard — never Aircraft Hangar, Dry Dock, or field.**
  `isMpfEligible` returns false for vehicles with `vehicleBuildType` ∈ {`AircraftFactory` (scout
  planes not MPF), `LargeShip` (Dry Dock), `BuildableAnywhere` (World)}. Small/medium ships
  (`Shipyard`) stay MPF-eligible; field vehicles (Motorboat) are not.
- **Large ships (`vehicleBuildType: LargeShip`) build at the Dry Dock**, not a Shipyard — `buildFacility`
  maps `LargeShip → {iconKey: 'FacilityVehicleFactory3', label: 'Dry Dock'}` (reuses the Dry Dock
  facility icon; no standalone `DryDock.png` exists, and `build:data` would wipe any new icon file).
- **EmplacedMultiC** (and other `buildLocationType: Facility` emplacements) are facility-produced
  (Battery Line) → their bogus `World` build row is suppressed. Basic emplacements with
  `buildLocationType: ConstructionYard` (e.g. `EmplacedAircraftW/C`) correctly keep BOTH the
  Construction Yard build and the MPF row (built both ways per wiki).
- **Battleship codeName casing:** the Dry Dock (`FacilityVehicleFactory3`) recipe outputs use
  `LargeShipBattleShip*` (one 's') while the vehicle metadata/icon codeName is `LargeShipBattleship*`.
  Added to `CANON` in `recipes.mjs` so the recipe resolves to metadata (otherwise battleships wrongly
  showed a Garage + MPF instead of the Dry Dock). Note: battleship Dry Dock recipes have empty inputs
  in the export (`AltResourceAmounts: None`) — faithful to game data, NOT a bug to "fix".

## Stockpile State Export/Import (Jul 7, 2026)

The JSON export button (`StockpileReport.vue`) now saves a full state snapshot that can be pasted back (ctrl+v) to restore the exact same stockpile mode state.

### Export Format

File: `foxhole-stockpile-state.json`
```json
{
  "version": 1,
  "type": "foxhole-stockpile-state",
  "submissions": [
    { "report": { ... }, "time": "2026-07-07T12:00:00.000Z" }
  ],
  "targetIndices": [0],
  "sourceIndices": [1],
  "shoppingList": { "RifleW": 10, "Bandages": 5 },
  "settings": {
    "warden": true,
    "configure": false,
    "hiddenCrates": [],
    "targetShirts": 200,
    "targetShirtCrates": 310
  },
  "autofillCount": 310
}
```

### Import Mechanism

- **Auto-detected on paste or drag-and-drop:** If pasted/dropped text starts with `{`, `App.vue` attempts to parse it as a stockpile state JSON (checks `type` and `version` fields). Dragging a `.json` file onto the page works the same way.
- **Replaces all current state:** Clears existing submissions, switches to stockpile mode, loads reports, target/source indices, settings, shopping list, and autofill count.
- **Settings are applied via `Object.assign(settings, state.settings)`** — the reactive settings proxy propagates changes and saves to localStorage.
- **Shopping list restoration:** Uses a `pendingRestore` ref (provided by `App.vue`) that `StockpileReport.vue` reads during its `<script setup>` initialization. `Crate.vue` uses `shoppingList[name] ??= 0` instead of `shoppingList[name] = 0` so restored values aren't overwritten.

### Files Changed
- `src/App.vue` — JSON detection in paste handler, drag-and-drop support with visual overlay, `restoreState()` function, `pendingRestore` ref/provide
- `src/components/StockpileReport.vue` — Updated `exportJson()` with full state shape, injects `pendingRestore` to apply shopping list on mount
- `src/components/Crate.vue` — Changed `shoppingList[name] = 0` → `shoppingList[name] ??= 0` at initialization

---

## Game Recipe Data

### Two Recipe Styles

| Style | Where | Format |
|---|---|---|
| **Crate-based** (`CostPerCrate`) | `Data/BPItemDynamicData.json` | Factory/MPF — inputs per crate, outputs `QuantityPerCrate` items |
| **Per-unit** (`ConversionEntries`) | Facility blueprints | Player-built facilities — ItemInput[] → ItemOutput[], per cycle |

### 1. Factory / MPF (crate recipes)

**File:** `Data/BPItemDynamicData.json` — 278 rows. 241 are actual Factory/MPF recipes after filtering refinery and facility entries.

**Code name → material mapping:**
- `Cloth` = Basic Materials (Bmats)
- `Wood` = Refined Materials (RMats)
- `Components` = Components
- `Sulfur` = Sulfur
- `Explosive` = Explosive Powder
- `HeavyExplosive` = Heavy Explosive Powder
- `Metal` = Metal
- `FacilityMaterials1` = Construction Materials (Cmats)
- `FacilityMaterials2` = Processed Construction Materials
- `FacilityMaterials3` = Assembly Materials

### 2. Facility Recipes (22 facility files, 276 conversion entries)

See `parser/data/recipes.json` for complete listing per facility with all modification tiers.

| Facility | Base Recipes | Modification Tiers |
|---|---|---|
| Ammunition Factory | 10 | +RocketFactory, +LargeShellFactory, +TripodFactory |
| Infantry Kit Factory | 19 | +InfantryAmmo, +SpecialWeapons, +HeavyAmmo |
| Aircraft Maintenance Factory | 8 | +AircraftStrategic |
| Materials Factory | 2 | — |
| Metalworks Factory | 2 | — |
| Coal Refinery | 1 | — |
| Oil Refinery | 1 | — |
| Concrete Mixer | 3 | — |
| Diesel Power Plant | 1 | — |
| Power Station | 2 | — |
| Salvage Mine | 1 | — |
| Components Mine | 1 | — |
| Sulfur Mine | 1 | — |
| Coal Mine | 1 | — |
| Oil Well | 1 | — |
| Offshore Platform | 2 | — |
| Water Pump | 1 | — |
| Engine Room T2 | 3 | — |
| Engine Room T3 | 3 | — |
| Small Assembly Station | 13 | +MotorPool, +ArtilleryFactory, +LightVehicleAssembly, +TankAssembly, +WeaponsPlatformAssembly, +RocketAssembly, +ShipAssembly |
| Large Assembly Station | 5 | +TrainAssembly, +HeavyTankAssembly, +AircraftAssembly |
| Dry Dock | 11 | — |
## Wiki infobox matching (Jul 9, 2026)

Goal: make the Search detail infobox match the official foxhole.wiki.gg infobox,
category by category. Reference material saved under `tmp/wiki-matching/`:
- `infoboxes.json` — 12 representative wiki infoboxes + full raw wikitext, one per class
  (Structure, Land Vehicle, Ship, Aircraft, Firearm, Material/Supply, Ammunition,
  Tool/Equip, Grenade/Thrown, Melee Weapon, Misc, Mount/Deployed).
- `fetch-infoboxes.mjs` — re-runnable fetcher (resolves page title by displayName via
  MediaWiki search API, extracts `{{*Infobox}}` + page text). Reads `../data/metadata.json`.

### Field-availability matrix (verified against game_data exports)
"Available" = our `metadata.json` / `process-game-data.js` can surface it.
"Absent" = NOT in any `Blueprints/Data/*` export → wiki-only (live-client) data.

| Wiki field | Class | Status | Source in our data |
|---|---|---|---|
| Damage, Damage Type, Magazine, Accuracy (half-angle), Slot, Ammo, Crate | Firearm/Mount | ✅ shown | weaponData / ammoData / itemComponent |
| Weight (encumbrance) | most | ✅ shown when present | raw.Encumbrance (some items lack it, e.g. RifleW) |
| Damage mult | Firearm/Mount | ✅ shown when ≠1 | weaponData.damageMultiplier |
| Fuze, Max range, Explosion radius | Grenade | ✅ shown | grenadeData.grenadeFuseTimer / grenadeRangeLimit / ammoData.explosionRadius |
| Armour HP (0 = Unarmored) | Vehicle | ✅ now shown | vehicleData.tankArmour |
| Health, Repair, Decay, Storage, Disable | Structure/Vehicle | ✅ shown | *Data sub-objects |
| **Reload** | Firearm/Mount | ❌ ABSENT | not in BPWeaponDynamicData nor component |
| **Fire Rate** | Firearm/Mount | ❌ ABSENT | `FiringRate`/`FireRate` nowhere in Data/ |
| **Firing Mode** (Bolt-action/Auto) | Firearm/Mount | ❌ ABSENT | `FiringMode` nowhere in Data/ |
| **Range** effective/max | Firearm/Mount | ⚠️ field exists, raw units | weaponData.maximumRange / maximumReachability (game units, not meters) |
| **Crew / Passengers** | Vehicle/Ship/Aircraft | ❌ ABSENT | seat configs in vehicle BLUEPRINTS, not extracted yet |
| **Speed / Off-road speed** | Vehicle/Ship/Aircraft | ⚠️ field exists, raw units | defaultSurfaceMovementRate (vehicle), `Speed` not present in ship/air; normalized units, not km/h |
| **Armour HP / Pen chances / Trigger mines** | Ship | ❌ ABSENT | not in BPShipDynamicData export |
| **Uses** | Material/Misc | ❌ ABSENT | not in exports |
| **Pallet Amount** | Tool/Equip/Mount | ❌ ABSENT | not in exports |
| **Intel Range** | Structure/Aircraft | ❌ ABSENT | structureData.intelRange not extracted |
| **Built With** | Structure | ❌ ABSENT | hammer/etc. not in data |

### Known wiki-vs-game divergence (trust game files)
- HEGrenade: wiki `fuze=Contact`, `range_max=11`, `damage=229`; game files
  `grenadeFuseTimer=4` (timed), `grenadeRangeLimit=0`, `ammoData.damage=240`.
  Formatter shows game values; wiki appears outdated for these.
- RifleW: wiki `encumbrance=100` but its pickup blueprint has no Encumbrance
  property (other rifles like RifleLightW=70 do). Wiki value not in our export.

### Search detail — manual wiki-match UI (Jul 9)
- `Search.vue` now has a **"wiki match" toggle** in the left panel listing all 12
  coarse classes with a perfect/total bar (computed by sampling every item via
  `formatEntry` + `missingFields`). Click to expand.
- Each selected item shows a **✓ wiki match / ⚠ N missing** badge in the detail header
  (green = zero missing wiki fields, amber = some absent-from-data fields).
- "Perfect" = `missing.length === 0` against `WIKI_FIELDS`. Since wiki-only fields
  (crew, passengers, fire rate, etc.) apply to all vehicles, Land Vehicle/Ship/Aircraft/
  Firearm show 0% perfect by design; Ammunition ~89%, others vary. This is honest, not a bug.

### Notes
- `WIKI_FIELDS` in `src/components/metadata-format.js` drives the "missing wiki fields"
  list; kept in sync with the above (only genuinely-absent fields listed).
- Verified-absent fields (NOT in any `Blueprints/Data/*` export — wiki/live-client only):
  reload, fire_rate, firing_mode (guns), crew, passengers, ship armour/pen/trigger,
  speed in km/h, uses, pallet amount, intel range, built-with, structure armour type.
- Fields that EXIST but in raw game units (no conversion done): weapon range
  (maximumRange), vehicle speed (defaultSurfaceMovementRate), tank pen chance
  (tankArmourMinPenetrationChance). Listed as "missing" since we don't convert units.
- Remaining achievable extraction: vehicle crew/passengers from blueprint seat
  components (only some blueprints e.g. submarines/large ships expose Seats).

---

## Damage Resistance / Destruction Tables (Jul 9, 2026)

**Goal:** Add wiki-style **"x to kill" (structures) / "disable|kill" (vehicles)** destruction tables to Search detail pages, and a **"Resistances"** infobox block (Health moved there + damage-resistance %). Source = authoritative game files (not wiki).

### How armor / upgrades are represented (verified)
- **Resistance matrix (authoritative):** `game_data/.../Blueprints/Data/DTDamageProfiles.json` → `damageType → armourType → resistanceFraction` (NOT a damage multiplier). The value is the **fraction of damage resisted**: `0` = no resistance (takes full damage), `1` = immune. E.g. `AntiTankExplosive → Tier1Tank`=0.0 (tanks take full anti-tank), `Explosive → Tier3GarrisonHouse`=0.9 (90% resisted). 19 damage types × 20 armor types.
- **Base damage per ammo/explosive:** `BPAmmoDynamicData.json` (64 rows: `Damage` + `DamageType.ObjectPath`) and `BPGrenadeDynamicData.json`. Map ammo `DamageType.ObjectPath` → resistance key via existing `getDamageType(objectPath).type` (returns `Explosive`, `LightKinetic`, etc., matching `DTDamageProfiles` keys). Class-name also decodes directly (`BPAntiTankExplosiveStickyBombDamageType` → `AntiTankExplosive`).
- **Armor is per-blueprint** via `raw.ArmourType` → `armourType` field. Families: `Tier1/2/2B/3/3BStructure`, `Tier1/2/3GarrisonHouse`, `Tier1/2Tank`, `Tier1/1Large/2Ship`, `Tier1Aircraft`, `Trench`, `NoArmour`, `WorldStructureHusk`, `Ice`, `HeavyBuildSite`.
- **Effective damage = `baseDamage × (1 − resistanceFraction)`** (kinetic types `LightKinetic/HeavyKinetic/AntiTankKinetic` also ×1.25 for the per-shot average). `x-to-kill = ceil1(maxHealth / effective)` (ceil to 0.1). Immune when fraction ≥ 1 (`effective ≤ 0` → ammo dropped). Vehicles: `toDisable = ceil1(maxHealth × minorDamagePercent / effective)`, `toKill = ceil1(maxHealth / effective)`.
- **Upgrades change armor type** = the `armourType` (and thus the resistance) differs per tier. The armor-type change is exactly what shifts the resistance. In-metadata tier families: `TownBase1/2/3` (7000/5000/4000 HP, mapped to `Tier1/2/3GarrisonHouse` armour) and `FortGarrisonStation`(T3,10000)/`FortGarrisonStationPart`(T2,1000). Town Base has no `ArmourType` in its blueprint but maps to Garrison House (see Known limitation). Only items with a resolvable armourType+`maxHealth` get a table (some world structures like Safe House/Relic Base still lack one).
- **World-structure Safe House (GS2/GS3) are NOT in `metadata.json`** — only `TownCLargeGarrisonGS1` (+BuildSite) exist in exports; T2/T3 applied at runtime, not statically extractable. So the 1+3 tier-column table is only faithful where a tier FAMILY with armourType exists in metadata (currently just the Forts). Decision: render tier columns (T1/T2/T3) using each tier's armourType multiplier with the item's current health + a clear "actual tier HP may differ" note; otherwise single column.

### Requirements (from user)
- Scope: **Structures + Vehicles**.
- Columns = ammo/explosive types that do **non-zero damage** for that item's armor. Drop columns where the **resistance fraction ≥ 1** (immune / no damage taken); a fraction of `0` (no resistance) is now shown with **full damage** (previously mis-skipped as "immune").
- Upgradable buildings: table with **1 + 3 columns per tier (T1, T2, T3)**.
- **Health → moved into "Resistances" block** (same block as damage calcs); include **damage-resistance %** there.
- **No duplicate buildings** in search box.

### Implementation plan
1. `process-game-data.js`: load `DTDamageProfiles` + `BPAmmoDynamicData` + `BPGrenadeDynamicData`; build ammo reference (code,label,baseDamage,damageTypeKey); for each structure/vehicle with `armourType`+`maxHealth>0` compute `item.resistances` (health + byDamageType map) and `item.destruction` (filtered ammo rows; tier columns where family exists).
2. `metadata-format.js`: expose `resistances` + `destruction` (passthrough or helper).
3. `ItemDetail.vue`: render **Resistances** block (Health + resistance %) and **destruction table** (1+3 tier columns; disable|kill for vehicles).
4. De-dupe search if needed.

### Reference saved
- `tmp/wiki-matching/wiki-damage-resistance.md` — wiki Damage Resistance / Structure & Vehicle Health tables (for display format + which damage types exist; values are wiki, not authoritative).

### Known limitation
- Per-tier HP for world structures (safe house) not in static exports → tier columns use current HP with a note. Forts are the only in-metadata tier family with armourType.
- **Synthesized world-structure families** (Jul 10, 2026): several buildable world structures omit `ArmourType` in their blueprint or ship only a subset of tiers/sizes. `process-game-data.js` re-expresses them as named families/items just before the family-merge pass, using the real `DTDamageProfiles` resistance profiles (Tier1/2/3 Garrison House, Tier3Structure) + the wiki Structure Health Table for health; `computeDestruction()` builds the kill tables. All health/resistance values are game-accurate (Garrison House / Structure matrices); only the **names, sizes and per-tier health layout** are wiki-derived. Families/items produced:
  - **Town Base** → Post Office (7000) / School (5000) / Town Center (4000), each 3 Garrison House tiers (generic `TownBase1-3` deleted).
  - **Safe House** → 3 Garrison House tiers @ 2000 (generic `GarrisonStation`/`GarrisonStation1` deleted, replaced by `SafeHouse1-3`).
  - **Garrisoned House** → 3 sizes (Small 800 / Medium 1000 / Large 1200) × 3 Garrison House tiers.
  - **Relic Base** → 3 sizes (Small 4450 / Medium 5150 / Large 5850), all Tier3Structure (Small = original `RelicBase1`, renamed; Medium/Large added).
  The "Unarmored" note only appears for genuinely unarmored items. `FortGarrisonStation` (Keep, 10000hp, Tier3Structure) is a separate fort structure and is left untouched.

### Upgrade families (merged T1/T2/T3 pages) — DONE
- 31 families merged (Post Office / School / Town Center, Safe House, Garrisoned House Small/Medium/Large, Bunkers, Trenches, Garrisons, Relic Base Small/Medium/Large, …); 90 tier
  members hidden from search; 715 total entries. Detection: codename prefix (trailing
  digits stripped) + identical `displayName` (minus " (Tier N)").
- **Resistances + Destruction merged into ONE pane** (Jul 9, 2026): Destruction is folded
  into the "Resistances" infobox, grouped by damage type. One `merged` computed handles both
  single items and families; `familyMerged()` builds per-tier kill counts; `familyCostTiers`
  (build/MPF) kept separate. Base codename augmented in place when it is itself a member
  (e.g. `GarrisonStation` -> "Safe House"). `npm run build` passes.
- **Resistances pane rendering (Jul 10, 2026):** both the family branch and the non-family
  branch render ONE `<table class="ktab">` (replaces the old `.mtab`/`.dtgroup` tables, which
  were nested under `.destruction` and never actually applied). Layout:
  - Header row shows `T1 (x) T2 (y) T3 (z)` (per-tier **health** in parentheses) only when
    `merged.tiers.length > 1` (upgrade families); `th` cells are **left-aligned**. The health is
    removed from the subheader for families (single items still show `… hp` there).
  - Each damage type = a bolded `resist-row` (`<tr class="resist-row">`, `font-weight: 600`)
    whose left cell shows `DamageType (resist% …)` — the resistance % is rendered **inline in
    the label** (e.g. `Explosive (25-25-25%)`); tiers are **hyphen-separated** for upgrade
    families; empty `.kval` placeholder cells reserve the tier columns so ammo rows stay aligned.
  - Ammo rows follow: left cell = clickable icon + name link (`class="link"`, `@click` emits
    `select` to open that ammo's page); value cells = `x to kill` counts (one per tier).
  - **Vehicles:** cell content is `toDisable|toKill`; `toDisable` is wrapped in
    `<span class="dim dis">` (dimmed via global `.dim { opacity:0.5 }`, right-aligned in a fixed
    `~3.6em` slot); `toKill` follows. No-damage ammo shows `–`.
  - **Alignment / non-wrapping:** `.ktab` is `border-collapse: collapse; width:100%`. First column
    `td.klabel` is `white-space: nowrap; width:1%` (shrink-to-fit) + `min-width:180px` → labels
    never wrap and stay full-width. Value cells `.kval` are `width:6em; text-align:left;
    white-space:nowrap` → fixed-width columns that line up across all rows.
  - **Link color:** `.link` is a subtle greyish dark blue `#7488a8` (hover `#9fb2cf`), used for
    cost links and the kill-table ammo links.
  - **Note:** each pane ends with `<p class="dnote">Numbers do not account for low/high velocity
    modifiers and RNG.</p>`.
  - **Unarmored / empty tables:** structures/vehicles with no resolvable armour (no `armourType` in the game data AND no `WORLD_STRUCTURE_ARMOUR` override) have no resistance multipliers, so `dtRows` is empty. Instead of a blank table, a note row `Unarmored — no damage-resistance profile.` spans the columns. (Root cause: those blueprints omit `ArmourType` and are not world structures with a known wiki profile — genuinely unarmored, not a bug. Town Base, Safe House and Relic Base are overridden to Garrison House / Tier3Structure respectively.)
  - **Filtered damage types:** `HIDDEN_DAMAGE_TYPES = {Karate, PoisonGas, GroundZero, Decay,
    Environment, Incendiary, Extinguishing}` are skipped at render (faithful in data, hidden for
    display). `IncendiaryHighExplosive` is intentionally **kept** (distinct mechanic). 8 deprecated
    ammo codes with no icon are dropped via the build-time `hasIcon` flag.
  - **Page order** — non-family items: main infobox → Resistances/destruction pane → description →
    unformatted fields → missing wiki fields → raw metadata. Families (synthesized pages):
    Resistances pane → description → raw metadata (no unformatted/missing lists, since those are
    per-item). **Production infobox** (see bullet below) sits right below the main infobox and is
    the first box on family pages, so effective order is main → Production → Resistances → …
    (families: Production → Resistances → …).
- Files: `process-game-data.js` (family detection post-pass; `hasIcon` from `ammoHasIcon()`),
  `Search.vue` (filter `inFamily`), `ItemDetail.vue` (`merged`/`familyMerged`/`mergedHeader` computeds + `.ktab` CSS).

### Production infobox (Jul 10, 2026)
- New "Production" infobox in `ItemDetail.vue`, **right below the main (stats) infobox** and
  first box on family pages. Lists every way an item is made/consumed as facility-calc-style
  recipe rows (building/garage icon + label · inputs → outputs; no time, no active highlighting;
  items clickable to navigate). Built by `src/components/production-recipes.js`.
- Recipe sources: facility recipes where the item is an **OUTPUT** (`recipesFor`) + where it is an
  **INPUT** ("used in", full list — `recipesWithInput` added to `recipes.mjs`); **build facility is data-driven** (resolves from game exports, not a blanket 'all vehicles → Garage'):
  `productionRecipes()` reads `vehicle.vehicleBuildType` → Shipyard/LargeShip=`Shipyard`,
  AircraftFactory=`Aircraft Hangar`, BuildableAnywhere=`World` (hammer pseudo-facility), default
  (VehicleFactory/VehicleFacility/RailTrackCrane/none)=`Garage`; and `structure.buildLocationType`
  → ConstructionYard=`Construction Yard`, Anywhere/Facility=`World` (hammer), default=`no build row` (an unknown/absent build location is NOT assumed to be a Construction Yard build). Structures are MPF-eligible only when `buildLocationType === 'ConstructionYard'` (world-placed structures are not mass-producible).
  Build rows use `buildCost`.
  **Exception:** `Crane` and `Construction` (the construction vehicle, "CV") emit BOTH a `World`
  (Hammer) and a `Garage` (MapIconVehicle) build row — built both in the field and at a Garage
  (see `DUAL_BUILD_WORLD_GARAGE` in production-recipes.js).
  **Factory** crate + **Mass Production Factory** from `crateCost`/`buildCost` via the MPF per-order
  discount math (moved out of `metadata-format.js`).
- **MPF mass-production is also available for shippable containers** (`ShippingContainer`,
  `ResourceContainer`, `LiquidContainer`) — each gets an `mpf-veh` row (5 shippable-crate orders =
  3 units × 3.5 discount; e.g. ShippingContainer = 1050 Cloth). They are deliberately EXCLUDED from
  `NON_MPF_WORLD_STRUCTURES`, which holds only static world structures (TownBase1/2/3, GarrisonStation
  & /1, StorageBox, StorageFacility, MaterialPlatform, FacilitySiloOil, Seaport, SignPost, WeaponRack,
  ResourceBox, ObservationTower).
- **Facility icon assets** (all mapped from game textures, re-emitted by `process-game-data.js` after
  its `rmSync` on `public/icons` so `build:data` never wipes them): `Shipyard.png` ← `DryDockItemIcon.png`,
  `Hammer.png` ← `HammerIcon.png`, `Energy.png` ← `IconFilterPower.png`, `MapIconVehicle.png` ← `MapIconVehicle.png`.
- **Crate-count display convention:** outputs are crate counts, not per-unit. A Factory order =
  `1c <item>` (1 crate); MPF = `9c <item>` (items) / `5c <item>` (vehicles/structures, shippable
  crates). `FacItem` appends `c` to `crateItems` (Infantry Kit Factory outputs + crate-form inputs)
  and `l` to `liquidItems`; the Production box sets an explicit `disp` (`1c`/`9c`/`5c`) on factory/MPF
  outputs so no spurious `c` is appended to the per-crate unit quantity.
- `FacItem.vue` props: `disp` (override qty label, used for `1c`/`9c`/`5c`), `link` (clickable →
  emits `select`), `plain` (suppress crate/liquid suffix).
- `metadata-format.js` no longer renders **Build cost / Factory cost / MPF cost** rows (moved here);
  Repair cost + Upgrade from remain. `buildCost`/`crateCost` are marked `used` so they don't appear
  in the unformatted-fields list.

---

## Jul 10 (night) — Wiki enrichment pipeline (reload / speed / crew / passengers)

**Status (updated 2026-07-10):** this pipeline was built to enrich `metadata.json` from the
Foxhole wiki, but the wiki is **no longer a data source** (see Data provenance) — `enrich-wiki.mjs`
was deleted, `build:data` is game-only, and the wiki-only fields are omitted from `metadata.json`.
The logic survives only in `tmp/wiki-check.mjs` as a sanity check. The underlying *data findings*
(below) about what is/isn't in the game exports remain valid and are summarized in **Known data quirks**.

**Why:** `ReloadTime` is absent from ALL game_data exports (only `mountData.reloadDuration`
for deployed weapons). `defaultSurfaceMovementRate` is a normalized 0..1 value, not km/h;
top speed is a full vehicle-sim output (tried to fit from `engineForce/mass/airResistance/
rollingResistance` → best R²≈0.53, no clean closed form). So these are wiki-published
constants, not derivable from the exported fields.

**Pipeline (offline + reproducible):**
- `tmp/night/wiki-fetch.mjs` — cached wiki fetcher (title resolution validated by infobox
  `codename`, 429 backoff; caches to `tmp/wiki/<codeName>.json`).
- `tmp/night/build-enrich.mjs` — emits `parser/data/wiki-enrich.json` (committed snapshot of
  wiki-only fields: `reload`, `fireRate`, `firingMode` for firearms; `speedKmh`, `offspeedKmh`,
  `crew`, `passengers` for land vehicles/boats; `encumbrance` fill for the 5 firearms the game
  data lacks).
- **Wiki is NOT a data source.** `parser/scripts/enrich-wiki.mjs` was deleted. The merge/compare
  logic moved to `tmp/wiki-check.mjs` (sanity check ONLY — compares `wiki-enrich.json` against
  game-derived `metadata.json`, reports wiki-only fields, never writes). `build:data` is now
  game-only (`= process-game-data.js`). `npm run check:wiki` runs the comparison.
- `src/parser/metadata-quality.test.mjs` — 14 tests; full suite 23 passing.

**Wiki-only fields (`reload`, `fireRate`, `firingMode`, `speedKmh`, `offspeedKmh`, `crew`,
`passengers`) are intentionally NOT in `metadata.json` — they are absent from the game
exports and the wiki is not a data source. They survive only in `wiki-enrich.json` for the
`tmp/wiki-check.mjs` sanity comparison. Game-derived fields that remain: `encumbrance`
(where the export has it) and `mountData.reloadDuration` for deployed weapons.
Aircraft/ship speed lives in `airData`/`shipData` (not yet enriched — follow-up).

**Display:** `metadata-format.js` shows Reload / Fire rate / Firing mode (weapons) and
Speed / Off-road speed / Crew / Passengers (land vehicles). `push()` no-ops on undefined,
so the app degrades gracefully if `enrich` wasn't run.

**Data-quality findings (all resolved/confirmed):** 5 firearms missing `encumbrance`
(SMGHeavyW/C, RifleW, RifleLightC, RifleAutomaticW) → filled from wiki. `maxAmmo:0` for
melee/launchers + flamethrowers is correct (no magazine). `engineForce:0` for 42 towed/relic
vehicles (trailers, train cars) is correct. **1 divergence kept:** `TrainEngine` fuelcap —
wiki 300 vs game 100; trust game files. `SMGHeavyW` wiki title was mis-resolving to a patch
page → fixed with a title override + codename validation.

---

## Jul 10 (bug scan) — 3 fixes
- **MPF cost bug** (`production-recipes.js`): per-crate-per-material flooring zeroed out 1-unit
  crate materials (Coke's Cloth → 0). Fixed to floor the aggregated discounted total per material
  once (Coke → Cloth ×5). New test `src/components/production-recipes.test.mjs`.
- **ALWAYS_RAW toggle dead** (`FacilityCalc.vue`): `calc.skipAutoImport` was defined but never
  called; `handleInputClick` always ran `toggleImported`, so default-raw toggles (Coal/Metal/
  Sulfur/Components/Oil) did nothing. `plan` now respects `skipAutoImport` and the click handler
  branches by `DEFAULT_IMPORTED`.
- **Wiki "missing fields" false positive** (`metadata-format.js`): `WIKI_FIELDS` used
  `'Fire Rate'`/`'Firing Mode'` but rows are labeled `'Fire rate'`/`'Firing mode'`, so enriched
  weapons were wrongly listed as missing those fields. Label strings aligned.
- **Recorded + FIXED (2026-07-10):** greedy `resolvePlan` over-count when a desired
  item is also a byproduct of another desired item's recipe. Fixed via producer-first
  ordering in resolver.mjs (items whose recipe emits a byproduct run before the rest,
  so the byproduct surplus is absorbed by later demand). Regression test in
  facilities.test.mjs. Deep byproduct chains still imperfect (documented in NIGHT_LOG).

- **Trains show coal consumption, not fuel cap** (`metadata-format.js`, 2026-07-10): in
  the Land Vehicle case, trains (codeName `/^(Train|SmallTrain)/i`) push a `Coal` row
  as `[{qty: fuelCapacity, code:'Coal'}]`, rendered qty×icon like Repair cost (small
  loco cap 100 → "100 × [coal]"; future large cap 300 auto-shows "300 × [coal]").
  Relic vehicles keep `Fuel cap` (they burn Petrol, not Coal). `metadata.Coal` exists
  so the icon resolves. UI/display change — restart `npm run dev` if a stale server runs.

- **Energy = pseudo-resource (2026-07-10):** Power is modeled as a pseudo-resource
  `Energy` (not in metadata.json). Power-producing recipes (`FacilityPowerDiesel`
  Diesel/Petrol/Coal plants, `FacilityPowerOil` Power Station + Sulfuric Reactor)
  get a SYNTHETIC `Energy` output in `recipes.mjs` (`push`): quantity =
  `powerDelta * duration / 3.6e6` MWh per run, only when `powerDelta > 0`.
  `engineRoomT2/T3` stay excluded via `SKIP_FACILITIES` (ReservePower, no real
  output). `energyMWh(recipe) = effectivePower * duration / 3.6e6` (true MWh;
  the old `/3600` was a kWh-as-MWh bug, fixed). `defaultPowerRecipe()` =
  Power Station (Oil).
  - **Default = imported** (no auto-resolution → no chicken-and-egg). `calc.energyImported`
    (store, default `true`) drives it. The resolver (`resolvePlan`) takes
    `opts.energyImported`; if `false` OR `selectedRecipes['Energy']` is set AND
    there is a net deficit, it adds the chosen power recipe (selected or
    `defaultPowerRecipe`) to cover the deficit; its FUEL goes to `raw` (NOT
    enqueued) so a fuel that itself needs power can't loop. Cycle-free + bounded.
  - **UI:** `FacilityCalc.vue` shows an `Energy` row LAST in **Imports** (import
    mode, value = deficit MWh) or **Intermediates** (produced mode, value =
    produced MWh), styled `<Energy icon> <qty> MWh` with normal-font "MWh",
    clickable to toggle `calc.energyImported`. `reachableRecipes` always includes
    the power recipes under an `Energy` group, so clicking one produces power
    (covers the deficit). `rawDisplay` merges raw+inputs additively (so power
    fuel sums with default-imported fuel).
  - **Recipe chips:** `PowerChip.vue` shows magnitude ONLY (NO `+`/`-`); direction
    is color-coded — red = consumed (in), green = produced (out). `formatPower`
    uses `Math.abs(powerDelta)/1000` MW + ` (/5)` for multi-order. Metadata
    (`production-recipes.js`) FILTERS `Energy` out of recipe outputs (PowerChip
    already shows power) — so the metadata test asserting no `Energy` output
    still passes.
  - Icon `public/icons/Energy.png`; ItemDetail `.content` width = 800px. UI
    change — user restarts their own `:7173` dev server (agent must not run it).
