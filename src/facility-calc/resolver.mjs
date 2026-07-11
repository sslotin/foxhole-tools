// Resolve the cost of a set of desired outputs.
//
// The assignment-state algorithm now lives in src/facility-calc/planner.mjs
// (expandState + fixed-order evaluate). This module keeps the historical
// public surface (resolvePlan + reachableRecipes) so the UI and tests need
// minimal changes.

import { resolvePlan as plannerResolvePlan } from './planner.mjs'
import { recipesFor } from './recipes.mjs'

export function resolvePlan (desired, selectedRecipes, imported, opts) {
  return plannerResolvePlan(desired, selectedRecipes, imported, opts)
}

// Stable set of every recipe that COULD be involved in producing `desired`,
// considering ALL alternative recipes at every step. Graph closure over the
// recipe graph; does NOT depend on `selectedRecipes`, so the set of displayed
// recipes/sections stays stable when the user toggles a choice (only each
// recipe's lit/dim state changes).
//
// Returns a Map<recipe, primaryOutput>. See planner.mjs / recipes.mjs for the
// primaryOutput assignment rationale.
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
  // Energy is a pseudo-resource: always offer the power recipes so the user
  // can click one to produce power (covering the import need) or toggle
  // energy to 'produced'. Power recipes carry primaryOutput 'Energy'.
  for (const r of recipesFor('Energy')) {
    if (!result.has(r)) result.set(r, r.primaryOutput)
  }
  return result
}