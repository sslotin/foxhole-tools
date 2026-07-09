// Per-class, wiki-style formatting of raw metadata.json entries.
// The raw entries carry many internal keys (objectPath, *ProfileType,
// mapIconType, physics internals) that are noise to end-users. This module
// extracts the fields the official Foxhole wiki shows in its infoboxes
// (fetched via the wiki.gg API) and labels them cleanly with units.

const NOISE_TOP = new Set([
  'objectPath', 'iconPath', 'subTypeIconPath', 'mapIconType', 'uiCategory',
  'chassisName', 'itemProfileType', 'vehicleProfileType',
  'vehicleMovementProfileType', 'profileType', 'itemCategory',
  'equipmentSlot', 'itemType', 'displayName', 'description',
  'isLarge', 'canBeCrated', 'vehiclesPerCrateBonus', 'boostSpeedModifier',
  'boostGasUsageModifier', 'depthCutoffForSwimDamage', 'shippableType',
  'vehicleBuildType', 'canUseStructures', 'supportsVehicleMounts',
  'buildLocationType', 'maxHealth', 'blueprintSeats',
])

// Sub-objects that are fully internal / physics detail.
const NOISE_SUBS = new Set([
  'itemProfile', 'vehicleProfile', 'vehicleMovementProfile', 'structureProfile',
  'productionCategories', 'fuelTank',
])

function costLine(crateCost) {
  if (!crateCost || !crateCost.length) return null
  return crateCost.map(c => ({ qty: c.quantity, code: c.codeName, name: c.displayName }))
}

// MPF (Mass Production Factory) max-order cost. Each crate gets a 10% discount
// up to 50% (crate 5+), and the game applies Math.floor() to EACH crate's
// discounted cost (not round, and not on the total). Reverse-engineered from
// in-game behaviour / foxholelogi.com:
//   cost = Σ floor(base × (1 - min(i,5)/10))   for i = 1..numCrates
// A full 9-crate item order uses MPF_ITEM_DISCOUNTS; 5-crate vehicle/structure
// orders would use the first 5 entries.
// NOTE: add 1e-9 before flooring to cancel binary floating-point dust
// (e.g. 0.7*360 === 251.99999999999997, which must floor to 252, not 251).
const MPF_ITEM_DISCOUNTS = [0.9, 0.8, 0.7, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5]
function mpfFloor(base, d) { return Math.floor(base * d + 1e-9) }
function mpfLine(crateCost) {
  if (!crateCost || !crateCost.length) return null
  return crateCost.map(c => {
    const total = MPF_ITEM_DISCOUNTS.reduce((s, d) => s + mpfFloor(c.quantity, d), 0)
    return { qty: total, code: c.codeName, name: c.displayName }
  })
}

// MPF cost for vehicles/structures: a shippable crate's material cost is the
// standard 3-unit-equivalent build cost (the per-unit ResourceAmounts × 3),
// regardless of how many units actually spawn per crate (VehiclesPerCrateBonus
// adds free units, it does not increase material cost). Max order is 5 crates,
// same floor-per-crate discount as items. Per material:
//   Σ floor(3 × qty × discountᵢ)   for i = 1..5
const MPF_VEHICLE_DISCOUNTS = [0.9, 0.8, 0.7, 0.6, 0.5]
const UNITS_PER_SHIPPABLE_CRATE = 3
function mpfLine5(buildCost) {
  if (!buildCost || !buildCost.length) return null
  return buildCost.map(c => {
    const total = MPF_VEHICLE_DISCOUNTS.reduce((s, d) => s + mpfFloor(c.quantity * UNITS_PER_SHIPPABLE_CRATE, d), 0)
    return { qty: total, code: c.codeName, name: c.displayName }
  })
}

function crateLine(v) {
  return v.quantityPerCrate != null ? v.quantityPerCrate : null
}

function header(v) {
  return []
}

// Wiki shows a cleaned firing mode; raw data stores an enum like
// "EProjectileFiringMode::ShortToss" — strip the prefix and prettify.
function cleanFiringMode(raw) {
  if (!raw) return null
  const s = String(raw).split('::').pop().replace(/([a-z])([A-Z])/g, '$1 $2')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// Small-arms damage is probabilistic: rolls uniformly between base and 1.5×.
// Wiki-like display shows the range rather than the flat base value.
function firearmDamageRange(d) {
  if (d == null) return null
  const hi = Math.floor(d * 1.5)
  return `${d}-${hi}`
}

// Inventory line value. Reserved-ammo-slot detail was removed: it cannot be
// reliably derived from the game exports (equipped mounts don't expose
// AmmoSlotFilterAmount inline, and following refs pulls in shared mount
// templates, producing false counts). Show the total slot count only.

// ─────────────────────────────────────────────────────────────────────
// TOP SPEED — DISABLED (kept for reference / future use).
//
// Approximate top speed (m/s) for ground vehicles, derived from the
// force-balance equilibrium at top speed: drive force == resistance.
//   S*EngineForce == rollingResistance + airResistance * v^2
//   => v = sqrt((S*EngineForce - rollingResistance) / airResistance)
//
// SPEED_SCALE ~ 0.45 was fitted against wiki road speeds (Cargo `vehicles`
// table, n=79 mainstream vehicles after excluding special classes):
//   mean error ~22%, max ~34%. NOT exact — the game uses more constants
//   (low-gear torque curve, fuel type +10%, road vs off-road) not in these
//   exported tables, and emplaced/non-driven vehicles have no clean value.
//
// NOT SHOWN: the value is only approximate and Foxhole is logi-focused, so
// the approximate speed was deemed not worth displaying. If re-enabled, the
// row currently reads `Top speed: ~<v> m/s`. Returns null for non-driven
// vehicles (S*F - Rr <= 0) so callers can omit the row instead of faking 0.
//
// const SPEED_SCALE = 0.45
// function topSpeedMps(vd, vmp) {
//   if (!vd || !vmp) return null
//   const F = vd.engineForce, Rr = vmp.rollingResistance, Ra = vmp.airResistance
//   if (F == null || Rr == null || Ra == null) return null
//   const num = SPEED_SCALE * F - Rr
//   if (num <= 0) return null
//   return Math.sqrt(num / Ra)
// }
// ─────────────────────────────────────────────────────────────────────

// Wiki "accuracy" is the half-angle cone (baseline..max apex half-angle).
function accuracyCone(v) {
  const w = v.weaponData || v.mountData
  if (!w) return null
  const lo = w.baselineApexHalfAngle, hi = w.maxApexHalfAngle
  if (lo == null || hi == null) return null
  if (lo === 0 && hi === 0) return null
  return `${lo}°–${hi}°`
}

// Returns { class, rows:[{label,value}], usedPaths:Set }.
export function formatEntry(codeName, v) {
  const used = new Set()
  const rows = []
  const push = (label, value, path, link) => {
    if (value === undefined || value === null || value === '') return
    const row = { label, value }
    if (typeof link === 'string') row.code = link
    else if (Array.isArray(link)) row.items = link
    rows.push(row)
    if (path) used.add(path)
  }

  const cls = classify(v)
  // Subheader = the game's own chassisName (e.g. "Rifle", "Raw Material"),
  // falling back to the coarse class for items lacking one.
  const subhead = v.chassisName || cls

  // Shared header bits
  for (const h of header(v)) rows.push({ label: h.split(':')[0], value: h.split(':')[1].trim() })

  switch (cls) {
    case 'Firearm':
    case 'Mount/Deployed':
    case 'Melee Weapon': {
      const w = v.weaponData, a = v.ammoData, me = v.meleeData, md = v.mountData
      if (v.itemComponent?.compatibleAmmoCodeName || v.compatibleAmmoCodeName) {
        const ammoCode = v.itemComponent?.compatibleAmmoCodeName || v.compatibleAmmoCodeName
        push('Ammo', ammoCode, 'itemComponent.compatibleAmmoCodeName', ammoCode)
      }
      if (a?.damage != null) {
        // Apply the weapon's damage multiplier to the ammo base, then show
        // the probabilistic range for small arms (Firearm / Mount).
        const mult = (w?.damageMultiplier != null && w.damageMultiplier !== 1) ? w.damageMultiplier : 1
        const base = Math.floor(a.damage * mult)
        const dmg = (cls === 'Firearm' || cls === 'Mount/Deployed') ? firearmDamageRange(base) : base
        push('Damage', dmg + (a.damageType?.displayName ? ` (${a.damageType.displayName})` : ''), 'ammoData.damage')
      }
      if (me) {
        if (me.quickAttack) push('Quick attack', `${me.quickAttack.damage} dmg / ${me.quickAttack.delay}s`, 'meleeData.quickAttack')
        if (me.longAttack) push('Charged attack', `${me.longAttack.damage} dmg / ${me.longAttack.delay}s`, 'meleeData.longAttack')
      }
      if (md?.maxAmmo) push('Magazine', md.maxAmmo, 'mountData.maxAmmo')
      else if (w?.maxAmmo) push('Magazine', w.maxAmmo, 'weaponData.maxAmmo')
      if (md?.reloadTime) push('Reload', `${md.reloadTime}s`, 'mountData.reloadTime')
      else if (w?.reloadTime) push('Reload', `${w.reloadTime}s`, 'weaponData.reloadTime')
      if (md?.coverProvided != null) push('Cover', `${md.coverProvided}`, 'mountData.coverProvided')
      const fm = cleanFiringMode(v.itemComponent?.firingMode || v.weaponData?.firingMode)
      if (fm) push('Firing mode', fm, 'itemComponent.firingMode')
      const cone = accuracyCone(v)
      if (cone) push('Accuracy', cone, 'weaponData.maxApexHalfAngle')
      // Range (m): weaponData.maximumRange (max) and maximumReachability
      // (effective) are in cm; divide by 100. Show as "x-y" (ascending).
      if (cls !== 'Melee Weapon' && w?.maximumRange != null && w?.maximumReachability != null) {
        const rMax = w.maximumRange / 100
        const rEff = w.maximumReachability / 100
        const lo = Math.min(rMax, rEff), hi = Math.max(rMax, rEff)
        push('Range', lo === hi ? `${lo}m` : `${lo}-${hi}m`, 'weaponData.maximumRange')
        used.add('maximumReachability')
      }
      if (v.encumbrance != null) push('Weight', v.encumbrance, 'encumbrance')
      if (v.equipmentSlot && v.equipmentSlot !== 'None') push('Slot', v.equipmentSlot, 'equipmentSlot')
      break
    }
    case 'Grenade/Thrown': {
      const g = v.grenadeData, a = v.ammoData
      if (a?.damage != null) push('Damage', a.damage + (a.damageType?.displayName ? ` (${a.damageType.displayName})` : ''), 'ammoData.damage')
      if (g?.grenadeFuseTimer != null) push('Fuze', `${g.grenadeFuseTimer}s`, 'grenadeData.grenadeFuseTimer')
      // GrenadeRangeLimit is in cm; divide by 100. Hide when 0.
      if (g?.grenadeRangeLimit != null && g.grenadeRangeLimit > 0) push('Range', `${g.grenadeRangeLimit / 100}m`, 'grenadeData.grenadeRangeLimit')
      if (a?.explosionRadius != null && a.explosionRadius > 0) push('Explosion radius', `${a.explosionRadius}m`, 'ammoData.explosionRadius')
      if (v.encumbrance != null) push('Weight', v.encumbrance, 'encumbrance')
      if (v.equipmentSlot && v.equipmentSlot !== 'None') push('Slot', v.equipmentSlot, 'equipmentSlot')
      break
    }
    case 'Ammunition': {
      const a = v.ammoData
      if (a?.damage != null) push('Damage', a.damage + (a.damageType?.displayName ? ` (${a.damageType.displayName})` : ''), 'ammoData.damage')
      if (v.encumbrance != null) push('Weight', v.encumbrance, 'encumbrance')
      break
    }
    case 'Material/Supply':
    case 'Tool/Equip': {
      if (v.encumbrance != null) push('Weight', v.encumbrance, 'encumbrance')
      if (v.equipmentSlot && v.equipmentSlot !== 'None') push('Slot', v.equipmentSlot, 'equipmentSlot')
      break
    }
    case 'Land Vehicle':
    case 'Ship':
    case 'Aircraft': {
      const vd = v.vehicleData
      // Health: merge HP + disable chance into "<hp> (<disable>% disable)"
      if (vd?.maxHealth != null) {
        const disable = vd.minorDamagePercent != null ? ` (${Math.round(vd.minorDamagePercent * 100)}% disable)` : ''
        push('Health', `${vd.maxHealth}${disable}`, 'vehicleData.maxHealth')
        used.add('minorDamagePercent')
      }
      // Armour: merge HP + type into "<hp> (<type>)"
      const tankArmour = (v.vehicleData || {}).tankArmour
      if (tankArmour != null || v.armourType) {
        const hpPart = tankArmour === 0 ? 'Unarmored' : (tankArmour != null ? tankArmour : '')
        const val = v.armourType ? (hpPart ? `${hpPart} (${v.armourType})` : `(${v.armourType})`) : hpPart
        push('Armour', val, 'vehicleData.tankArmour')
        used.add('armourType')
      }
      if (vd?.tankArmourMinPenetrationChance != null)
        push('Min pen chance', `${Math.round((vd.tankArmourMinPenetrationChance) * 100)}%`, 'vehicleData.tankArmourMinPenetrationChance')
      if (vd?.repairCost != null) {
        // Repair cost is paid in Basic Materials (Cloth) — show like other costs.
        const repairItems = [{ qty: vd.repairCost, code: 'Cloth', name: 'Basic Materials' }]
        push('Repair cost', repairItems, 'vehicleData.repairCost', repairItems)
      }
      // Fuel: push guns (fuel use 0) show neither capacity nor use.
      const fuelUse = vd?.fuelConsumptionPerSecond
      if (fuelUse != null && fuelUse > 0) {
        let fuelVal = `${vd.fuelCapacity} L`
        if (vd?.fuelCapacity != null) {
          const minutes = Math.floor(vd.fuelCapacity / fuelUse / 60)
          fuelVal += ` (${minutes} minutes)`
        }
        push('Fuel cap', fuelVal, 'vehicleData.fuelCapacity')
      }
      if (vd?.defaultSurfaceMovementRate != null) {
        // Top speed row disabled — see topSpeedMps() documentation above.
        // const ts = topSpeedMps(vd, v.vehicleMovementProfile)
        // if (ts != null) push('Top speed', `~${ts.toFixed(1)} m/s`, 'vehicleData.defaultSurfaceMovementRate')
      }
      if (vd?.itemHolderCapacity != null && vd.itemHolderCapacity !== 0) push('Inventory', `${vd.itemHolderCapacity}`, 'vehicleData.itemHolderCapacity')
      if (v.shippableType) push('Shippable size', v.shippableType, 'shippableType')
      break
    }
    case 'Structure': {
      const sd = v.structureData
      if (sd?.maxHealth != null) {
        // Health: merge HP + armour type into "<hp> (<armortype>)", like vehicles.
        const hp = sd.maxHealth
        push('Health', v.armourType ? `${hp} (${v.armourType})` : hp, 'structureData.maxHealth')
        used.add('armourType')
      }
      if (sd?.buildCost) {
        const bc = sd.buildCost
        const s = Object.entries(bc).map(([k, val]) => `${val}x ${k}`).join(', ')
        push('Build cost', s, 'structureData.buildCost')
        used.add('structureData.buildCost')
      }
      if (sd?.repairCost != null) push('Repair cost', sd.repairCost, 'structureData.repairCost')
      if (sd?.decayStartHours != null && sd.decayStartHours !== 0) push('Decay starts', `${sd.decayStartHours.toFixed(1).replace(/\.0$/, '')}h`, 'structureData.decayStartHours')
      if (sd?.decayDurationHours != null && sd.decayDurationHours !== 0) push('Decay over', `${sd.decayDurationHours.toFixed(1).replace(/\.0$/, '')}h`, 'structureData.decayDurationHours')
      if (sd?.storedItemCapacity != null && sd.storedItemCapacity !== 0) push('Inventory', `${sd.storedItemCapacity}`, 'structureData.storedItemCapacity')
      if (v.mountData) push('Has mount', 'yes', 'mountData')
      break
    }
    case 'Misc': {
      if (v.encumbrance != null) push('Weight', v.encumbrance, 'encumbrance')
      break
    }
  }

  // Logistics extras (app is logistics-first).
  // Items are produced at a Factory in crates; MPF max order = 9 crates.
  // NOTE: structures/vehicles are NOT crate items here — their MPF cost is
  // governed by the build-cost branch below (Construction Yard / Garage rule),
  // so suppress the generic crate MPF for them (e.g. deployable banners that
  // carry a crateCost but are not Construction-Yard/Garage built).
  const isCrateItem = v.itemType !== 'structure' && v.itemType !== 'vehicle'
  // Some items carry a crateCost in the exports but are NOT factory/MPF
  // producible in-game (e.g. Sniper Rifles, obtained via other means). The
  // game data has no IsMPFable flag, so this is a documented exclusion list,
  // mirroring NON_MPF_VEHICLES. Extend as more such items are identified.
  const NON_FACTORY_ITEMS = new Set(['SniperRifleW', 'SniperRifleC'])
  const showCrateCost = isCrateItem && !NON_FACTORY_ITEMS.has(codeName)
  const c = showCrateCost ? costLine(v.crateCost) : null
  if (c) { push('Factory cost', c, 'crateCost', c) }
  const mpf = showCrateCost ? mpfLine(v.crateCost) : null
  if (mpf) { push('MPF cost x9', mpf, 'crateCost', mpf) }
  // Vehicles/structures are normally built at a Garage/Construction Yard per
  // unit, then packed into shippable crates (3 units) for MPF; MPF max order = 5 crates.
  // Rule: anything buildable at a Garage or Construction Yard is MPF-able.
  // Facility buildings and mines are NOT Construction-Yard-built (they are
  // facility-built / placed), so they are excluded even though they carry a
  // Construction-Yard material cost. Signalled by their structure profileType.
  const NON_MPF_STRUCTURE_PROFILETYPES = new Set(['FieldStructure', 'FieldLogiStructure', 'LandMine'])
  // Vehicles built only at a Vehicle Pad (not a Garage) are NOT MPF-able.
  // The Garage-vs-Pad restriction is hardcoded in the C++ War base class and is
  // NOT exposed in the JSON exports (no buildLocationType / pad flag on vehicle
  // blueprints), so this list is derived from game knowledge and must be extended
  // as more pad-only vehicles are identified.
  const NON_MPF_VEHICLES = new Set(['HeavyTruckW', 'HeavyTruckC'])
  const buildCost = v.buildCost && v.buildCost.length ? v.buildCost.map(b => ({ qty: b.quantity, code: b.codeName, name: b.displayName })) : null
  if (v.upgradeFromCodeName && buildCost) {
    const src = v.upgradeFromCodeName
    push('Upgrade from', src, 'upgradeFromCodeName', src)
  } else if (buildCost) {
    push('Build cost', buildCost, 'buildCost', buildCost)
    // Label reflects units spawned per crate (3 base + VehiclesPerCrateBonus);
    // the MPF material cost itself is always the 3-unit-equivalent crate cost.
    const isMpfEligible = (v.itemType !== 'structure' || !NON_MPF_STRUCTURE_PROFILETYPES.has(v.profileType)) &&
      (v.itemType !== 'vehicle' || !NON_MPF_VEHICLES.has(codeName))
    if (isMpfEligible) {
      const unitsPerCrate = UNITS_PER_SHIPPABLE_CRATE + (v.vehiclesPerCrateBonus || 0)
      const mpf5 = mpfLine5(v.buildCost)
      if (mpf5) { push(`MPF cost x5x${unitsPerCrate}`, mpf5, 'buildCost', mpf5) }
    }
  }
  const cl = crateLine(v)
  if (cl != null) { push('Crate size', cl, 'quantityPerCrate') }

  return { class: subhead, rows, used, missing: missingFields(cls, new Set(rows.map(r => r.label))) }
}

// Behavourial class from itemType + which combat/transport sub-objects exist.
// A "grenade" is a weapon whose magazine is 0 (thrown), distinguished from
// firearms that merely also carry a grenadeData sub-object with zeroed fields.
export function classify(v) {
  if (v.itemType === 'structure') return 'Structure'
  if (v.itemType === 'vehicle') {
    if (v.airData) return 'Aircraft'
    if (v.shipData) return 'Ship'
    return 'Land Vehicle'
  }
  if (v.weaponData?.maxAmmo === 0 && v.grenadeData) return 'Grenade/Thrown'
  if (v.weaponData && v.ammoData) return 'Firearm'
  if (v.weaponData && v.meleeData) return 'Melee Weapon'
  if (v.weaponData && (v.mountData || v.itemComponent?.deployCodeName)) return 'Mount/Deployed'
  // Firearm fallback: a weapon with weaponData but no ammoData link (e.g.
  // SniperRifleC, whose ammo reference is absent from the exports) still
  // renders Range/Accuracy from weaponData. Damage/Ammo stay absent (no ammo).
  if (v.weaponData) return 'Firearm'
  if (v.grenadeData) return 'Grenade/Thrown'
  if (v.ammoData) return 'Ammunition'
  if (v.itemComponent && v.crateCost) return 'Tool/Equip'
  if (v.crateCost) return 'Material/Supply'
  return 'Misc'
}

// Wiki fields (expressed in OUR row-label vocabulary) for each class.
// Only the wiki-specific fields our data can't supply are listed here;
// fields we DO show (Health, Damage, Weight, Crate, ...) are omitted
// so they never appear as "missing". The matcher compares against the
// set of labels our infobox actually rendered.
  // Wiki infobox fields (expressed in OUR row-label vocabulary) that our data
// CANNOT supply. Derived from real wiki infoboxes in parser/wiki-matching/infoboxes.json
// (Jul 9) cross-checked against game_data exports. Fields we DO surface
// (Health, Damage, Weight, Crate, Accuracy, Slot, Ammo, Magazine, Fuze,
// Max range, Explosion radius, Repair, Decay, Storage, Disable at, Fuel,
// Inventory slots, Shippable, Tech-locked) are intentionally omitted so they
// never appear as 'missing'. NOTE: reload / fire_rate / firing_mode / range
// in meters for guns live only in the live client, not in these exports.
const WIKI_FIELDS = {
  'Firearm': ['Fire Rate', 'Reload', 'Firing Mode', 'Range (m)'],
  'Mount/Deployed': ['Fire Rate', 'Reload', 'Firing Mode', 'Range (m)', 'Pallet Amount'],
  'Melee Weapon': ['Damage Type', 'Firing Mode'],
  'Grenade/Thrown': ['Damage Type', 'Firing Mode'],
  'Ammunition': ['Weight'],
  'Material/Supply': ['Uses'],
  'Tool/Equip': ['Pallet Amount'],
  'Misc': ['Uses'],
  'Land Vehicle': ['Crew', 'Passengers', 'Off-road Speed', 'Fire Rate'],
  'Ship': ['Armour HP', 'Crew', 'Passengers', 'Min/Max Pen Chance', 'Trigger Mines', 'Water Speed'],
  'Aircraft': ['Crew', 'Air Speed', 'Intel Range', 'Fire Rate'],
  'Structure': ['Built With', 'Intel Range', 'Armour Type'],
}

// Which wiki fields for this class are NOT present in our formatted rows?
// `surfaced` is the set of displayed label names.
export function missingFields(cls, surfacedLabels) {
  const want = WIKI_FIELDS[cls]
  if (!want) return []
  return want.filter(f => !surfacedLabels.has(f)).sort()
}

// List raw fields that were NOT surfaced by the infobox, with their values.
export function unformattedFields(codeName, v, used) {
  const fmtVal = x => (typeof x === 'object' && x !== null) ? JSON.stringify(x) : String(x)
  const out = []
  for (const [k, val] of Object.entries(v)) {
    if (NOISE_TOP.has(k)) continue
    if (NOISE_SUBS.has(k)) continue
    if (used.has(k)) continue
    if (typeof val === 'object' && val !== null) {
      // nested object: list its own keys if not consumed
      for (const sk of Object.keys(val)) {
        if (used.has(`${k}.${sk}`)) continue
        out.push({ k: `${k}.${sk}`, v: fmtVal(val[sk]) })
      }
    } else if (!used.has(k)) {
      out.push({ k, v: fmtVal(val) })
    }
  }
  out.sort((a, b) => a.k.localeCompare(b.k))
  return out
}