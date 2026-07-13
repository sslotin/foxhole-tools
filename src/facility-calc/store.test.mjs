import { describe, it, expect, beforeEach } from 'vitest'
import { nextTick } from 'vue'
import { calc, chooseRecipe, toggleEnergy, toggleImported, addDesired } from './store.mjs'
import { recipesFor, defaultRecipe } from './recipes.mjs'
import { resolvePlan } from './resolver.mjs'

const TARGET = [{ codeName: 'LRArtilleryAmmo', qty: 10 }]

function energyPlan (energyImported) {
  const eff = new Set(['Metal', 'Coal', 'Sulfur', 'Components', 'Oil'])
  return resolvePlan(TARGET, calc.selectedRecipes, eff, { energyImported })
}

describe('chooseRecipe — Energy pseudo-resource coordination', () => {
  beforeEach(() => {
    calc.selectedRecipes = {}
    calc.energyImported = true // start imported
  })

  it('assigning a power recipe while imported switches Energy to PRODUCE', () => {
    const station = recipesFor('Energy').find(r => r.facilityKey === 'FacilityPowerOil' && r.mod === null)
    chooseRecipe('Energy', station)
    expect(calc.energyImported).toBe(false) // now producing
    expect(calc.selectedRecipes.Energy).toBe(station)
    // Resolver reflects it: a power process now runs.
    expect(energyPlan(calc.energyImported).processes.find(p => p.item === 'Energy')).toBeTruthy()
  })

  it('unassigning a power recipe does not flip Energy back to import (flag left as-is)', () => {
    const station = recipesFor('Energy').find(r => r.facilityKey === 'FacilityPowerOil' && r.mod === null)
    chooseRecipe('Energy', station) // assigns -> produce (imported=false)
    chooseRecipe('Energy', station) // toggles off -> unassign
    expect(calc.selectedRecipes.Energy).toBeUndefined()
    expect(calc.energyImported).toBe(false) // unchanged by the unassign
    // No specific recipe, but import flag is false -> the DEFAULT power recipe runs.
    expect(energyPlan(calc.energyImported).processes.find(p => p.item === 'Energy')).toBeTruthy()
  })

  it('non-Energy items are unaffected by the energy coordination', () => {
    const recipe = recipesFor('FacilityMaterials1')[0]
    chooseRecipe('FacilityMaterials1', recipe)
    expect(calc.energyImported).toBe(true) // untouched
    expect(calc.selectedRecipes.FacilityMaterials1).toBe(recipe)
  })
})

describe('unassign a produced (intermediate) recipe -> import it', () => {
  // The picker calls toggleImported (non-basic) / toggleSkipAutoImport (basic)
  // when the active recipe is clicked, so the resource stops being produced
  // and is imported. This is the user-facing "click the assigned recipe to
  // unassign it" behaviour.
  beforeEach(() => { calc.selectedRecipes = {}; calc.imported = []; calc.skipAutoImport = [] })
  it('assigning then unassigning a non-basic recipe imports it', () => {
    const effWith = () => {
      const s = new Set(calc.imported)
      for (const c of ['Metal', 'Coal', 'Sulfur', 'Components', 'Oil']) if (!calc.skipAutoImport.includes(c)) s.add(c)
      return s
    }
    const reformer = recipesFor('Petrol').find(r => r.mod === 'Reformer')
    expect(reformer).toBeTruthy()
    chooseRecipe('Petrol', reformer) // produce via Reformer
    let plan = resolvePlan([{ codeName: 'FacilityMaterials1', qty: 5 }], calc.selectedRecipes, effWith(), { energyImported: true })
    expect(plan.assigned.Petrol).toBe(reformer)
    expect(plan.raw.Petrol).toBeUndefined()
    // The UI unassign does BOTH: clear the pin and mark imported.
    chooseRecipe('Petrol', null)
    toggleImported('Petrol') // unassign -> import
    plan = resolvePlan([{ codeName: 'FacilityMaterials1', qty: 5 }], calc.selectedRecipes, effWith(), { energyImported: true })
    expect(plan.raw.Petrol).toBeGreaterThan(0) // now imported
    expect(plan.assigned.Petrol).toBe(null)
  })
  it('chooseRecipe(item, null) still reverts a pin to the default recipe', () => {
    // Kept as a store-function guarantee; the UI now uses toggleImported for
    // unassign, but chooseRecipe(null) remains valid (reverts to default).
    const eff = new Set(['Metal', 'Coal', 'Sulfur', 'Components', 'Oil'])
    const options = recipesFor('FacilityMaterials1')
    const nonDefault = options.find(r => r !== defaultRecipe('FacilityMaterials1'))
    expect(nonDefault).toBeTruthy()
    chooseRecipe('FacilityMaterials1', nonDefault)
    chooseRecipe('FacilityMaterials1', null)
    expect(calc.selectedRecipes.FacilityMaterials1).toBeUndefined()
    const plan = resolvePlan([{ codeName: 'FacilityMaterials1', qty: 5 }], calc.selectedRecipes, eff, { energyImported: true })
    expect(plan.assigned.FacilityMaterials1).toBe(defaultRecipe('FacilityMaterials1'))
  })
})

describe('toggleEnergy — import/produce coordination', () => {
  beforeEach(() => {
    calc.selectedRecipes = {}
    calc.energyImported = true
  })

  it('toggling to import clears a stale power-recipe selection', () => {
    const station = recipesFor('Energy').find(r => r.facilityKey === 'FacilityPowerOil' && r.mod === null)
    chooseRecipe('Energy', station) // produces with this recipe
    expect(calc.selectedRecipes.Energy).toBe(station)
    toggleEnergy() // -> import
    expect(calc.energyImported).toBe(true)
    expect(calc.selectedRecipes.Energy).toBeUndefined() // stale selection cleared
  })

  it('toggling import<->produce leaves no lingering selection', () => {
    toggleEnergy() // import -> produce (no selection)
    expect(calc.energyImported).toBe(false)
    expect(calc.selectedRecipes.Energy).toBeUndefined()
    toggleEnergy() // produce -> import
    expect(calc.energyImported).toBe(true)
    expect(calc.selectedRecipes.Energy).toBeUndefined()
  })
})

describe('plan state resets only when all targets are unpinned', () => {
  beforeEach(() => {
    calc.desired = [{ codeName: 'FacilityMaterials1', qty: 50 }]
    calc.selectedRecipes = {}
    calc.imported = []
    calc.skipAutoImport = []
    calc.energyImported = true
  })

  it('adding a new target does NOT clear manual recipe choices', async () => {
    const recipe = recipesFor('FacilityMaterials1')[0]
    chooseRecipe('FacilityMaterials1', recipe)
    expect(calc.selectedRecipes.FacilityMaterials1).toBe(recipe)
    calc.desired.push({ codeName: 'FlameAmmo', qty: 10 }) // target set changed
    await nextTick()
    expect(calc.selectedRecipes.FacilityMaterials1).toBe(recipe) // preserved
  })

  it('changing a target quantity does NOT clear manual recipe choices', async () => {
    const recipe = recipesFor('FacilityMaterials1')[0]
    chooseRecipe('FacilityMaterials1', recipe)
    calc.desired[0].qty = 100
    await nextTick()
    expect(calc.selectedRecipes.FacilityMaterials1).toBe(recipe) // preserved
  })

  it('removing one of several targets does NOT reset', async () => {
    calc.desired.push({ codeName: 'FlameAmmo', qty: 10 })
    const recipe = recipesFor('FacilityMaterials1')[0]
    chooseRecipe('FacilityMaterials1', recipe)
    calc.desired.splice(0, 1) // remove one, one remains
    await nextTick()
    expect(calc.selectedRecipes.FacilityMaterials1).toBe(recipe) // preserved
  })

  it('removing the last target fully resets the plan state', async () => {
    const recipe = recipesFor('FacilityMaterials1')[0]
    chooseRecipe('FacilityMaterials1', recipe)
    calc.imported.push('Petrol')
    calc.skipAutoImport.push('Sulfur')
    calc.energyImported = false
    calc.desired.splice(0, 1) // remove last target -> empty
    await nextTick()
    expect(calc.selectedRecipes).toEqual({})
    expect(calc.imported).toEqual([])
    expect(calc.skipAutoImport).toEqual([])
    expect(calc.energyImported).toBe(true)
  })
})