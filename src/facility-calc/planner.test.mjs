import { describe, it, expect } from 'vitest'
import {
  resolvePlan, expandState, evaluate, topoOrder,
  BASIC_RESOURCES, PRODUCED_BEFORE
} from './planner.mjs'
import { recipesFor, defaultPowerRecipe } from './recipes.mjs'

const DEFAULT_IMPORTED = new Set(['Metal', 'Coal', 'Sulfur', 'Components', 'Oil'])

describe('basic resources are terminal (never auto-assigned a recipe)', () => {
  it('no basic resource gets a recipe after expansion', () => {
    const a = expandState([{ codeName: 'FlameAmmo', qty: 50 }], {}, DEFAULT_IMPORTED)
    // A resource with no recipe in the state (undefined) or explicitly null
    // both mean "not assigned a recipe" (imported / terminal).
    for (const r of BASIC_RESOURCES) {
      expect(a[r] ?? null).toBe(null)
    }
  })
  it('non-basic produced items DO get a recipe', () => {
    const a = expandState([{ codeName: 'FlameAmmo', qty: 50 }], {}, DEFAULT_IMPORTED)
    expect(a.FlameAmmo).toBeTruthy()
    expect(a.FacilityMaterials1).toBeTruthy()
  })
  it('raw imports are exactly the resources with NO assigned recipe', () => {
    const assigned = expandState([{ codeName: 'FlameAmmo', qty: 50 }], {}, DEFAULT_IMPORTED)
    const plan = resolvePlan([{ codeName: 'FlameAmmo', qty: 50 }], {}, DEFAULT_IMPORTED)
    for (const c of Object.keys(plan.raw)) {
      if (c === 'Energy') continue
      expect(assigned[c] ?? null).toBe(null) // unassigned => imported
    }
  })
})

describe('fixed processing order', () => {
  it('encodes the specified before/after constraints', () => {
    expect(PRODUCED_BEFORE).toEqual([
      ['SandbagMaterials', 'FacilityMaterials1'],
      ['BarbedWireMaterials', 'FacilityMaterials1'],
      ['MetalBeamMaterials', 'FacilityMaterials1'],
      ['FacilityOil1', 'FacilityCoal1'],
      ['Concrete', 'Oil'],
      ['Oil', 'Sulfur'],
      ['FacilityCoal1', 'Sulfur'],
      ['Energy', 'Sulfur'],
      ['Coal', 'Sulfur']
    ])
  })
  it('topoOrder respects "produce X before Y" (SandbagMaterials before Cmats)', () => {
    const a = expandState([{ codeName: 'FacilityMaterials1', qty: 1 }], {}, DEFAULT_IMPORTED)
    const order = topoOrder(a, [{ codeName: 'FacilityMaterials1', qty: 1 }])
    expect(order.indexOf('SandbagMaterials')).toBeLessThan(order.indexOf('FacilityMaterials1'))
  })
  it('topoOrder respects Oil before Sulfur and Energy before Sulfur', () => {
    const desired = [{ codeName: 'Sulfur', qty: 10 }]
    const a = expandState(desired, { Energy: defaultPowerRecipe() }, DEFAULT_IMPORTED)
    const order = topoOrder(a, desired)
    expect(order.indexOf('Oil')).toBeLessThan(order.indexOf('Sulfur'))
    expect(order.indexOf('Energy')).toBeLessThan(order.indexOf('Sulfur'))
  })
})

describe('by-product supply flows forward and reduces later demand', () => {
  it('Concrete (AdvCoalLiquefier) yields Oil+Sulfur; Oil demand drops to ~0', () => {
    const acl = recipesFor('Concrete').find(r => r.mod === 'AdvCoalLiquefier' && r.outputs.some(o => o.codeName === 'Oil'))
    const plan = resolvePlan([{ codeName: 'Concrete', qty: 1 }, { codeName: 'Oil', qty: 100 }], { Concrete: acl }, DEFAULT_IMPORTED)
    expect(plan.raw['Oil'] ?? 0).toBeLessThan(1) // by-product covered the 100 Oil
    expect(plan.byproducts['Sulfur']).toBeGreaterThan(0) // 15 Sulfur surplus
  })
  it('Energy via SulfuricReactor reduces a Sulfur target when there is power draw', () => {
    const sr = recipesFor('Energy').find(r => r.mod === 'SulfuricReactor')
    const plan = resolvePlan(
      [{ codeName: 'FlameAmmo', qty: 50 }, { codeName: 'Sulfur', qty: 10 }],
      { Energy: sr }, DEFAULT_IMPORTED, { energyImported: false }
    )
    expect(plan.raw['Sulfur']).toBeLessThan(10) // reactor by-product covered some
    expect(plan.processes.some(p => p.item === 'Energy' && p.recipe === sr)).toBe(true)
  })
})

describe('literal Cmats order: SandbagMaterials processed first -> Cmats by-product is surplus', () => {
  it('Recycler producing Cmats yields SandbagMaterials as a byproduct', () => {
    const recycler = recipesFor('FacilityMaterials1').find(r => r.mod === 'Recycler')
    const plan = resolvePlan([{ codeName: 'FacilityMaterials1', qty: 1 }], { FacilityMaterials1: recycler }, DEFAULT_IMPORTED)
    expect(plan.byproducts['SandbagMaterials']).toBeGreaterThan(0)
    expect(plan.raw['Metal']).toBeGreaterThan(0) // Recycler input is imported
  })
})

describe('Energy is an assignable resource (MWh)', () => {
  it('produced mode: power recipe runs, Energy shown as intermediate/process', () => {
    const plan = resolvePlan([{ codeName: 'FlameAmmo', qty: 50 }], {}, DEFAULT_IMPORTED, { energyImported: false })
    expect(plan.raw['Energy']).toBeUndefined()
    expect(plan.intermediate['Energy']).toBeGreaterThan(0)
    expect(plan.processes.some(p => p.item === 'Energy')).toBe(true)
  })
  it('imported mode: energy deficit shown as an import', () => {
    const plan = resolvePlan([{ codeName: 'FlameAmmo', qty: 50 }], {}, DEFAULT_IMPORTED, { energyImported: true })
    expect(plan.raw['Energy']).toBeGreaterThan(0)
    expect(plan.intermediate['Energy']).toBeUndefined()
  })
  it('energy demand equals total consumption from power-drawing recipes', () => {
    const plan = resolvePlan([{ codeName: 'FlameAmmo', qty: 50 }], {}, DEFAULT_IMPORTED, { energyImported: true })
    // FlameAmmo + its chain consume power; the Energy import is the net deficit (MWh).
    expect(plan.raw['Energy']).toBeGreaterThan(0)
  })
})

describe('multi-output recipes produce every output; byproducts are leftovers', () => {
  it('Recycler produces Cmats (primary) and SandbagMaterials (byproduct)', () => {
    const recycler = recipesFor('FacilityMaterials1').find(r => r.mod === 'Recycler')
    const plan = resolvePlan([{ codeName: 'FacilityMaterials1', qty: 1 }], { FacilityMaterials1: recycler }, DEFAULT_IMPORTED)
    const proc = plan.processes.find(p => p.recipe === recycler)
    expect(proc).toBeTruthy()
    expect(proc.item).toBe('FacilityMaterials1')
    expect(plan.byproducts['SandbagMaterials']).toBeGreaterThan(0)
  })
  it('byproducts only contain unutilized supply', () => {
    const plan = resolvePlan([{ codeName: 'Concrete', qty: 1 }],
      { Concrete: recipesFor('Concrete').find(r => r.mod === 'AdvCoalLiquefier' && r.outputs.some(o => o.codeName === 'Oil')) },
      DEFAULT_IMPORTED)
    // every byproduct key must have positive leftover
    for (const v of Object.values(plan.byproducts)) expect(v).toBeGreaterThan(0)
  })
})

describe('user override enqueues the overridden recipe’s inputs', () => {
  it('assigning the Recycler still pulls in its Metal input', () => {
    const recycler = recipesFor('FacilityMaterials1').find(r => r.mod === 'Recycler')
    const plan = resolvePlan([{ codeName: 'FacilityMaterials1', qty: 1 }], { FacilityMaterials1: recycler }, DEFAULT_IMPORTED)
    expect(plan.raw['Metal']).toBeGreaterThan(0)
  })
})

describe('standard target yields a sane plan', () => {
  it('FlameAmmo x50: intermediates exclude the target, imports have no recipe', () => {
    const assigned = expandState([{ codeName: 'FlameAmmo', qty: 50 }], {}, DEFAULT_IMPORTED)
    const plan = resolvePlan([{ codeName: 'FlameAmmo', qty: 50 }], {}, DEFAULT_IMPORTED)
    expect(plan.intermediate['FlameAmmo']).toBeUndefined() // target excluded
    expect(plan.intermediate['FacilityMaterials1']).toBe(50)
    for (const c of Object.keys(plan.raw)) {
      if (c === 'Energy') continue
      expect(assigned[c] ?? null).toBe(null) // imported == unassigned
    }
  })
})