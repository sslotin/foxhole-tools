import { describe, it, expect } from 'vitest'
import { resolvePlan, reachableRecipes } from './resolver.mjs'
import {
  clickableRecipes, activeRecipes, isDeactivatable,
  toggleRecipe, producingRecipes, focusItems, recipeOptions, isActiveFor
} from './activation.mjs'
import { recipesFor } from './recipes.mjs'

const DEFAULT_IMPORTED = ['Metal', 'Coal', 'Sulfur', 'Components', 'Oil']
const defaultImports = () => new Set(DEFAULT_IMPORTED)

// Helper: is `recipe` clickable under a given focus, per the focus model?
function isClickable (reachable, recipe, focused, active, targets) {
  return clickableRecipes(reachable, focused, active, targets).has(recipe)
}

describe('focus model: clickable = recipes producing the focus/target, ∪ active', () => {
  it('focusing a resource makes its producers clickable', () => {
    const reachable = reachableRecipes([{ codeName: 'FlameAmmo', qty: 1 }])
    const plan = resolvePlan([{ codeName: 'FlameAmmo', qty: 1 }], {}, defaultImports())
    const active = activeRecipes(plan)
    const sulfurRecipes = producingRecipes('Sulfur')
    expect(sulfurRecipes.length).toBeGreaterThan(0)
    for (const r of sulfurRecipes) {
      expect(isClickable(reachable, r, 'Sulfur', active, [{ codeName: 'FlameAmmo', qty: 1 }])).toBe(true)
    }
  })

  it('a recipe that does NOT produce the focus and is not active is dimmed', () => {
    const desired = [{ codeName: 'FlameAmmo', qty: 1 }]
    const reachable = reachableRecipes(desired)
    const plan = resolvePlan(desired, {}, defaultImports())
    const active = activeRecipes(plan)
    // Pick a recipe that is neither active nor produces the focused item.
    const focus = 'Sulfur'
    const candidates = [...reachable.keys()].filter(r =>
      !active.has(r) && !r.outputs.some(o => o.codeName === focus))
    expect(candidates.length).toBeGreaterThan(0)
    for (const r of candidates) {
      // It might still be clickable if it produces a target; exclude targets here.
      if (r.outputs.some(o => o.codeName === 'FlameAmmo')) continue
      expect(isClickable(reachable, r, focus, active, desired)).toBe(false)
    }
  })

  it('with no focus, recipes producing a target are clickable', () => {
    const desired = [{ codeName: 'FlameAmmo', qty: 1 }, { codeName: 'Concrete', qty: 1 }]
    const reachable = reachableRecipes(desired)
    const plan = resolvePlan(desired, {}, defaultImports())
    const active = activeRecipes(plan)
    for (const t of desired) {
      for (const r of producingRecipes(t.codeName)) {
        expect(isClickable(reachable, r, null, active, desired)).toBe(true)
      }
    }
  })

  it('focusItems: focused -> [focused]; no focus -> all target codeNames', () => {
    expect(focusItems('Oil', [{ codeName: 'FlameAmmo', qty: 1 }])).toEqual(['Oil'])
    expect(focusItems(null, [{ codeName: 'FlameAmmo', qty: 1 }, { codeName: 'Concrete', qty: 2 }]))
      .toEqual(['FlameAmmo', 'Concrete'])
  })
})

describe('invariant: active recipe is never dimmed; dimmed ⇔ not clickable', () => {
  it('holds for every single-item plan and several focus choices', () => {
    const desired = [{ codeName: 'FlameAmmo', qty: 30 }]
    const reachable = reachableRecipes(desired)
    const plan = resolvePlan(desired, {}, defaultImports())
    const active = activeRecipes(plan)
    const focusChoices = [null, 'Sulfur', 'Oil', 'FacilityMaterials1', 'FlameAmmo']
    for (const focused of focusChoices) {
      const clickable = clickableRecipes(reachable, focused, active, desired)
      // active ⊆ clickable
      for (const r of active) expect(clickable.has(r)).toBe(true)
      // dimmed ⇔ not clickable, for every reachable recipe
      for (const [r] of reachable) {
        const produces = (focused ? [focused] : desired.map(d => d.codeName))
          .some(it => r.outputs.some(o => o.codeName === it))
        expect(clickable.has(r)).toBe(produces || active.has(r))
      }
    }
  })
})

describe('isActiveFor (per-resource active highlight)', () => {
  it('a multi-output recipe is active only for the resource it is assigned to', () => {
    // CoalLiquefier outputs Concrete + Sulfur + Oil. If assigned to Concrete,
    // it must light up as active for Concrete but NOT for Sulfur/Oil.
    const coalLiq = producingRecipes('Sulfur').find(r => r.mod === 'CoalLiquefier')
    expect(coalLiq).toBeTruthy()
    const assigned = { Concrete: coalLiq }
    expect(isActiveFor(assigned, 'Concrete', coalLiq)).toBe(true)
    expect(isActiveFor(assigned, 'Sulfur', coalLiq)).toBe(false)
    expect(isActiveFor(assigned, 'Oil', coalLiq)).toBe(false)
    // A DIFFERENT Concrete recipe (not coalLiq) is not the assigned one.
    const otherConcrete = producingRecipes('Concrete').find(r => r !== coalLiq)
    expect(otherConcrete).toBeTruthy()
    expect(isActiveFor(assigned, 'Concrete', otherConcrete)).toBe(false)
  })
})

describe('recipeOptions (picker options for a resource)', () => {
  it('excludes the Sulfuric Reactor from sulfur options (power plant, by-product only)', () => {
    const sulfurOpts = recipeOptions('Sulfur')
    expect(sulfurOpts.every(r => r.mod !== 'SulfuricReactor')).toBe(true)
    // but the non-power sulfur producers are still offered
    const mods = sulfurOpts.map(r => r.mod)
    expect(mods).toContain('CokeFurnace')
    expect(mods).toContain('CoalLiquefier')
    expect(mods).toContain('AdvCoalLiquefier')
  })
  it('still offers the Sulfuric Reactor for Energy', () => {
    expect(recipeOptions('Energy').some(r => r.mod === 'SulfuricReactor')).toBe(true)
  })
  it('for other resources, options equal all producing recipes', () => {
    expect(recipeOptions('Oil')).toEqual(producingRecipes('Oil'))
    expect(recipeOptions('Concrete')).toEqual(producingRecipes('Concrete'))
  })
  it('picker grouping mirrors FacilityCalc: one group per focus/target', () => {
    const targets = [{ codeName: 'FlameAmmo', qty: 5 }, { codeName: 'Concrete', qty: 3 }]
    const buildGroups = (focused) =>
      focusItems(focused, targets).map(codeName => ({ codeName, recipes: recipeOptions(codeName) }))
    // no focus -> one group per target (so multiple groups for multiple targets)
    const noFocus = buildGroups(null)
    expect(noFocus.map(g => g.codeName)).toEqual(['FlameAmmo', 'Concrete'])
    // focus -> a single group for the focused resource
    const focused = buildGroups('Sulfur')
    expect(focused.map(g => g.codeName)).toEqual(['Sulfur'])
    expect(focused[0].recipes.every(r => r.mod !== 'SulfuricReactor')).toBe(true)
  })
})

describe('toggleRecipe (assign / unassign)', () => {
  it('pins a recipe for an item', () => {
    const r = producingRecipes('Sulfur')[0]
    const next = toggleRecipe({}, 'Sulfur', r)
    expect(next.Sulfur).toBe(r)
  })
  it('unpins when the same recipe is toggled again', () => {
    const r = producingRecipes('Sulfur')[0]
    const next = toggleRecipe({ Sulfur: r }, 'Sulfur', r)
    expect(next.Sulfur).toBeUndefined()
  })
  it('null explicitly unassigns (drops the entry -> natural state)', () => {
    const r = producingRecipes('Sulfur')[0]
    const next = toggleRecipe({ Sulfur: r }, 'Sulfur', null)
    expect(next.Sulfur).toBeUndefined()
  })
  it('null on an unassigned item is a no-op', () => {
    const next = toggleRecipe({}, 'Sulfur', null)
    expect(next.Sulfur).toBeUndefined()
  })
})

describe('activeRecipes / isDeactivatable reflect the assignment state', () => {
  it('activeRecipes are the assigned (non-null) recipes', () => {
    const plan = resolvePlan([{ codeName: 'FlameAmmo', qty: 10 }], {}, defaultImports())
    const active = activeRecipes(plan)
    expect(active.size).toBeGreaterThan(0)
    // every assigned recipe object is in the active set
    for (const r of Object.values(plan.assigned)) if (r) expect(active.has(r)).toBe(true)
  })
  it('isDeactivatable iff the recipe is active', () => {
    const desired = [{ codeName: 'FlameAmmo', qty: 10 }]
    const plan = resolvePlan(desired, {}, defaultImports())
    const active = activeRecipes(plan)
    const anyActive = [...active][0]
    expect(isDeactivatable(anyActive, plan)).toBe(true)
    const someInactive = [...reachableRecipes(desired).keys()].find(r => !active.has(r))
    if (someInactive) expect(isDeactivatable(someInactive, plan)).toBe(false)
  })
})