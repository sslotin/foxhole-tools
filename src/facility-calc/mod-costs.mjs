// Build cost of facility buildings (base + modifications) required by a resolved
// plan.
//
// The game_data exports contain NO facility build cost (only recipe I/O and a
// per-facility RepairCost), so costs are wiki-sourced (foxhole.wiki.gg, v1.65)
// and stored in two override tables under parser/scripts/overrides/:
//   - facility-base-costs.json : facilityKey -> { resourceCodeName: qty }
//   - facility-mod-costs.json  : 'facilityKey|mod' -> { resourceCodeName: qty }
// This module is pure and unit-tested (see mod-costs.test.mjs).
import baseCosts from '../../parser/scripts/overrides/facility-base-costs.json' with { type: 'json' }
import modCostTable from '../../parser/scripts/overrides/facility-mod-costs.json' with { type: 'json' }
import { displayName } from './recipes.mjs'

// Build cost of a single (facilityKey, mod) pair, or null if unknown.
export function modBuildCost (facilityKey, mod) {
  return modCostTable[facilityKey + '|' + mod] || null
}

// Base build cost of a facility (before any upgrades), or null if unknown.
export function baseBuildCost (facilityKey) {
  return baseCosts[facilityKey] || null
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

// Total build cost of every facility a plan actually uses: the base building
// cost (added once per used facilityKey) PLUS each required modification's cost
// (added once per distinct (facilityKey, mod)). A modded building always also
// needs its base, so both are summed. Returns Map<resourceCodeName, totalQty>.
export function buildingCosts (plan) {
  const totals = new Map()
  const seenFac = new Set()
  const seenMod = new Set()
  for (const p of plan.processes) {
    const fk = p.recipe.facilityKey
    // Base cost: once per physical building that appears in the plan.
    if (!seenFac.has(fk)) {
      seenFac.add(fk)
      const base = baseBuildCost(fk)
      if (base) for (const [code, qty] of Object.entries(base)) {
        totals.set(code, (totals.get(code) || 0) + qty)
      }
    }
    // Modification cost: once per distinct (facility, mod) used.
    const mod = p.recipe.mod
    if (mod) {
      const key = fk + '|' + mod
      if (!seenMod.has(key)) {
        seenMod.add(key)
        const cost = modBuildCost(fk, mod)
        if (cost) for (const [code, qty] of Object.entries(cost)) {
          totals.set(code, (totals.get(code) || 0) + qty)
        }
      }
    }
  }
  return totals
}

// Stable display order: by resource display name.
export function sortedModCostEntries (totals) {
  return [...totals.entries()].sort((a, b) =>
    displayName(a[0]).localeCompare(displayName(b[0])))
}

// Stable display order for the combined (base + mods) building costs.
export function sortedBuildingCostEntries (totals) {
  return sortedModCostEntries(totals)
}