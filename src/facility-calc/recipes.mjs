// Facility recipe index + helpers for the facility cost calculator.
//
// Flattens parser/data/recipes.json (19 facilities × base + modification recipes)
// into an `output codeName → [recipe, …]` index. Each recipe is normalized so the
// resolver and UI never touch the raw file shape.
//
// Conventions:
//   * Recipes with no outputs are dropped (broken/empty refinery entries).
//   * `metal` (Excavator-mod Salvage Mine output) is canonicalized to `Metal` —
//     it's the same game resource, just an inconsistent codeName in the export.
//   * `facilityProduced` is the set of every output codeName — used by Search.vue
//     to decide which items get the "+" (add to calculator) button.

import recipesData from '../../parser/data/recipes.json' with { type: 'json' }
import metadata from '../../parser/data/metadata.json' with { type: 'json' }
import { markRaw } from 'vue'

// Some facility-recipe codeNames are lowercase even though the canonical
// (metadata + icon) form is PascalCase — canonicalize on read so both the icon
// path (`/icons/<codeName>.png`) and metadata lookup resolve correctly.
const CANON = {
  metal: 'Metal',
  coal: 'Coal',
  heavyartilleryammo: 'HeavyArtilleryAmmo',
  lightartilleryammo: 'LightArtilleryAmmo',
}
const canon = c => CANON[c] || c

// Display-name fallbacks for codeNames missing from metadata.json (export
// quirks). After canonicalization these are only needed if a canonical codeName
// is itself missing from metadata.
const ALIASES = {}

export function displayName (codeName) {
  return metadata[codeName]?.displayName ?? ALIASES[codeName] ?? codeName
}

export function facLabel (recipe) {
  return recipe.mod ? `${recipe.facility} (${recipe.mod})` : recipe.facility
}

export const recipesByOutput = {}
const _facilityProduced = new Set()

for (const [facKey, fac] of Object.entries(recipesData.facilities)) {
  // In-game modification display names (e.g. enum "Recycler" → "Assembly Bay",
  // "RocketFactory" → "Rocket Battery Workshop") sourced from the
  // *_UpgradeSlotComponent file by the parser. Falls back to the camelCase key.
  const modName = modKey => fac.modifications?.[modKey]?.displayName || prettifyMod(modKey)
  const push = (mod, modDispName, r) => {
    if (!r.outputs || r.outputs.length === 0) return
    const recipe = markRaw({
      facilityKey: facKey,
      facility: fac.displayName,
      mod: mod || null,
      modName: modDispName,
      inputs: (r.inputs || []).map(i => ({ codeName: canon(i.codeName), quantity: i.quantity })),
      outputs: r.outputs.map(o => ({ codeName: canon(o.codeName), quantity: o.quantity })),
      duration: r.duration || 0,
      consumeResourceNodes: !!r.consumeResourceNodes,
    })
    for (const o of recipe.outputs) {
      ;(recipesByOutput[o.codeName] ||= []).push(recipe)
      _facilityProduced.add(o.codeName)
    }
  }
  for (const r of fac.baseRecipes) push(null, null, r)
  for (const [modKey, mod] of Object.entries(fac.modifications || {}))
    for (const r of mod.recipes) push(modKey, modName(modKey), r)
}

export const facilityProduced = _facilityProduced

export function recipesFor (item) {
  return recipesByOutput[item] || []
}

export function defaultRecipe (item) {
  const arr = recipesFor(item)
  return arr.find(r => r.mod === null) || arr[0] || null
}

export function hasMultipleRecipes (item) {
  return recipesFor(item).length > 1
}

// Abbreviations in modification codeNames that should render in full. Applied
// word-by-word after camelCase splitting.
const MOD_ABBR = { Adv: 'Advanced' }

// Human-readable modification name from its camelCase codeName:
// "MetalPress" → "Metal Press", "LargeShellFactory" → "Large Shell Factory",
// "AdvCoalLiquefier" → "Advanced Coal Liquefier".
export function prettifyMod (key) {
  return key.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(' ')
    .map(w => MOD_ABBR[w] || w)
    .join(' ')
}

// Group label for a recipe's building/modification. The user wants strictly the
// modification name; for harvester facilities (e.g. "Stationary Harvester
// (Coal)") the facility's parenthetical distinguishes same-named mods across
// facilities, giving e.g. "Excavator (Coal)". For base recipes (no mod) we fall
// back to the facility's own name.
export function modLabel (recipe) {
  if (!recipe.mod) return recipe.facility
  const paren = recipe.facility.match(/\(([^)]+)\)/)?.[1]
  return paren ? `${recipe.modName} (${paren})` : recipe.modName
}