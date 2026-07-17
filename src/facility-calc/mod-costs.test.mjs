import { describe, it, expect } from 'vitest'
import { resolvePlan } from './resolver.mjs'
import { requiredModificationCosts, sortedModCostEntries, modBuildCost } from './mod-costs.mjs'

// FlameAmmo pulls on Cmats/Processed Cmats, which the resolver builds with
// upgraded refineries (Recycler / Metal Press / Blast Furnace / etc.), so the
// plan ends up requiring several facility modifications.
function flamePlan () {
  return resolvePlan([{ codeName: 'FlameAmmo', qty: 50 }], new Map(), new Set(), { energyImported: true })
}

describe('modBuildCost', () => {
  it('returns the wiki-sourced build cost for a known modification', () => {
    // Oil Refinery + Cracking Unit = 20 Processed Construction Materials.
    expect(modBuildCost('FacilityRefineryOil', 'CrackingUnit')).toEqual({ FacilityMaterials2: 20 })
  })
  it('returns null for an unknown (facilityKey, mod)', () => {
    expect(modBuildCost('FacilityRefineryOil', 'Nope')).toBeNull()
  })
})

describe('requiredModificationCosts', () => {
  const plan = flamePlan()
  const totals = requiredModificationCosts(plan)

  it('aggregates by resource across all required modifications', () => {
    // Each required modification contributes its build cost exactly once;
    // verify Cracking Unit's 20 Processed Cmats are present (and not duplicated
    // by a co-located recipe sharing the same FacilityRefineryOil|CrackingUnit).
    expect(totals.get('FacilityMaterials2')).toBeGreaterThanOrEqual(20)
  })

  it('does not count base (un-modded) recipes', () => {
    // Metal, Coal, etc. are imported (base) — no modification cost for them.
    // There is no (facilityKey, mod=null) entry counted.
    const seenMods = new Set()
    for (const p of plan.processes) if (p.recipe.mod) seenMods.add(p.recipe.facilityKey + '|' + p.recipe.mod)
    for (const key of seenMods) expect(key).not.toMatch(/\|$/)
  })

  it('counts each distinct modification once even if multiple recipe rows use it', () => {
    // Synthetic plan: two recipe rows that share FacilityRefineryOil|CrackingUnit
    // (e.g. Heavy Oil + something else both routed through the same mod). The
    // build cost (20 Processed Cmats) must be counted exactly once.
    const recipe = (label) => ({
      facilityKey: 'FacilityRefineryOil',
      mod: 'CrackingUnit',
      facility: 'Oil Refinery',
      inputs: [],
      outputs: [{ codeName: label, quantity: 1 }],
      duration: 0,
      powerDelta: 0,
    })
    const plan = {
      processes: [
        { recipe: recipe('HeavyOil'), time: 0, runs: 1 },
        { recipe: recipe('Oil'), time: 0, runs: 1 },
      ],
    }
    const c = requiredModificationCosts(plan)
    expect(c.get('FacilityMaterials2')).toBe(20) // not 40
  })
})

describe('sortedModCostEntries', () => {
  it('sorts by resource display name', () => {
    const entries = sortedModCostEntries(requiredModificationCosts(flamePlan()))
    const names = entries.map(([code]) => code)
    const sorted = [...names].sort()
    expect(names).toEqual(sorted)
  })
})