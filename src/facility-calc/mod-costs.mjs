// Build cost of facility modifications (upgrades) required by a resolved plan.
//
// The game_data exports contain NO modification build cost (only recipe I/O),
// so costs are wiki-sourced and stored in parser/data/facility-mod-costs.json
// (keyed by 'facilityKey|mod' -> { resourceCodeName: quantity }). This module
// is pure and unit-tested (see mod-costs.test.mjs).
import costs from '../../parser/data/facility-mod-costs.json' with { type: 'json' }
import { displayName } from './recipes.mjs'

// Build cost of a single (facilityKey, mod) pair, or null if unknown.
export function modBuildCost (facilityKey, mod) {
  return costs[facilityKey + '|' + mod] || null
}

// Aggregate build cost over every modification a plan actually uses.
// A modification is "required" when an active recipe carries that mod; base
// recipes (mod === null) need no upgrade. Multiple recipe rows that share a
// (facilityKey, mod) are counted once (you install one upgrade per facility).
// Returns a Map<resourceCodeName, totalQuantity>, aggregated across mods.
export function requiredModificationCosts (plan) {
  const totals = new Map()
  const seen = new Set()
  for (const p of plan.processes) {
    const fk = p.recipe.facilityKey
    const mod = p.recipe.mod
    if (!mod) continue
    const key = fk + '|' + mod
    if (seen.has(key)) continue
    seen.add(key)
    const cost = modBuildCost(fk, mod)
    if (!cost) continue
    for (const [code, qty] of Object.entries(cost)) {
      totals.set(code, (totals.get(code) || 0) + qty)
    }
  }
  return totals
}

// Stable display order: by resource display name.
export function sortedModCostEntries (totals) {
  return [...totals.entries()].sort((a, b) =>
    displayName(a[0]).localeCompare(displayName(b[0])))
}