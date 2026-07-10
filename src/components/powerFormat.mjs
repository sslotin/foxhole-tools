// Pure power-display formatting shared by the Facility Cost Calculator and the
// metadata Production / Used-in panels (both render <PowerChip>, which uses
// this). Kept framework-free so it is trivially unit-testable.
import { isPad, effectiveDuration } from '../facility-calc/recipes.mjs'

// Up to one decimal place; hide a trailing ".0" (e.g. 4 -> "4", 0.8 -> "0.8",
// -0.8 -> "-0.8", 2.5 -> "2.5"). No thousands separators — matches FacItem's
// plain resource quantities. Rounds to 1 dp first to avoid float dust.
export function fmtMW (mw) {
  const v = Math.round(mw * 10) / 10
  return Number.isInteger(v) ? String(v) : v.toFixed(1)
}

// "<mag>MW × <duration>s" — mag is the facility's raw power (powerDelta, in kW)
// divided by 1000 -> MW, shown as a magnitude (NO +/- sign; the direction is
// conveyed by color in <PowerChip>: red = consumed/in, green = produced/out).
// A " (/5)" suffix marks multi-order facilities: those that are NOT power
// producers and NOT vehicle/structure assembly pads (which run a single
// order). E.g. a refinery: "4MW × 900s (/5)"; a power plant: "2MW × 900s".
export function formatPower (recipe) {
  const mag = fmtMW(Math.abs(recipe.powerDelta) / 1000)
  const show5 = recipe.powerDelta < 0 && !isPad(recipe)
  return `${mag}MW × ${effectiveDuration(recipe)}s${show5 ? ' (/5)' : ''}`
}