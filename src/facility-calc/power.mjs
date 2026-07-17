// Per-building power aggregation for the Facilities panel + Peak power.
// Pure: input is a resolved plan, output is a list of facility rows. Kept
// separate from the Vue component so the "producers last" + "producers don't
// count toward peak" invariants are unit-testable (see power.test.mjs).
import { effectivePower } from './recipes.mjs'

// Per (facility, modification) power + active time, for the Facilities list.
// A building used for its base recipes and for one or more modifications is
// shown as SEPARATE rows — one per modification it actually uses (plus a base
// row when base recipes are active) — NOT merged into a single row. Each row is
// labelled by the modification name (or the base facility name when it's the
// un-modded building).
//
// consumptionKw = max power drawn (kW) across that row's active recipes (red,
// counted in Peak power). productionKw = max power produced (kW) across its
// recipes (green, NOT counted in Peak power). A facility runs one recipe at a
// time, so its instantaneous draw is bounded by its peak recipe. timeActive =
// sum of run times of the row's recipes (continuous production). Power-neutral
// buildings (pads, mines) have both 0 and show just their time.
//
// Power-producing buildings (productionKw > 0) are sorted LAST — they supply
// power, they don't compete for it, so they sit below the consumers they feed.
export function powerByFacility (plan) {
  const map = new Map()
  for (const p of plan.processes) {
    const mod = p.recipe.mod || null
    const key = `${p.recipe.facilityKey}|${mod || ''}`
    let e = map.get(key)
    if (!e) {
      e = {
        facilityKey: p.recipe.facilityKey,
        facility: p.recipe.facility,
        mod, // null for the base (un-modded) row
        label: mod ? (p.recipe.modName || mod) : p.recipe.facility,
        consumptionKw: 0,
        productionKw: 0,
        timeActive: 0,
      }
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

// Peak power (MW) = sum of each PHYSICAL facility's peak draw, where a
// facility's peak is the MAX draw across its rows (base + its modifications).
// A single building runs one recipe at a time, so even when it appears as
// several rows (base + mods) its contribution to peak is its single largest
// draw, not the sum of those rows. Power-producing buildings contribute 0 —
// only their (positive) production is excluded; a producer that also draws
// power counts that draw, but its output never offsets peak.
export function peakPowerMW (facilities) {
  const byFacility = new Map()
  for (const f of facilities) {
    byFacility.set(f.facilityKey, Math.max(byFacility.get(f.facilityKey) ?? 0, f.consumptionKw))
  }
  let sum = 0
  for (const kw of byFacility.values()) sum += kw
  return sum / 1000
}