// Display-layer activation logic for the Facility Cost Calculator recipe
// picker. Kept pure (no Vue / no UI imports) so it can be unit-tested
// and shared with FacilityCalc.vue, which wires these into computeds. The
// tests in activation.test.mjs exercise the same functions.
//
// Two user-facing rules drive everything:
//   1. A recipe is clickable/activatable iff it PRODUCES at least one item
//      that is listed in the left panel as an Import (raw/mined) or an
//      Intermediate (manufactured in-chain). You can click to (re)choose how
//      such an item is produced. Desired targets and the Energy pseudo-resource
//      are deliberately excluded — a desired item's recipe is chosen by setting
//      its quantity, not by pinning a recipe.
//   2. You can click to DEACTIVATE any active recipe that ONLY produces
//      imports/intermediates (never a desired target / Energy). Such a recipe
//      is also clickable (rule 1), so the click is available; clicking
//      toggles it back to the resolver's default choice.

// Items the user may (re)choose a recipe for: things the plan lists as
// Imports (plan.raw + plan.inputs), Intermediates (plan.intermediate), or
// the Energy pseudo-resource (always relevant, so power-plant recipes stay
// clickable like any other intermediate producer). Returns a Set of codeNames.
export function relevantItems (plan) {
  const s = new Set()
  for (const c of Object.keys(plan.raw || {})) s.add(c)
  for (const c of Object.keys(plan.inputs || {})) s.add(c)
  for (const c of Object.keys(plan.intermediate || {})) s.add(c)
  s.add('Energy')
  return s
}

// Recipes the picker offers (clickable / not dimmed): those whose outputs
// intersect the relevant set. `reachable` is the Map<recipe, primaryOutput>
// returned by reachableRecipes().
export function activatableRecipes (reachable, relevant) {
  const set = new Set()
  for (const [r] of reachable) {
    if (r.outputs.some(o => relevant.has(o.codeName))) set.add(r)
  }
  return set
}

// Recipes the picker presents as clickable (bright, never dimmed): every
// activatable recipe PLUS every currently active (running/pinned) recipe.
// This enforces the invariant "an active recipe is never dimmed" — a pinned
// recipe can outlive its output leaving the relevant set, yet must stay
// clickable so the user can deactivate it. Dimmed (not clickable) is therefore
// everything else (neither activatable nor active). See activation.test.mjs.
export function clickableRecipes (reachable, relevant, active) {
  const set = activatableRecipes(reachable, relevant)
  for (const r of active) set.add(r)
  return set
}

// A recipe can be DEACTIVATED (clicked back to default) iff ALL its outputs
// are relevant — i.e. it only produces imports/intermediates, never a desired
// target or Energy. (A recipe with no outputs is never deactivatable.)
export function isDeactivatable (recipe, relevant) {
  return recipe.outputs.length > 0 &&
    recipe.outputs.every(o => relevant.has(o.codeName))
}

// Recipes actually running in the current plan, by identity.
export function activeRecipes (plan) {
  return new Set(plan.processes.map(p => p.recipe))
}

// Toggle a recipe selection. If `recipe` is already the chosen one for
// `item`, it is removed (deactivated -> reverts to the resolver default);
// otherwise it is pinned. Returns a NEW selectedRecipes object (does not
// mutate `src`). `item` is the primary output the recipe is chosen for.
export function toggleRecipe (src, item, recipe) {
  const next = { ...src }
  if (next[item] === recipe) delete next[item]
  else next[item] = recipe
  return next
}