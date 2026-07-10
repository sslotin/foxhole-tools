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
// Each crate gets a 10% discount up to 50%, floor() applied per crate (not on
// the total). Mirrors in-game / foxholelogi.com behaviour.
const MPF_ITEM_DISCOUNTS = [0.9, 0.8, 0.7, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5]
const MPF_VEHICLE_DISCOUNTS = [0.9, 0.8, 0.7, 0.6, 0.5]
const UNITS_PER_SHIPPABLE_CRATE = 3
function mpfFloor (base, d) { return Math.floor(base * d + 1e-9) }

// Discounted material cost to MPF-build a crate item (9 crate-orders).
export function mpfLine (crateCost) {
  if (!crateCost || !crateCost.length) return null
  return crateCost.map(c => ({
    codeName: c.codeName,
    quantity: MPF_ITEM_DISCOUNTS.reduce((s, d) => s + mpfFloor(c.quantity, d), 0),
  }))
}

// Discounted material cost to MPF-build a shippable crate of a vehicle/structure
// (5 crate-orders, each the 3-unit-equivalent build cost).
export function mpfLine5 (buildCost) {
  if (!buildCost || !buildCost.length) return null
  return buildCost.map(c => ({
    codeName: c.codeName,
    quantity: MPF_VEHICLE_DISCOUNTS.reduce((s, d) => s + mpfFloor(c.quantity * UNITS_PER_SHIPPABLE_CRATE, d), 0),
  }))
}

// Items are produced at a Factory in crates (not structures/vehicles).
const NON_FACTORY_ITEMS = new Set(['SniperRifleW', 'SniperRifleC'])
const NON_MPF_STRUCTURE_PROFILETYPES = new Set(['FieldStructure', 'FieldLogiStructure', 'LandMine'])
const NON_MPF_WORLD_STRUCTURES = new Set([
  'TownBase1', 'TownBase2', 'TownBase3',
  'GarrisonStation', 'GarrisonStation1',
  'StorageBox', 'StorageFacility', 'ResourceContainer', 'ShippingContainer',
  'MaterialPlatform', 'LiquidContainer', 'FacilitySiloOil',
  'Seaport', 'SignPost', 'WeaponRack', 'ResourceBox', 'ObservationTower',
])
const NON_MPF_VEHICLES = new Set(['HeavyTruckW', 'HeavyTruckC'])

function isMpfEligible (entry, codeName) {
  if (!entry.buildCost || !entry.buildCost.length) return false
  if (entry.itemType === 'vehicle' && NON_MPF_VEHICLES.has(codeName)) return false
  if (entry.itemType === 'structure') {
    if (NON_MPF_STRUCTURE_PROFILETYPES.has(entry.profileType)) return false
    if (NON_MPF_WORLD_STRUCTURES.has(codeName)) return false
  }
  return true
}

const isCrateItem = (entry) => entry.itemType !== 'structure' && entry.itemType !== 'vehicle'
const showCrateCost = (entry, codeName) =>
  isCrateItem(entry) && !NON_FACTORY_ITEMS.has(codeName) && entry.crateCost && entry.crateCost.length

const toIn = (arr) => (arr || []).map(c => ({ codeName: c.codeName, quantity: c.quantity }))

export function productionRecipes (codeName, entry) {
  const out = []

  // 1. Facility recipes producing this item (OUTPUT)
  for (const r of recipesFor(codeName)) {
    out.push({ kind: 'facility-out', iconKey: r.facilityKey, label: modLabel(r), inputs: toIn(r.inputs), outputs: toIn(r.outputs) })
  }
  // 2. Facility recipes consuming this item (INPUT / "used in")
  for (const r of recipesWithInput(codeName)) {
    out.push({ kind: 'facility-in', iconKey: r.facilityKey, label: modLabel(r), inputs: toIn(r.inputs), outputs: toIn(r.outputs) })
  }
  // 3. Build at Garage (vehicles) / Construction Yard (structures)
  if (entry.buildCost && entry.buildCost.length && !entry.upgradeFromCodeName) {
    const isVeh = entry.itemType === 'vehicle'
    out.push({
      kind: 'build',
      iconKey: isVeh ? null : 'ConstructionYard',
      label: isVeh ? 'Garage' : 'Construction Yard',
      inputs: toIn(entry.buildCost),
      outputs: [{ codeName, quantity: 1 }],
    })
  }
  // 4. Factory crate production
  // Output is shown as a single crate via `disp: '1c'` (not the per-crate unit count), so the
  // row reads "100 Cloth → 1c <item>" rather than "100 Cloth → 20 <item>".
  const cr = crateRecipes[codeName]
  if (cr) {
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