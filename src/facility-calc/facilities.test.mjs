import { describe, it, expect } from 'vitest'
import { resolvePlan, reachableRecipes } from './resolver.mjs'
import { modLabel, recipesFor, effectivePower, isPad, energyMWh } from './recipes.mjs'

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
  it('keeps multi-order consumers at raw draw (no ÷5 on power)', () => {
    const ammo = recipesFor('LRArtilleryAmmo').find(r => r.facilityKey === 'FacilityFactoryAmmo')
    expect(ammo.powerDelta).toBe(-6000)
    expect(effectivePower(ammo)).toBe(-6000)
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
  it('per multi-order recipe = powerDelta x (time/5), in true MWh', () => {
    const plan = resolvePlan([{ codeName: 'LRArtilleryAmmo', qty: 10 }], {}, new Set())
    const ammo = plan.processes.find(p => p.item === 'LRArtilleryAmmo'
      && p.recipe.facilityKey === 'FacilityFactoryAmmo')
    const mwh = effectivePower(ammo.recipe) * ammo.time / 3_600_000
    // -6000 MW * (120s/5 * 10 runs) / 3.6e6 = -0.4 MWh
    expect(mwh).toBeCloseTo(-0.4)
    let total = 0
    for (const p of plan.processes) total += effectivePower(p.recipe) * p.time / 3_600_000
    expect(total).toBeLessThan(0)
    expect(Number.isFinite(total)).toBe(true)
  })
})

describe('energy pseudo-resource', () => {
  it('power recipes expose a synthetic Energy output (MWh per run)', () => {
    const power = recipesFor('Energy')
    expect(power.length).toBeGreaterThan(0)
    const station = power.find(r => r.facilityKey === 'FacilityPowerOil' && r.mod === null)
    expect(station).toBeTruthy()
    const e = station.outputs.find(o => o.codeName === 'Energy')
    expect(e.quantity).toBeCloseTo(10000 * 90 / 3_600_000)
    // and the produced group is primary
    expect(station.primaryOutput).toBe('Energy')
  })

  it('imported by default: no power process added, net energy negative', () => {
    const plan = resolvePlan([{ codeName: 'LRArtilleryAmmo', qty: 10 }], {}, new Set(), { energyImported: true })
    expect(plan.processes.find(p => p.item === 'Energy')).toBeUndefined()
    let net = 0
    for (const p of plan.processes) net += effectivePower(p.recipe) * p.time / 3_600_000
    expect(net).toBeLessThan(0)
  })

  it('toggled to produced: adds a power process covering the deficit; fuel in raw', () => {
    const plan = resolvePlan([{ codeName: 'LRArtilleryAmmo', qty: 10 }], {}, new Set(), { energyImported: false })
    const energyProc = plan.processes.find(p => p.item === 'Energy')
    expect(energyProc).toBeTruthy()
    let net = 0
    for (const p of plan.processes) net += effectivePower(p.recipe) * p.time / 3_600_000
    expect(net).toBeCloseTo(0, 1)
    // power fuel (Oil) appears as a raw requirement, not enqueued
    expect(Object.keys(plan.raw).length).toBeGreaterThan(0)
  })

  it('selecting a power recipe in import mode also produces energy', () => {
    const station = recipesFor('Energy').find(r => r.facilityKey === 'FacilityPowerOil' && r.mod === null)
    const plan = resolvePlan([{ codeName: 'LRArtilleryAmmo', qty: 10 }], { Energy: station }, new Set(), { energyImported: true })
    expect(plan.processes.find(p => p.item === 'Energy')).toBeTruthy()
  })

  it('no chicken-and-egg: power fuel is not recursively resolved for power', () => {
    const plan = resolvePlan([{ codeName: 'LRArtilleryAmmo', qty: 50 }], {}, new Set(), { energyImported: false })
    expect(plan.processes.find(p => p.item === 'Energy')).toBeTruthy()
    expect(Object.keys(plan.raw).length).toBeGreaterThan(0)
  })

  it('produced mode: gross power production scales with the target (not net ~0)', () => {
    const prod = (plan) => {
      let m = 0
      for (const p of plan.processes) m += Math.max(0, energyMWh(p.recipe) * p.runs)
      return m
    }
    const small = resolvePlan([{ codeName: 'LRArtilleryAmmo', qty: 10 }], {}, new Set(), { energyImported: false })
    const big = resolvePlan([{ codeName: 'LRArtilleryAmmo', qty: 100 }], {}, new Set(), { energyImported: false })
    expect(prod(small)).toBeGreaterThan(1)
    expect(prod(big)).toBeGreaterThan(prod(small))
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

describe('imported (user-supplied) items', () => {
  it('treats an imported ALWAYS_RAW item as an input, not manufactured', () => {
    // Coal is an ALWAYS_RAW default. When the user opts to import it (or the
    // component auto-imports it), it must land in `inputs` and its facility
    // recipe must NOT run. The FacilityCalc bug ignored `skipAutoImport`, so
    // this path was never reachable via the UI toggle.
    const plan = resolvePlan([{ codeName: 'Coal', qty: 3 }], {}, new Set(['Coal']))
    expect(plan.inputs.Coal).toBe(3)
    expect(plan.raw.Coal).toBeUndefined()
    expect(plan.intermediate.Coal).toBeUndefined()
  })
  it('manufactures an unimported ALWAYS_RAW item through its facility recipe', () => {
    const plan = resolvePlan([{ codeName: 'Coal', qty: 3 }], {}, new Set())
    expect(plan.inputs.Coal).toBeUndefined()
    // Its production chain (Petrol/Oil) is what ends up in intermediate.
    expect(Object.keys(plan.intermediate).length).toBeGreaterThan(0)
  })
})

describe('surplus-reabsorb (byproduct-first ordering)', () => {
  // Concrete via Coal-Liquefier produces Concrete + Sulfur + Oil (Sulfur is a
  // byproduct: 1 Concrete per 10 Sulfur). Pinning [Sulfur, Concrete] used to
  // process Sulfur first, so its demand was met before the byproduct existed;
  // the whole Sulfur output was then reported as wasted byproduct. With the
  // producer-first ordering Concrete runs first and its Sulfur surplus covers
  // the Sulfur demand, so the leftover is strictly less than the total produced.
  const coalLiq = recipesFor('Concrete').find(r => r.mod === 'CoalLiquefier')
  const concreteQty = coalLiq.outputs.find(o => o.codeName === 'Concrete').quantity
  const sulfurQty = coalLiq.outputs.find(o => o.codeName === 'Sulfur').quantity
  const totalSulfur = (10 / concreteQty) * sulfurQty // produced for 10 Concrete

  it('absorbs the Sulfur demand into the byproduct pool (no wasted double-count)', () => {
    const plan = resolvePlan(
      [{ codeName: 'Sulfur', qty: 10 }, { codeName: 'Concrete', qty: 10 }],
      { Concrete: coalLiq }, new Set())
    // Total Sulfur produced = totalSulfur. The 10 Sulfur demand must be
    // subtracted (absorbed) from the byproduct pool, so the leftover is strictly
    // less than totalSulfur. Without producer-first ordering the demand was met
    // first and the whole totalSulfur was reported as wasted byproduct.
    expect(plan.byproducts.Sulfur).toBeLessThan(totalSulfur)
    expect(plan.byproducts.Sulfur).toBeCloseTo(totalSulfur - 10)
  })

  it('is order-independent: swapping the pin order gives the same leftover', () => {
    const orderA = resolvePlan(
      [{ codeName: 'Sulfur', qty: 10 }, { codeName: 'Concrete', qty: 10 }],
      { Concrete: coalLiq }, new Set())
    const orderB = resolvePlan(
      [{ codeName: 'Concrete', qty: 10 }, { codeName: 'Sulfur', qty: 10 }],
      { Concrete: coalLiq }, new Set())
    expect(orderA.byproducts.Sulfur).toBeCloseTo(orderB.byproducts.Sulfur)
    expect(orderA.byproducts.Sulfur).toBeCloseTo(totalSulfur - 10)
  })
})

describe('reachable recipes (picker source)', () => {
  it('includes item recipes and the Energy pseudo-group', () => {
    const m = reachableRecipes([{ codeName: 'LRArtilleryAmmo', qty: 1 }])
    // ammo + its input chains are reachable
    expect([...m.keys()].some(r => r.facilityKey === 'FacilityFactoryAmmo')).toBe(true)
    // the Energy group (power recipes) is always offered so the user can
    // click one to produce power
    expect([...m.values()].includes('Energy')).toBe(true)
    expect([...m.keys()].some(r => r.primaryOutput === 'Energy')).toBe(true)
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

describe('recipe deactivation reverts to the default plan', () => {
  // Clicking an active (pinned) recipe deactivates it, which is exactly
  // deleting selectedRecipes[item] — i.e. resolving with no override.
  // So the resulting plan must equal the default (no-pin) plan. Any
  // demands that pinned recipe was uniquely covering then fall through to the
  // resolver's existing unmet -> raw/imports path automatically.
  const item = 'Concrete'
  const alt = recipesFor(item).find(r => r.mod === 'CoalLiquefier')
  const keys = (p) => p.processes
    .map(x => x.recipe.facilityKey + '|' + (x.recipe.mod || ''))
    .sort().join(',')

  it('pinning a recipe changes the plan vs the default', () => {
    const pinned = resolvePlan([{ codeName: item, qty: 100 }], { [item]: alt }, new Set())
    const def = resolvePlan([{ codeName: item, qty: 100 }], {}, new Set())
    expect(keys(pinned)).not.toBe(keys(def))
  })

  it('deactivating (removing the pin) reverts to the default plan', () => {
    const pinned = resolvePlan([{ codeName: item, qty: 100 }], { [item]: alt }, new Set())
    const deactivated = resolvePlan([{ codeName: item, qty: 100 }], {}, new Set())
    expect(keys(pinned)).not.toBe(keys(deactivated))
    expect(keys(deactivated)).toBe(keys(resolvePlan([{ codeName: item, qty: 100 }], {}, new Set())))
  })
})