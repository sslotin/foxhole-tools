// Display-layer activation logic for the Facility Cost Calculator recipe
// picker, adapted to the assignment-state model.
//
// Picker interaction (per spec):
//   * The right panel shows recipe options for a FOCUSED resource — the
//     resource the user is hovering in the left panel. When nothing is
//     focused it shows the options for producing each desired TARGET.
//   * A recipe is clickable (bright) iff it PRODUCES the focused resource (or,
//     with no focus, a target). Clicking it assigns that recipe to the
//     resource. Clicking an already-active recipe unassigns it (makes the
//     resource an import).
//   * Clickable also always includes every ACTIVE (running/assigned) recipe,
//     so an active recipe is never dimmed and can always be deactivated.
//     Dimmed (not clickable) is therefore everything else.
//
// These are pure functions (no Vue) so they can be unit-tested and shared with
// FacilityCalc.vue. activation.test.mjs exercises the same functions.

import { recipesFor } from './recipes.mjs'

// Recipes that directly produce `codeName` (primary or by-product output).
export function producingRecipes (codeName) {
  return recipesFor(codeName)
}

// Whether `recipe` is the one assigned to produce `codeName` SPECIFICALLY.
// A recipe can output several resources (e.g. CoalLiquefier -> Concrete+Sulfur
// +Oil); if it is assigned to Concrete it must NOT be highlighted as "active"
// for Sulfur or Oil. This is what the picker uses to light up the active row.
export function isActiveFor (assigned, codeName, recipe) {
  return assigned[codeName] === recipe
}

// Recipes that can be assigned to produce `codeName`, offered as picker
// options. Special exception: the Sulfuric Reactor is a power plant that only
// yields sulfur as a by-product, so it must NOT be presented as a sulfur
// recipe (it is still offered for Energy).
export function recipeOptions (codeName) {
  const opts = producingRecipes(codeName)
  if (codeName === 'Sulfur') return opts.filter(r => r.mod !== 'SulfuricReactor')
  return opts
}

// The resource(s) the right panel currently offers recipes for: the focused
// resource, or (when nothing is focused) every desired target codeName.
export function focusItems (focused, targets) {
  if (focused) return [focused]
  return targets.map(t => t.codeName)
}

// Recipes the picker offers (clickable / not dimmed): those whose outputs
// intersect the focused item(s), PLUS every currently active recipe.
// `reachable` is the Map<recipe, primaryOutput> from reachableRecipes().
export function clickableRecipes (reachable, focused, active, targets) {
  const set = new Set(active)
  const items = focusItems(focused, targets)
  for (const [r] of reachable) {
    if (items.some(it => r.outputs.some(o => o.codeName === it))) set.add(r)
  }
  // Also include recipes that produce a focused item even if they lie outside
  // the target dependency closure (e.g. producing a basic/imported resource
  // the user wants to manufacture). `reachable` only covers the closure.
  for (const it of items) for (const r of producingRecipes(it)) set.add(r)
  return set
}

// Recipes actually running in the current plan (assigned, non-null), by
// identity. `plan.assigned` is the full assignment-state map from planner.mjs.
export function activeRecipes (plan) {
  const s = new Set()
  for (const r of Object.values(plan.assigned || {})) if (r) s.add(r)
  return s
}

// A recipe can be deactivated (clicked back to an import) iff it is currently
// active (assigned). Clicking it unassigns the focused resource.
export function isDeactivatable (recipe, plan) {
  return activeRecipes(plan).has(recipe)
}

// Toggle a recipe assignment. If `recipe` is already the chosen one for
// `item`, it is removed (deactivated -> reverts to default/import); otherwise
// it is pinned. Returns a NEW selectedRecipes object (does not mutate `src`).
// `item` is the focused resource the recipe produces.
export function toggleRecipe (src, item, recipe) {
  const next = { ...src }
  // recipe === null is an explicit "unassign": drop the entry so the resource
  // falls back to its natural state (default recipe if produced, imported if
  // it is in the imported set). Clicking the already-active recipe also
  // unassigns (next[item] === recipe).
  if (recipe === null || next[item] === recipe) delete next[item]
  else next[item] = recipe
  return next
}