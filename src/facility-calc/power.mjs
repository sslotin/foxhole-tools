// Per-facility power aggregation for the Facilities panel + Peak power.
// Pure: input is a resolved plan, output is a list of facility rows. Kept
// separate from the Vue component so the "producers last" + "producers don't
// count toward peak" invariants are unit-testable (see power.test.mjs).
import { effectivePower, modLabel } from './recipes.mjs'

// Per facility-mod power + active time, for the Facilities list.
// consumptionKw = max power drawn (kW) across that mod's active recipes (red,
// counted in Peak power). productionKw = max power produced (kW) across its
// recipes (green, NOT counted in Peak power). A facility runs one recipe at a
// time, so its instantaneous draw is bounded by its peak recipe. timeActive =
// sum of run times of its recipes (continuous production). Power-neutral
// buildings (pads, mines) have both 0 and show just their time.
//
// Power-producing buildings (productionKw > 0) are sorted LAST — they supply
// power, they don't compete for it, so they sit below the consumers they feed.
export function powerByFacility (plan) {
  const map = new Map()
  for (const p of plan.processes) {
    const key = p.recipe.facilityKey + '|' + (p.recipe.mod || '')
    let e = map.get(key)
    if (!e) {
      e = { facilityKey: p.recipe.facilityKey, mod: p.recipe.mod || '', label: modLabel(p.recipe), consumptionKw: 0, productionKw: 0, timeActive: 0 }
      map.set(key, e)
    }
    const eff = effectivePower(p.recipe)
    const reqKw = Math.max(0, -eff)
    const prodKw = Math.max(0, eff)
    if (reqKw > e.consumptionKw) e.consumptionKw = reqKw
    if (prodKw > e.productionKw) e.productionKw = prodKw
    e.timeActive += p.time
  }
  const arr = [...map.values()]
  arr.sort((a, b) => {
    // Power producers sink to the bottom of the list.
    const pa = a.productionKw > 0 ? 1 : 0
    const pb = b.productionKw > 0 ? 1 : 0
    if (pa !== pb) return pa - pb
    return (b.consumptionKw + b.productionKw) - (a.consumptionKw + a.productionKw)
      || a.label.localeCompare(b.label)
  })
  return arr
}

// Peak power = sum of per-facility consumption (MW). The grid size needed if
// every facility drew its peak simultaneously. Power-producing buildings
// contribute 0 — only their (positive) production is excluded; a producer that
// also draws power still counts that draw, but its output never offsets peak.
export function peakPowerMW (facilities) {
  return facilities.reduce((s, f) => s + f.consumptionKw / 1000, 0)
}