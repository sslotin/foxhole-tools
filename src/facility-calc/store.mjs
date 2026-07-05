// Shared reactive state for the facility cost calculator.
//
// Both Search.vue (left picker, "+" button) and FacilityCalc.vue (right panel)
// import this, avoiding prop drilling. State persists for the page session.

import { reactive } from 'vue'

export const calc = reactive({
  active: false,          // is the calculator panel shown in place of metadata?
  desired: [],            // [{codeName, qty}] — what the user wants to produce
  selectedRecipes: {},    // codeName -> chosen recipe object (override of default)
})

export function addDesired (codeName, qty = 1) {
  const existing = calc.desired.find(d => d.codeName === codeName)
  if (existing) existing.qty = (existing.qty || 1) + qty
  else calc.desired.push({ codeName, qty })
  calc.active = true
}