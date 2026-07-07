// Worklist resolver for the facility cost calculator.
//
// Given desired outputs (codeName + quantity), an optional per-item recipe
// override, and an optional set of "imported" items (user-supplied inputs not
// manufactured), walks the recipe graph bottom-up and returns:
//   raw          — {item: qty} leaves you must source (no facility recipe, or
//                  produced only by node-consuming mines with no item inputs)
//   inputs       — {item: qty} items the user treats as imported (not
//                  manufactured, but counted as needed)
//   intermediate — {item: qty} of each resolvable item manufactured internally
//                  (net, after byproduct reuse), excluding the desired outputs
//   processes    — [{recipe, runs, time, item}] every recipe step that ran,
//                  one entry per (chosen-recipe, item)
//   involved     — Set of items that were manufactured (root + intermediate)
//
// Processes are assumed to run at FRACTIONAL scale — there is no integer
// run-count rounding and therefore no discretization excess. Byproducts are
// still produced exactly and reused to offset downstream demand; any leftover
// surplus is intentionally ignored (not returned).
//
// PRIMARY OUTPUT NOTE:
// The resolver itself is agnostic to `recipe.primaryOutput` — it processes
// every output of a recipe independently. The `primaryOutput` field exists
// purely for the reachableRecipes / display layer to decide where a multi-
// output recipe appears in the grouped UI. See recipes.mjs for the rationale
// behind each assignment.

import { defaultRecipe, facLabel, recipesFor } from './recipes.mjs'

const procKey = (recipe, item) => `${recipe.facilityKey}|${recipe.mod || ''}|${item}`
const EPS = 1e-9

export function resolvePlan (desired, selectedRecipes, imported = new Set()) {
  const raw = {}
  const intermediate = {}
  const inputs = {} // user-imported items (not manufactured)
  const excess = {} // internal byproduct surplus, reused but not returned
  const processes = {}
  const involved = new Set()

  const queue = desired.map(d => ({ item: d.codeName, qty: d.qty, root: true }))

  let guard = 0
  while (queue.length) {
    if (++guard > 200000) break // recipe-cycle guard
    const { item, qty, root } = queue.shift()
    if (!(qty > 0)) continue

    // Reuse any surplus byproduct of this item before manufacturing more.
    let need = qty
    const have = excess[item] || 0
    if (have > 0) {
      const take = Math.min(have, need)
      excess[item] = have - take
      if (excess[item] <= EPS) delete excess[item]
      need -= take
    }
    if (need <= EPS) continue

    // User-imported item: count as needed input, but don't manufacture.
    if (imported.has(item)) {
      inputs[item] = (inputs[item] || 0) + need
      continue
    }

    const recipe = selectedRecipes[item] || defaultRecipe(item)
    if (!recipe) {
      raw[item] = (raw[item] || 0) + need
      continue
    }

    involved.add(item)
    const outObj = recipe.outputs.find(o => o.codeName === item)
    if (!outObj) {
      raw[item] = (raw[item] || 0) + need
      continue
    }

    // Fractional runs — no rounding, no discretization excess.
    const runs = need / outObj.quantity
    const pkey = procKey(recipe, item)
    if (processes[pkey]) {
      processes[pkey].runs += runs
      processes[pkey].time += (recipe.duration || 0) * runs
    } else {
      processes[pkey] = { recipe, runs, time: (recipe.duration || 0) * runs, item }
    }

    // Node-consuming mine (no item inputs): the output is gathered, not
    // crafted, so it's a raw resource — never an intermediate.
    if (recipe.inputs.length === 0) {
      raw[item] = (raw[item] || 0) + need
      continue
    }

    // Real manufacturing (has item inputs): non-root items are intermediate.
    if (!root) intermediate[item] = (intermediate[item] || 0) + need

    // Byproducts → surplus for downstream reuse.
    for (const out of recipe.outputs) {
      if (out.codeName === item) continue
      excess[out.codeName] = (excess[out.codeName] || 0) + runs * out.quantity
    }

    for (const inp of recipe.inputs) {
      queue.push({ item: inp.codeName, qty: inp.quantity * runs, root: false })
    }
  }

  const processList = Object.values(processes).sort((a, b) => {
    const la = facLabel(a.recipe), lb = facLabel(b.recipe)
    return la === lb ? a.item.localeCompare(b.item) : la.localeCompare(lb)
  })

  // Leftover byproduct surplus (produced as a side output but not reused).
  // Surfaced for display under "Byproducts". An item can appear here alongside
  // its primary entry in raw/intermediate when its byproduct is generated after
  // its own demand was already satisfied.
  const byproducts = {}
  for (const [k, v] of Object.entries(excess)) if (v > EPS) byproducts[k] = v

  return { raw, intermediate, byproducts, processes: processList, involved, inputs }
}

// Stable set of every recipe that COULD be involved in producing `desired`,
// considering ALL alternative recipes at every step. This is a graph closure
// over the recipe graph and does NOT depend on `selectedRecipes` — so the set
// of displayed recipes/sections stays stable when the user toggles a choice
// (only each recipe's lit/dim state changes).
//
// Returns a Map<recipe, presentedItem> where `presentedItem` is the primary
// output of the recipe (as defined in recipes.mjs). This means:
//   * Single-output recipes are always presented under their only output.
//   * Multi-output recipes are presented under their designated primary output
//     (e.g. the Sulfur Excavator recipe appears under "Coal", not "Sulfur";
//     Assembly Bay recipes appear under "Sandbags" / "Barbed Wire" / "Metal
//     Beam", not "Cmats").
//
// The stable closure (vs. the chosen plan) ensures that unselecting a recipe
// never causes its section to disappear — it just dims. The primary output
// assignment ensures that recipes are grouped by what the player considers the
// main product, regardless of which output triggered the BFS inclusion.
export function reachableRecipes (desired) {
  const result = new Map()
  const seen = new Set()
  const queue = desired.map(d => d.codeName)
  while (queue.length) {
    const item = queue.shift()
    if (seen.has(item)) continue
    seen.add(item)
    for (const r of recipesFor(item)) {
      if (!result.has(r)) result.set(r, r.primaryOutput)
      for (const inp of r.inputs) if (!seen.has(inp.codeName)) queue.push(inp.codeName)
    }
  }
  return result
}