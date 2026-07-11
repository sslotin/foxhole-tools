// Facility Cost Calculator — planner (assignment-state algorithm).
//
// New model (per spec):
//   * The STATE is a map codeName -> recipe (or null). null means the resource
//     is IMPORTED (no recipe assigned). Targets begin imported; the planner
//     expands them by assigning a recipe to every non-basic, non-imported
//     resource that is reachable from the desired targets.
//   * BASIC_RESOURCES are terminal: they are never auto-assigned a recipe
//     (they stay imported). They are: salvage(Metal), coal, components,
//     sulfur, oil, energy.
//   * Evaluation runs in a FIXED ORDER (topological, respecting PRODUCED_BEFORE
//     plus consumer->input and producer->byproduct edges). A recipe's
//     by-products are added to a supply pool that reduces the demand of
//     resources processed LATER, so "produce X before Y" can drive Y's runs
//     to zero. Leftover supply is reported as byproducts.
//   * Energy is a normal assignable resource (codeName 'Energy'), measured in
//     MWh. Its demand = total power consumption from other recipes; assigning a
//     power recipe produces it (and any item by-products, e.g. Sulfur).
//
// Public entry: resolvePlan(desired, selectedRecipes, imported, opts) — keeps
// the historical signature so the UI/tests need minimal changes.

import {
  recipesFor, defaultRecipe, defaultPowerRecipe, energyMWh, effectiveDuration
} from './recipes.mjs'

// Terminal resources: when IMPORTED they are never auto-assigned a recipe
// (they stay imported). They are: salvage(Metal), coal, components, sulfur,
// oil, energy. This is the "initial algorithm pass" stop condition — basics are
// imported by default, so the expansion halts at them. But a basic is only
// terminal while it is imported: if the user opts out of importing one (removes
// it from the imported set) or explicitly assigns it a recipe, the planner
// manufactures it with its default recipe, letting the user "break down" a
// basic and explore further. So the terminal check below keys off `imported`,
// not BASIC_RESOURCES directly.
// salvage -> Metal, Coke -> FacilityCoal1, Heavy oil -> FacilityOil1,
// Cmats -> FacilityMaterials1 (see PRODUCED_BEFORE for the rest).
export const BASIC_RESOURCES = new Set([
  'Metal', 'Coal', 'Sulfur', 'Components', 'Oil', 'Energy'
])

// Fixed partial order: process `before` BEFORE `after` so that `before`'s
// by-products reduce `after`'s demand. Resource names mapped to codeNames.
//   SandbagMaterials/BarbedWireMaterials/MetalBeamMaterials before Cmats
//   Heavy oil (FacilityOil1) before Coke (FacilityCoal1)
//   Concrete before Oil
//   Oil before Sulfur
//   Coke (FacilityCoal1) before Sulfur
//   Energy before Sulfur
//   Coal before Sulfur
export const PRODUCED_BEFORE = [
  ['SandbagMaterials', 'FacilityMaterials1'],
  ['BarbedWireMaterials', 'FacilityMaterials1'],
  ['MetalBeamMaterials', 'FacilityMaterials1'],
  ['FacilityOil1', 'FacilityCoal1'],
  ['Concrete', 'Oil'],
  ['Oil', 'Sulfur'],
  ['FacilityCoal1', 'Sulfur'],
  ['Energy', 'Sulfur'],
  ['Coal', 'Sulfur']
]

const EPS = 1e-9

// First recipe (in data order) that produces `codeName`. Used during auto
// expansion ("pick the first recipe that produces an import").
function firstRecipeProducing (codeName) {
  const arr = recipesFor(codeName)
  return arr.length ? arr[0] : null
}

// Expand the desired targets into a full assignment state.
//   selectedRecipes: { codeName -> recipe | null }  (null = forced import)
//   imported: Set of codeNames the user forces to be imported
// Returns { codeName -> recipe | null }.
export function expandState (desired, selectedRecipes = {}, imported = new Set()) {
  const assigned = {}
  // User overrides win (recipe object, or null to force import).
  for (const [r, recipe] of Object.entries(selectedRecipes)) {
    if (recipe === undefined) continue
    assigned[r] = recipe // recipe may be a recipe object OR null
  }

  const queue = desired.map(d => d.codeName)
  const seen = new Set()
  while (queue.length) {
    const R = queue.shift()
    if (seen.has(R)) continue
    seen.add(R)
    if (R in assigned) {
      // User override fixed this resource. Still expand its inputs so the
      // chain continues beneath a manually-assigned recipe.
      const rec = assigned[R]
      if (rec) for (const inp of rec.inputs) if (!seen.has(inp.codeName)) queue.push(inp.codeName)
      continue
    }
    if (imported.has(R) || recipesFor(R).length === 0) {
      assigned[R] = null // imported (terminal / forced / no recipe)
      continue
    }
    const recipe = defaultRecipe(R) // first/default recipe producing R
    assigned[R] = recipe
    for (const inp of recipe.inputs) {
      if (!seen.has(inp.codeName)) queue.push(inp.codeName)
    }
  }

  // Guarantee every target is present (a target that is basic/imported lands as
  // null; a non-basic target gets its default recipe).
  for (const d of desired) {
    if (!(d.codeName in assigned)) {
      assigned[d.codeName] = imported.has(d.codeName) ? null : defaultRecipe(d.codeName)
    }
  }
  // Energy is a pseudo-resource: if it was manually assigned a power recipe
  // (via selectedRecipes.Energy), its inputs must also be expanded so they
  // become resolvable nodes. (In produce mode resolvePlan assigns the default
  // power recipe after this and calls expandInputs again.)
  if (assigned.Energy) expandInputs(assigned, imported, assigned.Energy)
  return assigned
}

// Expand a recipe's inputs into `assigned` (default recipe, or null if imported /
// no recipe), recursing through their inputs. Does NOT override an existing
// assignment. Used to pull a manually/produced power recipe's fuel requirements
// into the plan so evaluate() can resolve them.
function expandInputs (assigned, imported, recipe) {
  const queue = []
  for (const inp of recipe.inputs) if (!(inp.codeName in assigned)) queue.push(inp.codeName)
  while (queue.length) {
    const R = queue.shift()
    if (R in assigned) continue
    if (imported.has(R) || recipesFor(R).length === 0) { assigned[R] = null; continue }
    const rec = defaultRecipe(R)
    assigned[R] = rec
    for (const inp of rec.inputs) if (!(inp.codeName in assigned)) queue.push(inp.codeName)
  }
}

// Deterministic topological order over the resources present in `assigned`
// plus the targets. Edges:
//   * explicit PRODUCED_BEFORE constraints,
//   * for each assigned recipe:  resource -> each INPUT   (consumer before input)
//   * for each assigned recipe:  resource -> each BYPRODUCT (producer before byproduct)
// Priority: targets first, then non-basic, then basic; ties broken by name.
export function topoOrder (assigned, desired) {
  const nodes = new Set([...Object.keys(assigned), ...desired.map(d => d.codeName)])
  const edges = new Map() // a -> Set(b): a must come before b
  const link = (a, b) => {
    if (a === b || !nodes.has(a) || !nodes.has(b)) return
    if (!edges.has(a)) edges.set(a, new Set())
    edges.get(a).add(b)
  }
  for (const [a, b] of PRODUCED_BEFORE) link(a, b)
  for (const [R, rec] of Object.entries(assigned)) {
    if (!rec) continue
    for (const i of rec.inputs) link(R, i.codeName) // process R before its input
    for (const o of rec.outputs) if (o.codeName !== R) link(R, o.codeName) // producer before byproduct
  }

  const indeg = new Map()
  const adj = new Map()
  for (const n of nodes) indeg.set(n, 0)
  for (const [a, bs] of edges) {
    for (const b of bs) {
      if (!adj.has(a)) adj.set(a, new Set())
      adj.get(a).add(b)
      indeg.set(b, indeg.get(b) + 1)
    }
  }

  const targetSet = new Set(desired.map(d => d.codeName))
  const prio = (n) => (targetSet.has(n) ? 0 : BASIC_RESOURCES.has(n) ? 2 : 1)
  const available = new Set([...nodes].filter(n => indeg.get(n) === 0))
  const order = []
  while (available.size) {
    const next = [...available].sort((x, y) => prio(x) - prio(y) || (x < y ? -1 : 1))[0]
    available.delete(next)
    order.push(next)
    for (const b of (adj.get(next) || [])) {
      indeg.set(b, indeg.get(b) - 1)
      if (indeg.get(b) === 0) available.add(b)
    }
  }
  // Append any nodes left in a cycle (shouldn't happen for a valid DAG).
  for (const n of nodes) if (!order.includes(n)) order.push(n)
  return order
}

// Evaluate a full assignment state into imports / intermediates / byproducts /
// processes, in fixed order.
export function evaluate (assigned, desired, imported = new Set()) {
  const order = topoOrder(assigned, desired)

  const demand = {}
  for (const d of desired) demand[d.codeName] = (demand[d.codeName] || 0) + d.qty

  const supply = {}          // by-product pool (forward)
  const runs = {}            // runs per assigned resource
  const raw = {}             // import amounts (unassigned, by-product-adjusted)
  const inputs = {}          // subset of raw that the user forced imported
  const intermediate = {}    // assigned amounts (except targets)
  const byproducts = {}      // leftover supply
  const processes = []
  const involved = new Set()
  const targetSet = new Set(desired.map(d => d.codeName))

  const consumeSupply = (codeName, amount) => {
    // Pull `amount` from the supply pool of `codeName`; returns what was taken.
    const have = supply[codeName] || 0
    const take = Math.min(have, amount)
    supply[codeName] = have - take
    if (supply[codeName] <= EPS) delete supply[codeName]
    return take
  }

  for (const R of order) {
    const gross = demand[R] || 0
    const rec = assigned[R]

    // No recipe (imported / basic / none): import the unmet amount.
    // All unassigned resources (basic or user-forced) are imports, adjusted
    // by by-products — there is no separate "inputs" bucket (the spec treats
    // imports uniformly). `inputs` stays {} for backward-compat with the UI.
    if (!rec) {
      const unmet = Math.max(0, gross - (supply[R] || 0))
      if (unmet > EPS) raw[R] = (raw[R] || 0) + unmet
      consumeSupply(R, gross) // by-product covering part of demand is used up
      continue
    }

    // Assigned a recipe.
    involved.add(R)
    const out = rec.outputs.find(o => o.codeName === R)
    if (!out) {
      // Recipe doesn't actually produce R (shouldn't happen) — treat as import.
      const unmet = Math.max(0, gross - (supply[R] || 0))
      if (unmet > EPS) raw[R] = (raw[R] || 0) + unmet
      consumeSupply(R, gross)
      continue
    }

    const taken = consumeSupply(R, gross)        // by-product covering demand
    const need = Math.max(0, gross - taken)      // remaining to manufacture

    if (need > EPS) {
      const r = need / out.quantity
      runs[R] = (runs[R] || 0) + r
      if (!targetSet.has(R)) intermediate[R] = (intermediate[R] || 0) + need
      const time = effectiveDuration(rec) * r
      processes.push({ recipe: rec, runs: r, time, item: R })
      // Power consumption feeds the Energy demand (consumer before Energy edge).
      const e = energyMWh(rec) * r
      if (e < 0) demand.Energy = (demand.Energy || 0) - e // -e is positive consumption
      // By-products (everything except the primary output R) flow forward.
      for (const o of rec.outputs) {
        if (o.codeName === R) continue
        supply[o.codeName] = (supply[o.codeName] || 0) + r * o.quantity
      }
      // Inputs add to later demand.
      for (const i of rec.inputs) {
        demand[i.codeName] = (demand[i.codeName] || 0) + r * i.quantity
      }
    } else if (!targetSet.has(R)) {
      // Fully covered by by-products: recipe not run, but it's still assigned.
      intermediate[R] = (intermediate[R] || 0) + 0
    }
  }

  // Leftover supply => byproducts.
  for (const [k, v] of Object.entries(supply)) {
    if (v > EPS) byproducts[k] = v
  }

  return { raw, inputs, intermediate, byproducts, processes, involved, assigned }
}

// Public entry — compatible with the old resolver.mjs call shape.
export function resolvePlan (desired, selectedRecipes = {}, imported = new Set(), opts = {}) {
  const assigned = expandState(desired, selectedRecipes, imported)
  // Energy import/produce toggle. In IMPORT mode energy is always imported
  // (no power plant runs) — any manually-selected power recipe is ignored but
  // preserved in selectedRecipes so it reactivates when switched back to
  // produce. In PRODUCE mode a manual selection is kept, else the default
  // power recipe is used.
  if (opts.energyImported === false) {
    if (!('Energy' in assigned)) assigned.Energy = defaultPowerRecipe()
  } else {
    assigned.Energy = null
  }
  // Pull the power recipe's fuel/input requirements into the plan so evaluate
  // can resolve them. (In import mode assigned.Energy is null, so skipped.)
  if (assigned.Energy) expandInputs(assigned, imported, assigned.Energy)
  return evaluate(assigned, desired, imported)
}