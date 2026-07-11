// Production recipes for the Search detail "Production" infobox.
//
// Gathers every way an item is made or consumed, so the detail page can list
// them as facility-calculator-style recipe rows:
//   - facility recipes where it is an OUTPUT            (recipesFor)
//   - facility recipes where it is an INPUT  ("used in") (recipesWithInput)
//   - Garage (vehicles) / Construction Yard (structures) build  -> buildCost
//   - Factory crate production                          -> crateCost
//   - Mass Production Factory: x9 crates (items) / x5 shippable crates (veh/struct)
//
// Every recipe is normalized to { kind, iconKey, label, inputs, outputs } where
// inputs/outputs are [{ codeName, quantity }] and an output may carry a `disp`
// string override for the non-numeric MPF labels (e.g. "×9", "×5×3").

import { recipesFor, recipesWithInput, modLabel } from '../facility-calc/recipes.mjs'
import recipesData from '../../parser/data/recipes.json' with { type: 'json' }

const crateRecipes = recipesData.factory.crateRecipes

// ---- MPF discount math (moved out of metadata-format.js) -------------------
// Each crate-order in an MPF run gets an increasing discount (crate 1 = 90%,
// crate 2 = 80%, … down to 50% for crate 6+), per the official wiki. The 9
// item-crate / 5 shippable-crate multipliers below encode that curve.
const MPF_ITEM_DISCOUNTS = [0.9, 0.8, 0.7, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5]
const MPF_VEHICLE_DISCOUNTS = [0.9, 0.8, 0.7, 0.6, 0.5]
const UNITS_PER_SHIPPABLE_CRATE = 3
// Total discount weight across the whole order (sum of the per-crate
// multipliers). Used to compute the aggregated discounted material total.
const MPF_ITEM_DISC_TOTAL = MPF_ITEM_DISCOUNTS.reduce((s, d) => s + d, 0)   // 6.1
const MPF_VEH_DISC_TOTAL = MPF_VEHICLE_DISCOUNTS.reduce((s, d) => s + d, 0) // 3.5

// Discounted material cost to MPF-build a crate item (9 crate-orders).
// The discount is applied across the whole order and floored ONCE per material:
// a 1-unit material (e.g. Coke's Cloth) must not floor to 0 the way per-crate
// flooring would (floor(1*0.9) = 0 for every crate → total 0).
export function mpfLine (crateCost) {
  if (!crateCost || !crateCost.length) return null
  return crateCost.map(c => ({
    codeName: c.codeName,
    quantity: Math.floor(c.quantity * MPF_ITEM_DISC_TOTAL + 1e-9),
  }))
}

// Discounted material cost to MPF-build a shippable crate of a vehicle/structure
// (5 crate-orders, each the 3-unit-equivalent build cost).
export function mpfLine5 (buildCost) {
  if (!buildCost || !buildCost.length) return null
  return buildCost.map(c => ({
    codeName: c.codeName,
    quantity: Math.floor(c.quantity * UNITS_PER_SHIPPABLE_CRATE * MPF_VEH_DISC_TOTAL + 1e-9),
  }))
}

// Items are produced at a Factory in crates (not structures/vehicles).
const NON_FACTORY_ITEMS = new Set(['SniperRifleW', 'SniperRifleC'])
const NON_MPF_STRUCTURE_PROFILETYPES = new Set(['FieldStructure', 'FieldLogiStructure', 'LandMine'])
const NON_MPF_WORLD_STRUCTURES = new Set([
  'TownBase1', 'TownBase2', 'TownBase3',
  'GarrisonStation', 'GarrisonStation1',
  'StorageBox', 'StorageFacility',
  'MaterialPlatform', 'FacilitySiloOil',
  'Seaport', 'SignPost', 'WeaponRack', 'ResourceBox', 'ObservationTower',
])
const NON_MPF_VEHICLES = new Set(['HeavyTruckW', 'HeavyTruckC'])

// Crane (Mobile Auto-Crane) and Construction (Universal Assembly Rig, "CV")
// can be built BOTH in the world (hammered) and at a Garage — surface both
// build entries, identical in every way but the label/icon. See build rows in
// productionRecipes() step 3.
const DUAL_BUILD_WORLD_GARAGE = new Set(['Crane', 'Construction'])

function isMpfEligible (entry, codeName) {
  if (!entry.buildCost || !entry.buildCost.length) return false
  if (entry.itemType === 'vehicle') {
    if (NON_MPF_VEHICLES.has(codeName)) return false
    // MPF builds anything made at a Garage or Shipyard — never at an Aircraft
    // Hangar, Dry Dock, or in the field (BuildableAnywhere). Scout planes
    // (AircraftFactory) and large ships (LargeShip/Dry Dock) are not MPF-able.
    if (['AircraftFactory', 'LargeShip', 'BuildableAnywhere'].includes(entry.vehicleBuildType)) return false
    // Vehicles produced at a player-built facility (Small/Large Assembly
    // Station, Dry Dock, Aircraft Assembly, Battery Line…) are facility-only
    // and cannot also be mass-produced — they have a facility-out recipe.
    if (recipesFor(codeName).length > 0) return false
    return true
  }
  if (entry.itemType === 'structure') {
    // Only structures actually built at a Construction Yard are mass-producible.
    // World-placed structures (buildLocationType Anywhere/Facility/undefined/None/
    // TestShard) are not MPF-fabricable, so they get no MPF build row.
    if (entry.buildLocationType !== 'ConstructionYard') return false
    if (NON_MPF_STRUCTURE_PROFILETYPES.has(entry.profileType)) return false
    if (NON_MPF_WORLD_STRUCTURES.has(codeName)) return false
    return true
  }
  return false
}

const isCrateItem = (entry) => entry.itemType !== 'structure' && entry.itemType !== 'vehicle'
// Only items the game actually assigns to a Factory/MPF queue
// (productionCategories.factoryQueueType, sourced from BPFactory.json) are
// crate-producible at a Factory. Many facility-only items (Cmats, Coal, Metal…)
// carry a legacy CostPerCrate in BPItemDynamicData but are NOT factory/MPF
// products — exclude them so the Production box doesn't falsely list them.
// MPF eligibility additionally requires massProductionQueueType to be set:
// several Factory-only categories (tools = Utility, meds = Medical) have a
// factoryQueueType but a null massProductionQueueType, i.e. they are made at a
// Factory but NOT at a Mass Production Factory.
const isFactoryMpfItem = (entry) => !!entry.productionCategories
const isMpfItem = (entry) => !!(entry.productionCategories && entry.productionCategories.massProductionQueueType)
const showCrateCost = (entry, codeName) =>
  isCrateItem(entry) && !NON_FACTORY_ITEMS.has(codeName) && entry.crateCost && entry.crateCost.length && isMpfItem(entry)

// Resolve the build facility for a buildable item from its game-exported build
// type (NOT a blanket "all vehicles = Garage"). The FacilityCalc / Production
// box renders this as a recipe row with the facility icon + label.
//   vehicles  -> vehicleBuildType:
//       Shipyard / LargeShip  -> Shipyard       (barges, landing ships, …)
//       AircraftFactory        -> Aircraft Hangar (scout/fighter/bomber planes)
//       BuildableAnywhere     -> World (hammered in the field)
//       VehicleFactory / VehicleFacility / (none) / RailTrackCrane -> Garage
//   structures -> buildLocationType:
//       ConstructionYard -> Construction Yard
//       Anywhere / Facility -> World (hammered in the field)
//       (none) / None / TestShard -> Construction Yard (default)
// The "World" pseudo-facility is rendered with the hammer icon (public/icons/Hammer.png).
function buildFacility (entry) {
  if (entry.itemType === 'vehicle') {
    switch (entry.vehicleBuildType) {
      case 'Shipyard':
        return { iconKey: 'Shipyard', label: 'Shipyard' }
      case 'LargeShip':
        // Large ships are built at a Dry Dock, not a Shipyard. Reuse the Dry
        // Dock facility icon (FacilityVehicleFactory3) — no standalone icon.
        return { iconKey: 'FacilityVehicleFactory3', label: 'Dry Dock' }
      case 'AircraftFactory':
        return { iconKey: 'AircraftFactory', label: 'Aircraft Hangar' }
      case 'BuildableAnywhere':
        return { iconKey: 'Hammer', label: 'World' }
      default:
        return { iconKey: 'MapIconVehicle', label: 'Garage' }
    }
  }
  // structures — only a real Construction Yard build (buildLocationType ===
  // 'ConstructionYard') is player-constructible there; world structures
  // (Anywhere/Facility) are hammered in the field. An unknown/absent build
  // location (undefined/None/TestShard) is NOT assumed to be a Construction
  // Yard build, so return null and the caller skips the build row.
  switch (entry.buildLocationType) {
    case 'ConstructionYard':
      return { iconKey: 'ConstructionYard', label: 'Construction Yard' }
    case 'Anywhere':
    case 'Facility':
      return { iconKey: 'Hammer', label: 'World' }
    default:
      return null
  }
}

const toIn = (arr) => (arr || []).map(c => ({ codeName: c.codeName, quantity: c.quantity }))

export function productionRecipes (codeName, entry) {
  const out = []

  // An item produced at a player-built facility (has a facility-out recipe) is
  // produced ONLY there. Such items must not also show a generic world build
  // (Garage / Shipyard / Construction Yard / Dry Dock / Aircraft Hangar / World)
  // or an MPF row — the facility recipe already represents their production.
  // For structures, a Construction-Yard build may legitimately coexist with a
  // facility recipe (basic emplacements are built both ways), so keep it then.
  const facilityProduced = recipesFor(codeName).length > 0
  const suppressBuild = facilityProduced && (entry.itemType !== 'structure' || entry.buildLocationType !== 'ConstructionYard')

  // Power recipes carry a synthetic 'Energy' output (from recipes.mjs, used by
  // the calculator); PowerChip already renders power, so drop 'Energy' from
  // the metadata list to avoid duplicating the power display.
  const recipeOutputs = (r) => toIn(r.outputs).filter(o => o.codeName !== 'Energy')

  // 1. Facility recipes producing this item (OUTPUT)
  for (const r of recipesFor(codeName)) {
    out.push({ kind: 'facility-out', iconKey: r.facilityKey, facilityKey: r.facilityKey, label: modLabel(r), inputs: toIn(r.inputs), outputs: recipeOutputs(r), powerDelta: r.powerDelta, duration: r.duration })
  }
  // 2. Facility recipes consuming this item (INPUT / "used in")
  for (const r of recipesWithInput(codeName)) {
    out.push({ kind: 'facility-in', iconKey: r.facilityKey, facilityKey: r.facilityKey, label: modLabel(r), inputs: toIn(r.inputs), outputs: recipeOutputs(r), powerDelta: r.powerDelta, duration: r.duration })
  }
  // 3. Build facility (data-driven from the item's build type — see buildFacility()).
  //     Crane + Construction additionally show a second "World" build entry (built both
  //     in the field and at a Garage) — identical build cost, label/icon differ only.
  //     Facility-produced items (facilityProduced) skip this entirely.
  if (!suppressBuild && entry.buildCost && entry.buildCost.length && (entry.itemType === 'vehicle' || !entry.upgradeFromCodeName)) {
    const facilities = DUAL_BUILD_WORLD_GARAGE.has(codeName)
      ? [{ iconKey: 'Hammer', label: 'World' }, { iconKey: 'MapIconVehicle', label: 'Garage' }]
      : [buildFacility(entry)]
    for (const fac of facilities) {
      if (!fac) continue
      out.push({
        kind: 'build',
        iconKey: fac.iconKey,
        label: fac.label,
        inputs: toIn(entry.buildCost),
        outputs: [{ codeName, quantity: 1 }],
      })
    }
  }
  // 4. Factory crate production — only for items actually assigned to a
  // Factory/MPF queue (see isFactoryMpfItem); facility-only items with a
  // legacy CostPerCrate are excluded.
  const cr = crateRecipes[codeName]
  if (cr && isFactoryMpfItem(entry)) {
    out.push({ kind: 'factory', iconKey: 'Factory', label: 'Factory', inputs: toIn(cr.inputs), outputs: cr.outputs.map(o => ({ codeName: o.codeName, quantity: 1, disp: '1c' })) })
  }
  // 5. Mass Production Factory — outputs shown as crate counts via `disp` ('9c' items / '5c' vehicles+structures).
  if (showCrateCost(entry, codeName) && entry.crateCost) {
    out.push({
      kind: 'mpf-item',
      iconKey: 'MassProduction',
      label: 'Mass Production Factory',
      inputs: mpfLine(entry.crateCost),
      outputs: [{ codeName, quantity: 1, disp: '9c' }],
    })
  }
  if (isMpfEligible(entry, codeName)) {
    out.push({
      kind: 'mpf-veh',
      iconKey: 'MassProduction',
      label: 'Mass Production Factory',
      inputs: mpfLine5(entry.buildCost),
      outputs: [{ codeName, quantity: 1, disp: '5c' }],
    })
  }
  return out
}