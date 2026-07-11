// @vitest-environment happy-dom
// Regression test for the "can't unassign Reformer" bug.
//
// Root cause: the recipe-picker unassign path used `toggleImported`, a TOGGLE.
// When a resource had already been imported before being pinned to a recipe
// (e.g. Petrol imported, then switched to the Reformer), unassigning toggled
// it back OUT of the imported set, so it reverted to its default-produced
// recipe and stayed visible — looking like "can't unassign". Unassigning must
// FORCE-import (add if missing), not toggle.
import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import FacilityCalc from '../components/FacilityCalc.vue'
import { calc } from './store.mjs'
import { recipesFor } from './recipes.mjs'

function reset (opts = {}) {
  calc.active = true
  calc.desired = [{ codeName: 'FacilityMaterials1', qty: 50 }]
  calc.selectedRecipes = opts.selectedRecipes || {}
  calc.imported = [...(opts.imported || [])]
  calc.skipAutoImport = []
  calc.energyImported = true
}

async function focusPetrol (wrapper) {
  const row = wrapper.findAll('.inter-row,.input-row,.irreducible')
    .find(r => r.text().includes('Petrol'))
  if (row) await row.trigger('mouseenter')
  await wrapper.vm.$nextTick()
}

function recipeRow (wrapper, mod) {
  const row = wrapper.findAll('.recipe-row').find(r => r.text().includes(mod))
  if (!row) throw new Error(`no recipe-row for "${mod}"`)
  return row
}

// Pin Petrol to `mod` (simulates the user having switched to it), then click
// the now-active row ONCE to unassign, and assert it force-imports.
async function pinThenUnassign (mod, importedBefore = []) {
  const recipe = recipesFor('Petrol').find(r => (r.mod || null) === (mod === 'Oil Refinery' ? null : mod))
  reset({ selectedRecipes: { Petrol: recipe }, imported: importedBefore })
  const wrapper = mount(FacilityCalc)
  await focusPetrol(wrapper)
  await recipeRow(wrapper, mod).trigger('click') // active recipe -> unassign
  await wrapper.vm.$nextTick()
  return wrapper
}

describe('clicking an intermediate RESOURCE unassigns its pinned recipe', () => {
  // Mirrors the active-recipe click: clicking the left-panel resource row must
  // clear a manual pin AND import it. Before the fix, only toggleImported ran,
  // which is overridden by the pin (expandState force-produces the pinned
  // recipe) so the click looked like a no-op.
  async function clickResource (mod, importedBefore = []) {
    const recipe = recipesFor('Petrol').find(r => (r.mod || null) === (mod === 'Oil Refinery' ? null : mod))
    reset({ selectedRecipes: { Petrol: recipe }, imported: importedBefore })
    const wrapper = mount(FacilityCalc)
    const row = wrapper.findAll('.inter-row').find(r => r.text().includes('Petrol'))
    expect(row).toBeTruthy()
    await row.trigger('click') // left-panel resource click
    await wrapper.vm.$nextTick()
    return wrapper
  }

  it('Reformer pinned, click resource -> unassign (imported)', async () => {
    await clickResource('Reformer')
    expect(calc.selectedRecipes.Petrol).toBeUndefined()
    expect(calc.imported).toContain('Petrol')
  })

  it('BUG: Reformer pinned + already imported -> click resource STILL imports', async () => {
    await clickResource('Reformer', ['Petrol'])
    expect(calc.selectedRecipes.Petrol).toBeUndefined()
    expect(calc.imported).toContain('Petrol')
  })

  it('Oil Refinery pinned, click resource -> unassign (imported)', async () => {
    await clickResource('Oil Refinery')
    expect(calc.selectedRecipes.Petrol).toBeUndefined()
    expect(calc.imported).toContain('Petrol')
  })
})

describe('unassigning an active recipe force-imports it', () => {
  it('Reformer (consumes Water), Petrol not imported before', async () => {
    await pinThenUnassign('Reformer')
    expect(calc.selectedRecipes.Petrol).toBeUndefined()
    expect(calc.imported).toContain('Petrol')
  })

  it('BUG: Reformer, Petrol ALREADY imported before -> STILL imported', async () => {
    await pinThenUnassign('Reformer', ['Petrol'])
    // Previously toggleImported flipped Petrol out of imports, so it reverted
    // to its default-produced recipe and stayed visible.
    expect(calc.selectedRecipes.Petrol).toBeUndefined()
    expect(calc.imported).toContain('Petrol')
  })

  it('Oil Refinery (default), Petrol not imported before', async () => {
    await pinThenUnassign('Oil Refinery')
    expect(calc.selectedRecipes.Petrol).toBeUndefined()
    expect(calc.imported).toContain('Petrol')
  })

  it('Oil Refinery, Petrol ALREADY imported before -> STILL imported', async () => {
    await pinThenUnassign('Oil Refinery', ['Petrol'])
    expect(calc.selectedRecipes.Petrol).toBeUndefined()
    expect(calc.imported).toContain('Petrol')
  })
})