// Facility recipe index + helpers for the facility cost calculator.
//
// Flattens parser/data/recipes.json (19 facilities × base + modification recipes)
// into an `output codeName → [recipe, …]` index. Each recipe is normalized so the
// resolver and UI never touch the raw file shape.
//
// PRIMARY OUTPUT CONCEPT:
// Every recipe has a `primaryOutput` codeName field. For single-output recipes it
// is the only output. For multi-output recipes, one output is designated as the
// primary product — the thing the recipe is "for" in the player's mental model.
// This determines where the recipe appears in the calculator's grouped display.
//
//   Assembly Bay (Recycler):  outputs Cmats + secondary (Sandbags/Barbed Wire/
//                             Metal Beam). The secondary is primary — you build
//                             Assembly Bay recipes FOR the specific upgrade mat.
//   Coke Furnace:             outputs Coke + Sulfur. Coke is primary.
//   Coal Liquefier:           outputs Concrete + Sulfur + Oil. Concrete is primary.
//   Adv Coal Liquefier:       two variants — Coke+Petrol or Concrete+Sulfur+Oil.
//                             The variant sets which is primary.
//   Sulfur Excavator:         outputs Sulfur + Coal. Coal is primary — the node
//                             is a "Coal mine that also yields Sulfur".
//
// This is a UX classification, not a gameplay mechanic. The resolver's byproduct-
// reuse algorithm is unaffected; primary output only controls display grouping.

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
  lighttankammo: 'LightTankAmmo',
  stickybomb: 'StickyBomb',
  rpgammo: 'RpgAmmo',
}
const canon = c => CANON[c] || c

// For multi-output recipes, determine which output is the "primary" product.
// The primary product defines where the recipe appears in the calculator's
// grouping (instead of grouping by building/modification, recipes are grouped
// by what they primarily produce). See the module-level doc comment for the
// rationale behind each assignment.
//
// This function is called once per recipe at module load time (not on every
// computed re-evaluation), so clarity trumps brevity.
function determinePrimaryOutput(recipe) {
  const { facilityKey, mod, outputs } = recipe
  if (outputs.length === 1) return outputs[0].codeName

  // Assembly Bay (Recycler): the non-FacilityMaterials1 output is primary.
  // Cmats are the constant "base" output across all 3 Assembly Bay recipes;
  // the variable output (Sandbags / Barbed Wire / Metal Beam) is the
  // distinguishing product the player chooses this recipe FOR.
  if (facilityKey === 'FacilityRefinery1' && mod === 'Recycler') {
    return outputs.find(o => o.codeName !== 'FacilityMaterials1').codeName
  }
  // Coke Furnace: Coke (FacilityCoal1) is the intended product; Sulfur is a
  // byproduct of the coking process.
  if (facilityKey === 'FacilityRefineryCoal' && mod === 'CokeFurnace') {
    return 'FacilityCoal1'
  }
  // Coal Liquefier: Concrete is the primary output; Sulfur and Oil arise as
  // byproducts of the liquefaction process.
  if (facilityKey === 'FacilityRefineryCoal' && mod === 'CoalLiquefier') {
    return 'Concrete'
  }
  // Adv Coal Liquefier has two recipes distinguished by output set:
  //   1) FacilityCoal1 + FacilityOil1 (Coke + Petrol)
  //   2) Concrete + Sulfur + Oil
  // The primary output matches whichever variant we're looking at.
  if (facilityKey === 'FacilityRefineryCoal' && mod === 'AdvCoalLiquefier') {
    return outputs.some(o => o.codeName === 'FacilityCoal1') ? 'FacilityCoal1' : 'Concrete'
  }
  // Sulfur Excavator (Stationary Harvester Sulfur mod): outputs Sulfur + Coal.
  // Coal is designated primary because the node is conceptually a coal source
  // that happens to also yield sulfur when powered with petrol.
  if (facilityKey === 'FacilityMineResource3' && mod === 'Excavator') {
    return 'Coal'
  }

  // Fallback for any future multi-output recipe not yet classified:
  // first output is treated as primary.
  return outputs[0].codeName
}
const ALIASES = {}

export function displayName (codeName) {
  return metadata[codeName]?.displayName ?? ALIASES[codeName] ?? codeName
}

export function facLabel (recipe) {
  return recipe.mod ? `${recipe.facility} (${recipe.mod})` : recipe.facility
}

export const recipesByOutput = {}
const _facilityProduced = new Set()

// Items produced or consumed as crates by the Infantry Kit Factory and its
// modifications. These represent crate-form items where the recipe quantity
// means "X crates" rather than "X individual units".
const _crateItems = new Set()

for (const [facKey, fac] of Object.entries(recipesData.facilities)) {
  const isCrateFacility = facKey === 'FacilityFactorySmallArms'
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
    // Primary output: for multi-output recipes this dictates grouping;
    // for single-output recipes it's the only output.
    recipe.primaryOutput = determinePrimaryOutput(recipe)
    for (const o of recipe.outputs) {
      ;(recipesByOutput[o.codeName] ||= []).push(recipe)
      _facilityProduced.add(o.codeName)
    }
    // If this is a crate facility, mark its outputs and crate-form inputs
    if (isCrateFacility) {
      for (const o of recipe.outputs) _crateItems.add(o.codeName)
      for (const i of recipe.inputs) {
        // Skip bulk material inputs — only crate-form items get the suffix
        const cn = i.codeName
        if (!cn.startsWith('FacilityMaterial') && cn !== 'Explosive' && cn !== 'HeavyExplosive') {
          _crateItems.add(cn)
        }
      }
    }
  }
  for (const r of fac.baseRecipes) push(null, null, r)
  for (const [modKey, mod] of Object.entries(fac.modifications || {}))
    for (const r of mod.recipes) push(modKey, modName(modKey), r)
}

export const facilityProduced = _facilityProduced

// Set of items whose quantities represent crate counts (from the Infantry Kit
// Factory and its modifications). Used to decide when to show the "c" suffix.
export const crateItems = _crateItems

export function isLiquid (codeName) {
  return metadata[codeName]?.itemProfileType === 'RefinedFuel'
}

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