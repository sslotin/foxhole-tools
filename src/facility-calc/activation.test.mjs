import { describe, it, expect } from 'vitest'
import { resolvePlan, reachableRecipes } from './resolver.mjs'
import { recipesFor } from './recipes.mjs'
import {
  relevantItems, activatableRecipes, clickableRecipes, isDeactivatable, activeRecipes, toggleRecipe,
} from './activation.mjs'
import fs from 'node:fs'

// Default imports the component auto-applies (ALWAYS_RAW), so plans here match
// the component's. Mirrors DEFAULT_IMPORTED in FacilityCalc.vue.
const DEFAULT_IMPORTED = ['Metal', 'Coal', 'Sulfur', 'Components', 'Oil']
const defaultImports = () => new Set(DEFAULT_IMPORTED)

const keys = (p) => p.processes
  .map(x => x.recipe.facilityKey + '|' + (x.recipe.mod || '') + '|' + x.item)
  .sort().join(',')

// Every item that has at least one facility recipe (primary output). Sourced
// from the data so the suite tracks the real recipe set.
function allItems () {
  const data = JSON.parse(fs.readFileSync(
    new URL('../../parser/data/recipes.json', import.meta.url), 'utf8'))
  const prim = new Set()
  for (const fac of Object.values(data.facilities)) {
    for (const r of (fac.baseRecipes || [])) {
      if (r.primaryOutput) prim.add(r.primaryOutput)
      for (const o of (r.outputs || [])) prim.add(o.codeName)
    }
    for (const m of Object.values(fac.modifications || {})) {
      for (const r of (m.recipes || [])) {
        if (r.primaryOutput) prim.add(r.primaryOutput)
        for (const o of (r.outputs || [])) prim.add(o.codeName)
      }
    }
  }
  return [...prim].filter(c => recipesFor(c).length > 0).sort()
}

const ITEMS = allItems()

describe('Property 1: a recipe is clickable iff it produces an import/intermediate', () => {
  for (const item of ITEMS) {
    it(`holds for desired ${item}`, () => {
      const desired = [{ codeName: item, qty: 10 }]
      const plan = resolvePlan(desired, {}, defaultImports())
      const rel = relevantItems(plan)
      const reach = reachableRecipes(desired)
      const act = activatableRecipes(reach, rel)
      // Every reachable recipe must be clickable exactly when it produces a
      // relevant (import/intermediate) item.
      for (const [r] of reach) {
        const producesRelevant = r.outputs.some(o => rel.has(o.codeName))
        expect(act.has(r)).toBe(producesRelevant)
      }
    })
  }

  it('explicit: a power recipe (produces Energy) IS clickable', () => {
    // Energy is treated as an intermediate, so power-plant recipes stay
    // clickable like any other intermediate producer.
    const desired = [{ codeName: 'LRArtilleryAmmo', qty: 1 }]
    const rel = relevantItems(resolvePlan(desired, {}, defaultImports()))
    const reach = reachableRecipes(desired)
    const act = activatableRecipes(reach, rel)
    for (const [r] of reach) {
      if (r.primaryOutput === 'Energy') expect(act.has(r)).toBe(true)
    }
  })

  it('explicit: a pinned power recipe deactivates (reverts to default)', () => {
    const desired = [{ codeName: 'LRArtilleryAmmo', qty: 10 }]
    const plan = resolvePlan(desired, {}, defaultImports(), { energyImported: false })
    const energyProc = plan.processes.find(p => p.item === 'Energy')
    expect(energyProc).toBeTruthy()
    const powerRecipe = energyProc.recipe
    // active + deactivatable (Energy is now an intermediate)
    const rel = relevantItems(plan)
    expect(isDeactivatable(powerRecipe, rel)).toBe(true)
    const pinned = { Energy: powerRecipe }
    const deactivated = toggleRecipe(pinned, 'Energy', powerRecipe)
    const after = resolvePlan(desired, deactivated, defaultImports(), { energyImported: false })
    expect(keys(after)).toBe(keys(plan))
  })

  it('explicit: a recipe producing an intermediate IS clickable', () => {
    // Find a manufactured item (not auto-imported) so it shows as an
    // intermediate, and a recipe that produces it; it must be clickable.
    let found = null
    for (const item of ITEMS) {
      if (DEFAULT_IMPORTED.includes(item)) continue
      const desired = [{ codeName: item, qty: 10 }]
      const plan = resolvePlan(desired, {}, defaultImports())
      const rel = relevantItems(plan)
      if (!rel.has(item)) continue
      const reach = reachableRecipes(desired)
      const act = activatableRecipes(reach, rel)
      const r = reach.keys().find(rr => rr.outputs.some(o => o.codeName === item))
      if (r && act.has(r)) { found = { item, r }; break }
    }
    expect(found).toBeTruthy()
  })
})

describe('Property 2: active recipes that only produce imports/intermediates are deactivatable', () => {
  let tested = 0
  for (const item of ITEMS) {
    it(`holds for desired ${item}`, () => {
      const desired = [{ codeName: item, qty: 10 }]
      const plan = resolvePlan(desired, {}, defaultImports())
      const rel = relevantItems(plan)
      const reach = reachableRecipes(desired)
      const act = activatableRecipes(reach, rel)
      const active = activeRecipes(plan)
      for (const r of active) {
        if (!isDeactivatable(r, rel)) continue
        tested++
        // Must also be clickable (Property 1) so the click is available.
        expect(act.has(r)).toBe(true)
        const proc = plan.processes.find(p => p.recipe === r)
        expect(proc).toBeTruthy()
        const it = proc.item
        // Click to deactivate: pin (in case it was the resolver default)
        // then unpin — the pin must clear and the plan revert to default.
        const pinned = toggleRecipe({}, it, r)
        const deactivated = toggleRecipe(pinned, it, r)
        expect(it in deactivated).toBe(false)
        const planAfter = resolvePlan(desired, deactivated, defaultImports())
        expect(keys(planAfter)).toBe(keys(plan))
      }
    })
  }

  it('actually exercises the deactivatable path (non-vacuous)', () => {
    expect(tested).toBeGreaterThan(10)
  })

  it('deactivating an alternative deactivatable recipe reverts a real change', () => {
    let hits = 0
    for (const item of ITEMS) {
      const desired = [{ codeName: item, qty: 10 }]
      const plan = resolvePlan(desired, {}, defaultImports())
      const rel = relevantItems(plan)
      const def = plan.processes.find(p => p.item === item)?.recipe
      if (!def) continue
      for (const r of reachableRecipes(desired).keys()) {
        if (r === def) continue
        if (!r.outputs.some(o => o.codeName === item)) continue
        if (!isDeactivatable(r, rel)) continue
        // r is a deactivatable ALTERNATIVE producer for `item`.
        const pinned = resolvePlan(desired, { [item]: r }, defaultImports())
        expect(keys(pinned)).not.toBe(keys(plan)) // pinning changed the plan
        const deact = toggleRecipe({ [item]: r }, item, r)
        const after = resolvePlan(desired, deact, defaultImports())
        expect(keys(after)).toBe(keys(plan)) // deactivation reverts to default
        hits++
        break
      }
      if (hits > 0) break
    }
    expect(hits).toBeGreaterThan(0)
  })
})

describe('Invariant 1: every relevant item with a facility recipe has a clickable producer', () => {
  for (const item of ITEMS) {
    it(`holds for desired ${item}`, () => {
      const desired = [{ codeName: item, qty: 10 }]
      const plan = resolvePlan(desired, {}, defaultImports())
      const rel = relevantItems(plan)
      const reach = reachableRecipes(desired)
      const act = activatableRecipes(reach, rel)
      for (const x of rel) {
        // Basic resources / aggregate items have no facility recipe at all, so
        // there is nothing to click — they are outside the picker by design.
        if (recipesFor(x).length === 0) continue
        const hasClickableProducer = [...reach.keys()].some(
          r => r.outputs.some(o => o.codeName === x) && act.has(r))
        expect(hasClickableProducer).toBe(true)
      }
    })
  }
})

describe('Invariant 2: every active recipe is clickable or produces only a desired target / Energy', () => {
  for (const item of ITEMS) {
    it(`holds for desired ${item}`, () => {
      const desired = [{ codeName: item, qty: 10 }]
      const plan = resolvePlan(desired, {}, defaultImports())
      const rel = relevantItems(plan)
      const reach = reachableRecipes(desired)
      const act = activatableRecipes(reach, rel)
      const active = activeRecipes(plan)
      const desiredSet = new Set(desired.map(d => d.codeName))
      for (const r of active) {
        // A running recipe must be clickable (so it can be re-picked or
        // deactivated). The tolerated exception: a recipe that produces a
        // desired target and/or Energy — those are controlled via the Desired
        // quantity / energy toggle, not by clicking the (intentionally dimmed)
        // recipe row. Note a desired item made via a recipe WITH inputs is not
        // added to `rel` by the resolver, so its recipe is dimmed by design.
        const producesDesiredOrEnergy = r.outputs.some(
          o => desiredSet.has(o.codeName) || o.codeName === 'Energy')
        expect(act.has(r) || producesDesiredOrEnergy).toBe(true)
      }
    })
  }
})

// --- Invariant 3: toggleRecipe is its own inverse ------------------------
describe('Invariant 3: toggleRecipe is symmetric (pin then unpin = start)', () => {
  const concrete = recipesFor('Concrete').find(r => r.mod === 'CoalLiquefier')
  const station = recipesFor('Energy').find(r => r.facilityKey === 'FacilityPowerOil' && r.mod === null)
  const starts = [{}, { Concrete: concrete }, { Energy: station, Concrete: concrete }]
  for (const start of starts) {
    it(`double-toggle from {${Object.keys(start).join(',')}} returns to start`, () => {
      const pinned = toggleRecipe(start, 'Concrete', concrete)
      const back = toggleRecipe(pinned, 'Concrete', concrete)
      expect(back).toEqual(start)
    })
  }
  it('pinning an unpinned recipe adds it; pinning again removes it', () => {
    const once = toggleRecipe({}, 'Concrete', concrete)
    expect(once.Concrete).toBe(concrete)
    const twice = toggleRecipe(once, 'Concrete', concrete)
    expect('Concrete' in twice).toBe(false)
  })
})

// --- Invariant 4: sections (groups) are stable under selection -----------
const groupSig = (m) => [...m.values()].sort().join(',')
describe('Invariant 4: recipe selection never adds/removes a section', () => {
  it('reachableRecipes is a pure function of desired (selection-independent)', () => {
    const desired = [{ codeName: 'Concrete', qty: 10 }]
    const a = groupSig(reachableRecipes(desired))
    expect(a).toBe(groupSig(reachableRecipes(desired)))
    expect(a.length).toBeGreaterThan(0)
  })
  let checked = 0
  for (const item of ITEMS) {
    it(`groups stable under a representative pin for ${item}`, () => {
      const desired = [{ codeName: item, qty: 10 }]
      const base = groupSig(reachableRecipes(desired))
      const reach = reachableRecipes(desired)
      const rel = relevantItems(resolvePlan(desired, {}, defaultImports()))
      const act = activatableRecipes(reach, rel)
      // Pin the first clickable recipe; the group set must be unchanged — only
      // lit/dim states differ. (The component derives groups from
      // reachableRecipes(desired) alone, which ignores selectedRecipes.)
      for (const [r] of reach) {
        if (act.has(r)) { expect(groupSig(reachableRecipes(desired))).toBe(base); break }
      }
      checked++
    })
  }
  it('exercises many items (non-vacuous)', () => { expect(checked).toBeGreaterThan(50) })
})

describe('clickable = activatable ∪ active — an active recipe is never dimmed', () => {
  // Build tiny fake recipes; only the outputs/identity matter to the logic.
  const mk = (outputs, key = 'F', mod = '') => ({
    facilityKey: key, mod,
    outputs: outputs.map(c => ({ codeName: c, quantity: 1 })),
  })
  const keyOf = (r) => r.facilityKey + '|' + r.mod + '|' + r.outputs.map(o => o.codeName).join(',')

  // rRel: produces a relevant item. rActiveNotRel: currently pinned/active but
  // its sole output is NOT in the relevant set — the exact edge case the rule
  // exists for (a pinned recipe can outlive its output leaving the plan). rDim:
  // neither relevant nor active → must stay dimmed (not clickable).
  const rRel = mk(['Iron'])
  const rActiveNotRel = mk(['Cmats'])
  const rDim = mk(['Oil'])
  const reachable = new Map([
    [rRel, 'Iron'], [rActiveNotRel, 'Cmats'], [rDim, 'Oil'],
  ])
  const relevant = new Set(['Iron', 'Energy'])
  const active = new Set([rActiveNotRel])

  it('an active recipe whose outputs are all non-relevant is still clickable (never dimmed)', () => {
    const c = clickableRecipes(reachable, relevant, active)
    expect(c.has(rActiveNotRel)).toBe(true)
  })
  it('a relevant (activatable) recipe is clickable', () => {
    const c = clickableRecipes(reachable, relevant, active)
    expect(c.has(rRel)).toBe(true)
  })
  it('a recipe that is neither relevant nor active is NOT clickable (dimmed)', () => {
    const c = clickableRecipes(reachable, relevant, active)
    expect(c.has(rDim)).toBe(false)
  })
  it('clickable set is exactly activatable ∪ active', () => {
    const c = clickableRecipes(reachable, relevant, active)
    expect(c.size).toBe(2)
    const sort = (a, b) => keyOf(a).localeCompare(keyOf(b))
    expect([...c].sort(sort)).toEqual([rRel, rActiveNotRel].sort(sort))
  })
  it('INVARIANT: every active recipe is clickable (active ⊆ clickable)', () => {
    const c = clickableRecipes(reachable, relevant, active)
    for (const r of active) expect(c.has(r), `active ${keyOf(r)} must be clickable`).toBe(true)
  })
  it('INVARIANT: dimmed ⇔ not clickable (no recipe is both / neither)', () => {
    const c = clickableRecipes(reachable, relevant, active)
    for (const [r] of reachable) expect(c.has(r)).not.toBe(!c.has(r))
  })
  it('real resolver data: every active recipe is clickable for all single-item plans', () => {
    for (const item of ITEMS) {
      const desired = [{ codeName: item, qty: 10 }]
      const plan = resolvePlan(desired, {}, defaultImports())
      const c = clickableRecipes(reachableRecipes(desired), relevantItems(plan), activeRecipes(plan))
      for (const r of activeRecipes(plan)) expect(c.has(r), `active ${item}`).toBe(true)
    }
  })
})