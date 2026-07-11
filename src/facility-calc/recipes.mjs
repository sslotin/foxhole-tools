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

// Facilities excluded from the calculator entirely (power infrastructure, not
// production — their only output is ReservePower, which nothing consumes).
const SKIP_FACILITIES = new Set(['EngineRoomT2', 'EngineRoomT3'])

const CANON = {
  metal: 'Metal',
  coal: 'Coal',
  heavyartilleryammo: 'HeavyArtilleryAmmo',
  lightartilleryammo: 'LightArtilleryAmmo',
  lighttankammo: 'LightTankAmmo',
  stickybomb: 'StickyBomb',
  rpgammo: 'RpgAmmo',
  Facilitymaterials4: 'FacilityMaterials4',
  HalftrackW: 'HalfTrackW',
  HalftrackC: 'HalfTrackC',
  HalftrackDefensiveC: 'HalfTrackDefensiveC',
  HalftrackArtilleryC: 'HalfTrackArtilleryC',
  HalftrackOffensiveW: 'HalfTrackOffensiveW',
  HalftrackTwinW: 'HalfTrackTwinW',
  // Large-ship facility recipes in the export use "BattleShip" (one 's') while
  // the vehicle metadata/icon codeName is "Battleship" — canonicalize so the
  // Dry Dock recipe resolves to the metadata item (and its icon path).
  LargeShipBattleShipW: 'LargeShipBattleshipW',
  LargeShipBattleShipC: 'LargeShipBattleshipC',
  LargeShipBattleShipAircraftW: 'LargeShipBattleshipAircraftW',
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
  // Power-producing recipes (e.g. Sulfuric Reactor) primarily yield energy;
  // their item output (e.g. Sulfur) is a byproduct. Grouped under a synthetic
  // "Energy" heading in the calculator.
  if (recipe.powerDelta > 0) return 'Energy'
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
const _recipesByInput = {}

// Items produced or consumed as crates by the Infantry Kit Factory and its
// modifications. These represent crate-form items where the recipe quantity
// means "X crates" rather than "X individual units".
const _crateItems = new Set()

for (const [facKey, fac] of Object.entries(recipesData.facilities)) {
  if (SKIP_FACILITIES.has(facKey)) continue
  const isCrateFacility = facKey === 'FacilityFactorySmallArms'
  // In-game modification display names (e.g. enum "Recycler" → "Assembly Bay",
  // "RocketFactory" → "Rocket Battery Workshop") sourced from the
  // *_UpgradeSlotComponent file by the parser. Falls back to the camelCase key.
  const modName = modKey => fac.modifications?.[modKey]?.displayName || prettifyMod(modKey)
  const push = (mod, modDispName, r) => {
    // Power producers get a synthetic 'Energy' output (MWh per run) so they
    // show up in the calculator under an 'Energy' group and can be picked to
    // satisfy the plan's power need. Energy is a pseudo-resource (not in
    // metadata.json); the resolver treats it as imported by default and only
    // manufactures it when the user selects a power recipe or toggles energy
    // to 'produced'. Done BEFORE the empty-output skip-check so pure power
    // recipes (no item outputs) are no longer dropped.
    let outputs = r.outputs || []
    if (r.powerDelta > 0) {
      outputs = [...outputs, { codeName: 'Energy', quantity: (r.powerDelta * (r.duration || 0)) / 3_600_000 }]
    }
    if (outputs.length === 0) return
    const recipe = markRaw({
      facilityKey: facKey,
      facility: fac.displayName,
      mod: mod || null,
      modName: modDispName,
      inputs: (r.inputs || []).map(i => ({ codeName: canon(i.codeName), quantity: i.quantity })),
      outputs: outputs.map(o => ({ codeName: canon(o.codeName), quantity: o.quantity })),
      duration: r.duration || 0,
      powerDelta: r.powerDelta || 0,
      consumeResourceNodes: !!r.consumeResourceNodes,
    })
    // Primary output: for multi-output recipes this dictates grouping;
    // for single-output recipes it's the only output.
    recipe.primaryOutput = determinePrimaryOutput(recipe)
    for (const o of recipe.outputs) {
      ;(recipesByOutput[o.codeName] ||= []).push(recipe)
      _facilityProduced.add(o.codeName)
    }
    for (const i of recipe.inputs) {
      ;(_recipesByInput[i.codeName] ||= []).push(recipe)
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

// Vehicle/structure assembly pads run a single production order (like power
// plants), so their power draw is NOT divided by 5 the way multi-order
// facilities are. Engine rooms are excluded entirely (see SKIP_FACILITIES).
export const PAD_FACILITIES = new Set([
  'FacilityVehicleFactory1', 'FacilityVehicleFactory2', 'FacilityVehicleFactory3',
])
export function isPad (recipe) {
  return PAD_FACILITIES.has(recipe.facilityKey)
}
// Per-order effective power (kW). This is the facility's RAW draw/generation
// (powerDelta) — the historical "÷5" does NOT belong here. A powered
// (grid-connected) multi-order facility's 5× speed-up is reflected in the
// TIME via effectiveDuration, not the power. Used for energy (power × time)
// accounting and the Facilities panel.
export function effectivePower (recipe) {
  return recipe.powerDelta || 0
}
// Effective processing time of one run (seconds). A powered multi-order
// facility runs 5× faster than manual cranking, so its time is divided by 5 —
// except for power producers and single-order assembly pads (which run a
// single order). This is where the "÷5" belongs: on TIME, not on power.
export function effectiveDuration (recipe) {
  const d = recipe.duration || 0
  return (recipe.powerDelta < 0 && !isPad(recipe)) ? d / 5 : d
}
// Energy yielded/consumed by one production run, in MWh.
// effectivePower is in kW; MWh = kW·s / 3.6e6. Sign follows powerDelta
// (producers positive, consumers negative). Because the ÷5 now lives on the
// time, this equals the old (powerDelta/5) × duration — total energy is
// unchanged.
export function energyMWh (recipe) {
  return effectivePower(recipe) * effectiveDuration(recipe) / 3_600_000
}

export function recipesFor (item) {
  return recipesByOutput[item] || []
}

// The power recipe used to auto-cover an energy deficit when energy is toggled
// to 'produced' and the user hasn't picked a specific one. Prefer the standard
// Power Station (Oil); fall back to any available power recipe.
export function defaultPowerRecipe () {
  // Prefer the configured default power recipe (Energy override), which is the
  // Sulfuric Reactor burning Heavy Oil; fall back to any available recipe.
  return defaultRecipe('Energy') || recipesFor('Energy')[0] || null
}

// Recipes that CONSUME `item` as an input (reverse index). Used by the Search
// detail "Production" box to list what an item is "used in".
export function recipesWithInput (item) {
  return _recipesByInput[item] || []
}

// Preferred default recipe overrides. When multiple recipes produce the same
// item, the default recipe (used when the user hasn't explicitly chosen one)
// is selected by this map instead of the base recipe.
//
// Keyed by codeName, each entry specifies the facility + modification to prefer.
// For modifications with multiple recipes producing the same item, `hasInput`
// further disambiguates.
const DEFAULT_OVERRIDES = {
  // Processed Construction Materials → Recycler
  FacilityMaterials2: { facilityKey: 'FacilityRefinery2', mod: 'Recycler' },
  // Construction Materials → Metal Press (consumes Petrol)
  FacilityMaterials1: { facilityKey: 'FacilityRefinery1', mod: 'MetalPress', hasInput: 'Petrol' },
  // Steel Construction Materials → Engineering Station (consumes Enriched Oil)
  FacilityMaterials3: { facilityKey: 'FacilityRefinery2', mod: 'EngineeringStation', hasInput: 'FacilityOil2' },
  // Concrete Materials → Advanced Coal Liquefier
  Concrete: { facilityKey: 'FacilityRefineryCoal', mod: 'AdvCoalLiquefier' },
  // Enriched Oil → Petrochemical Plant
  FacilityOil2: { facilityKey: 'FacilityRefineryOil', mod: 'PetrochemicalPlant' },
  // Heavy Oil → Cracking Unit
  FacilityOil1: { facilityKey: 'FacilityRefineryOil', mod: 'CrackingUnit' },
  // Petrol → base Oil Refinery recipe
  Petrol: { facilityKey: 'FacilityRefineryOil', mod: null },
  // Coke → Coke Furnace
  FacilityCoal1: { facilityKey: 'FacilityRefineryCoal', mod: 'CokeFurnace' },
  // Gravel → produced from Salvage (Metal) rather than Coal
  GroundMaterials: { facilityKey: 'ConcreteMixer', mod: null, hasInput: 'Metal' },
  // --- Basic / harvested resources: prefer the base Stationary Harvester
  // (not the Excavator mod) for each mine. The "Salvage" field
  // (FacilityMineResource1) yields Metal in our data.
  Metal: { facilityKey: 'FacilityMineResource1', mod: null },
  Coal: { facilityKey: 'FacilityMineResource4', mod: null },
  Sulfur: { facilityKey: 'FacilityMineResource3', mod: null },
  Components: { facilityKey: 'FacilityMineResource2', mod: null },
  // Oil → Electric Oil Well (not the hand-cranked base or Fracker)
  Oil: { facilityKey: 'FacilityMineOil', mod: 'Electric' },
  // Power → Sulfuric Reactor burning Heavy Oil (not the base Power Station)
  Energy: { facilityKey: 'FacilityPowerOil', mod: 'SulfuricReactor', hasInput: 'FacilityOil1' },
}

export function defaultRecipe (item) {
  const arr = recipesFor(item)
  if (arr.length === 0) return null

  const override = DEFAULT_OVERRIDES[item]
  if (override) {
    const preferred = arr.find(r => {
      if (r.facilityKey !== override.facilityKey || r.mod !== override.mod) return false
      if (override.hasInput) return r.inputs.some(i => i.codeName === override.hasInput)
      return true
    })
    if (preferred) return preferred
  }

  // When a resource can be made both "new" and by repairing wreckage (the two
  // recipes share facility + modification, differing only by a Wrecked input),
  // prefer the new-build recipe as the default.
  const usesWrecked = r => r.inputs.some(i => i.codeName.includes('Wrecked'))
  const fresh = arr.filter(r => !usesWrecked(r))
  if (fresh.length > 0 && fresh.length < arr.length) return fresh[0]

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