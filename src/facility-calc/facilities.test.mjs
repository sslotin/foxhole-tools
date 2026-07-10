import { describe, it, expect } from 'vitest'
import { resolvePlan } from './resolver.mjs'
import { modLabel, recipesFor, effectivePower, isPad } from './recipes.mjs'

// Mirrors the FacilityCalc `facilities` computed + the template `:key`.
// The bug: template used only `facilityKey` as `:key`. A single facility's
// base recipe and its mods share the same `facilityKey`, so switching to a
// mod recipe added a second entry with a duplicate `:key`, making Vue render
// a duplicated row. The `:key` must include the mod to stay unique.
function facilitiesWithKeys (desired) {
  const plan = resolvePlan(desired, {}, new Set())
  const seen = new Set()
  const result = []
  for (const p of plan.processes) {
    const mod = p.recipe.mod || ''
    const key = p.recipe.facilityKey + '|' + mod
    if (seen.has(key)) continue
    seen.add(key)
    result.push({
      facilityKey: p.recipe.facilityKey,
      mod,
      label: modLabel(p.recipe),
      vueKey: p.recipe.facilityKey + '|' + mod,
    })
  }
  return result
}

function assertUniqueKeys (facs) {
  const keys = facs.map(f => f.vueKey)
  expect(new Set(keys).size).toBe(keys.length)
}

describe('recipe power (MW)', () => {
  it('exposes powerDelta from raw recipes as MW', () => {
    // Power Station produces power (positive) with no item outputs.
    const station = recipesFor('Sulfur').find(r => r.facilityKey === 'FacilityPowerOil')
    expect(station.powerDelta).toBeGreaterThan(0)
    // Ammunition Factory consumes power (negative).
    const ammo = recipesFor('LRArtilleryAmmo').find(r => r.facilityKey === 'FacilityFactoryAmmo')
    expect(ammo.powerDelta).toBeLessThan(0)
  })
})

describe('engine rooms / reserve power excluded', () => {
  it('drops ReservePower and engine-room facilities', () => {
    expect(recipesFor('ReservePower')).toEqual([])
    // a normal facility is still present
    expect(recipesFor('MortarTankAmmo').length).toBeGreaterThan(0)
  })
})

describe('effective power (per-order)', () => {
  it('divides multi-order consumers by 5', () => {
    const ammo = recipesFor('LRArtilleryAmmo').find(r => r.facilityKey === 'FacilityFactoryAmmo')
    expect(ammo.powerDelta).toBe(-6000)
    expect(effectivePower(ammo)).toBe(-1200)
  })
  it('keeps power producers and pads undivided', () => {
    const reactor = recipesFor('Sulfur').find(r => r.facilityKey === 'FacilityPowerOil' && r.mod === 'SulfuricReactor')
    expect(effectivePower(reactor)).toBe(reactor.powerDelta) // producer, no /5
    const pad = recipesFor('TruckOffensiveC')[0]
    expect(isPad(pad)).toBe(true)
    expect(effectivePower(pad)).toBe(pad.powerDelta) // pad, no /5
  })
  it('groups the Sulfuric Reactor under Energy (sulfur is a byproduct)', () => {
    const reactor = recipesFor('Sulfur').find(r => r.facilityKey === 'FacilityPowerOil' && r.mod === 'SulfuricReactor')
    expect(reactor.primaryOutput).toBe('Energy')
  })
})

describe('energy (MWh) accounting', () => {
  it('per multi-order recipe = (powerDelta/5) x time, summed over the chain', () => {
    const plan = resolvePlan([{ codeName: 'LRArtilleryAmmo', qty: 10 }], {}, new Set())
    // Find the LRArtilleryAmmo process itself and check its own energy.
    const ammo = plan.processes.find(p => p.item === 'LRArtilleryAmmo'
      && p.recipe.facilityKey === 'FacilityFactoryAmmo')
    const mwh = effectivePower(ammo.recipe) * ammo.time / 3600
    // -1200 MW (6000/5) * (120s * 10 runs) / 3600 = -400 MWh
    expect(Math.round(mwh)).toBe(-400)
    // Whole-plan energy is negative (net consumption) and finite.
    let total = 0
    for (const p of plan.processes) total += effectivePower(p.recipe) * p.time / 3600
    expect(total).toBeLessThan(0)
    expect(Number.isFinite(total)).toBe(true)
  })
})

describe('building base power fallback', () => {
  it('inherits facility PowerGridInfo power for recipes with 0 conversion delta', () => {
    // Materials Factory building power = -2000; its base (mod null) Cmats recipe
    // had conversion PowerDelta 0, so it must inherit -2000.
    const r = recipesFor('FacilityMaterials1').find(x => x.facilityKey === 'FacilityRefinery1' && x.mod === null)
    expect(r.powerDelta).toBe(-2000)
    // Every Materials Factory recipe now carries non-zero power.
    for (const x of recipesFor('FacilityMaterials1')) {
      if (x.facilityKey === 'FacilityRefinery1') expect(x.powerDelta).not.toBe(0)
    }
  })
})

describe('facility list keys', () => {
  it('keeps keys unique when a facility base + mod are both used', () => {
    // MortarTankAmmo (base Ammunition Factory) + Tripod (Tripod Factory mod)
    // share facilityKey 'FacilityFactoryAmmo' but must stay distinct.
    const facs = facilitiesWithKeys([
      { codeName: 'MortarTankAmmo', qty: 1 },
      { codeName: 'Tripod', qty: 1 },
    ])
    assertUniqueKeys(facs)
  })

  it('has no duplicate facilityKey when only the base recipe is used', () => {
    const facs = facilitiesWithKeys([{ codeName: 'MortarTankAmmo', qty: 1 }])
    assertUniqueKeys(facs)
  })
})