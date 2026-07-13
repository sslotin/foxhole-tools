// Shared reactive state for the facility cost calculator.
//
// Both Search.vue (left picker, "+" button) and FacilityCalc.vue (right panel)
// import this, avoiding prop drilling. State persists for the page session.

import { reactive, watch } from 'vue'
import { toggleRecipe } from './activation.mjs'

export const calc = reactive({
  active: false,          // is the calculator panel shown in place of metadata?
  desired: [],            // [{codeName, qty}] — what the user wants to produce
  selectedRecipes: {},    // codeName -> chosen recipe object (override of default)
  imported: [],           // codeNames the user treats as imported inputs (not manufactured)
  skipAutoImport: [],     // codeNames the user explicitly opted out of auto-import for
  energyImported: true,   // energy pseudo-resource: true = imported (grid), false = produced
})

// Recipe assignments are derived from the current targets. The plan state is
// fully reset ONLY when the user unpins the last target (desired becomes
// empty) — the calculator is then closed/restarted, so assigned recipes,
// manual imports, skip-auto-import flags and energy mode are all cleared.
// Adding a target or changing a target quantity must NOT reset anything
// (a stale per-item selection is acceptable mid-plan and the user may be
// refining amounts).
watch(() => calc.desired, (desired) => {
  if (!desired.length) {
    calc.selectedRecipes = {}
    calc.imported = []
    calc.skipAutoImport = []
    calc.energyImported = true
  }
}, { deep: true, flush: 'sync' })

export function addDesired (codeName, qty = 1) {
  const existing = calc.desired.find(d => d.codeName === codeName)
  if (existing) existing.qty = (existing.qty || 1) + qty
  else calc.desired.push({ codeName, qty })
  calc.active = true
}

export function toggleImported (codeName) {
  const idx = calc.imported.indexOf(codeName)
  if (idx >= 0) calc.imported.splice(idx, 1)
  else calc.imported.push(codeName)
}

export function toggleSkipAutoImport (codeName) {
  const idx = calc.skipAutoImport.indexOf(codeName)
  if (idx >= 0) calc.skipAutoImport.splice(idx, 1)
  else calc.skipAutoImport.push(codeName)
}

// Assign/unassign a facility recipe for an item. For the Energy pseudo-resource,
// assigning a power recipe switches it to PRODUCE mode (an imported pseudo-
// resource can't also run a power plant); unassigning leaves the import flag as-
// is so the resolver falls back to import / default-recipe produce.
export function chooseRecipe (item, recipe) {
  const next = toggleRecipe(calc.selectedRecipes, item, recipe)
  if (item === 'Energy' && next.Energy) calc.energyImported = false
  calc.selectedRecipes = next
}

// Toggle Energy between import and produce. Any manually-selected power recipe
// is cleared so the toggle is always authoritative and no stale selection can
// linger while imported (which would make a later re-click unassign instead of
// assign). The resolver additionally treats import mode as authoritative, so a
// selection present alongside imported=true is ignored until cleared here.
export function toggleEnergy () {
  calc.energyImported = !calc.energyImported
  if (calc.selectedRecipes.Energy) {
    const next = { ...calc.selectedRecipes }
    delete next.Energy
    calc.selectedRecipes = next
  }
}