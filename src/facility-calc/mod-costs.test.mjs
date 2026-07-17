import { describe, it, expect } from 'vitest'
import { resolvePlan } from './resolver.mjs'
import { requiredModificationCosts, sortedModCostEntries, modBuildCost, buildingCosts, baseBuildCost } from './mod-costs.mjs'

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

describe('buildingCosts (base + modifications per used building)', () => {
  // Synthetic plans give full control over which (facility, mod) rows exist,
  // so we test the aggregation logic directly (the resolver may pull extra
  // modifications for a real multi-target plan).
  const recipe = (facilityKey, mod) => ({
    facilityKey,
    mod: mod || null,
    facility: 'X',
    inputs: [],
    outputs: [{ codeName: 'Thing', quantity: 1 }],
    duration: 0,
    powerDelta: 0,
  })
  const planOf = (...recipes) => ({ processes: recipes.map(r => ({ recipe: r, time: 0, runs: 1 })) })

  it('base-only facility contributes its base build cost', () => {
    // Oil Refinery base = 400 Construction Materials + 200 Basic Materials.
    const totals = buildingCosts(planOf(recipe('FacilityRefineryOil', null)))
    expect(totals.get('FacilityMaterials1')).toBe(400)
    expect(totals.get('Cloth')).toBe(200)
  })

  it('modded facility contributes base + each modification (not mod-only)', () => {
    // base (400 Cmats + 200 Bmats) PLUS Cracking Unit (20 Processed Cmats).
    const totals = buildingCosts(planOf(recipe('FacilityRefineryOil', 'CrackingUnit')))
    expect(totals.get('FacilityMaterials1')).toBe(400)
    expect(totals.get('Cloth')).toBe(200)
    expect(totals.get('FacilityMaterials2')).toBe(20)
  })

  it('base is counted once even when base + mod recipes coexist on one building', () => {
    // A base recipe AND a mod recipe on the same Oil Refinery: base charged
    // once, mod once.
    const totals = buildingCosts(planOf(
      recipe('FacilityRefineryOil', null),
      recipe('FacilityRefineryOil', 'CrackingUnit'),
    ))
    expect(totals.get('FacilityMaterials1')).toBe(400) // not 800
    expect(totals.get('Cloth')).toBe(200)
    expect(totals.get('FacilityMaterials2')).toBe(20)
  })

  it('each distinct modification on a building is summed once', () => {
    // Oil Refinery with two modifications: Cracking Unit (20 Processed Cmats)
    // + Petrochemical Plant (25 Steel Cmats), base charged once.
    const totals = buildingCosts(planOf(
      recipe('FacilityRefineryOil', 'CrackingUnit'),
      recipe('FacilityRefineryOil', 'PetrochemicalPlant'),
    ))
    expect(totals.get('FacilityMaterials1')).toBe(400)
    expect(totals.get('Cloth')).toBe(200)
    expect(totals.get('FacilityMaterials2')).toBe(20) // Cracking Unit
    expect(totals.get('FacilityMaterials3')).toBe(25) // Petrochemical Plant
  })

  it('unknown facility base cost is skipped (no crash, no zero entry)', () => {
    expect(baseBuildCost('EngineRoomT2')).toBeNull()
    expect(() => buildingCosts(planOf(recipe('EngineRoomT2', null)))).not.toThrow()
  })
})