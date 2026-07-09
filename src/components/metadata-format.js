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
const MPF_ITEM_DISCOUNTS = [0.9, 0.8, 0.7, 0.6, 0.5, 0.5, 0.5, 0.5, 0.5]
function mpfLine(crateCost) {
  if (!crateCost || !crateCost.length) return null
  return crateCost.map(c => {
    const total = MPF_ITEM_DISCOUNTS.reduce((s, d) => s + Math.floor(c.quantity * d), 0)
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
      if (v.encumbrance != null) push('Weight', v.encumbrance, 'encumbrance')
      if (v.equipmentSlot && v.equipmentSlot !== 'None') push('Slot', v.equipmentSlot, 'equipmentSlot')
      break
    }
    case 'Grenade/Thrown': {
      const g = v.grenadeData, a = v.ammoData
      if (a?.damage != null) push('Damage', a.damage + (a.damageType?.displayName ? ` (${a.damageType.displayName})` : ''), 'ammoData.damage')
      if (g?.grenadeFuseTimer != null) push('Fuze', `${g.grenadeFuseTimer}s`, 'grenadeData.grenadeFuseTimer')
      if (g?.grenadeRangeLimit != null) push('Max range', `${g.grenadeRangeLimit}m`, 'grenadeData.grenadeRangeLimit')
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
      if (vd?.maxHealth != null) push('Health', vd.maxHealth, 'vehicleData.maxHealth')
      if (v.armourType) push('Armour', v.armourType, 'armourType')
      const tankArmour = (v.vehicleData || {}).tankArmour
      if (tankArmour != null) push('Armour HP', tankArmour === 0 ? 'Unarmored' : tankArmour, 'vehicleData.tankArmour')
      if (vd?.tankArmourMinPenetrationChance != null)
        push('Min pen chance', `${Math.round((vd.tankArmourMinPenetrationChance) * 100)}%`, 'vehicleData.tankArmourMinPenetrationChance')
      if (vd?.minorDamagePercent != null) push('Disable at', `${Math.round((vd.minorDamagePercent) * 100)}%`, 'vehicleData.minorDamagePercent')
      if (vd?.repairCost != null) push('Repair cost', vd.repairCost, 'vehicleData.repairCost')
      if (vd?.fuelCapacity != null) push('Fuel cap', `${vd.fuelCapacity} L`, 'vehicleData.fuelCapacity')
      if (vd?.fuelConsumptionPerSecond != null) push('Fuel use', `${vd.fuelConsumptionPerSecond} L/s`, 'vehicleData.fuelConsumptionPerSecond')
      if (vd?.defaultSurfaceMovementRate != null)
        push('Speed (rate)', vd.defaultSurfaceMovementRate, 'vehicleData.defaultSurfaceMovementRate')
      if (vd?.itemHolderCapacity != null) push('Inventory slots', vd.itemHolderCapacity, 'vehicleData.itemHolderCapacity')
      if (v.shippableType) push('Shippable', v.shippableType, 'shippableType')
      break
    }
    case 'Structure': {
      const sd = v.structureData
      if (sd?.maxHealth != null) push('Health', sd.maxHealth, 'structureData.maxHealth')
      if (v.armourType) push('Armour', v.armourType, 'armourType')
      if (sd?.buildCost) {
        const bc = sd.buildCost
        const s = Object.entries(bc).map(([k, val]) => `${val}x ${k}`).join(', ')
        push('Build cost', s, 'structureData.buildCost')
        used.add('structureData.buildCost')
      }
      if (sd?.repairCost != null) push('Repair cost', sd.repairCost, 'structureData.repairCost')
      if (sd?.decayStartHours != null) push('Decay starts', `${sd.decayStartHours}h`, 'structureData.decayStartHours')
      if (sd?.decayDurationHours != null) push('Decay over', `${sd.decayDurationHours}h`, 'structureData.decayDurationHours')
      if (sd?.storedItemCapacity != null) push('Storage', sd.storedItemCapacity, 'structureData.storedItemCapacity')
      if (v.mountData) push('Has mount', 'yes', 'mountData')
      break
    }
    case 'Misc': {
      if (v.encumbrance != null) push('Weight', v.encumbrance, 'encumbrance')
      break
    }
  }

  // Logistics extras relevant to ALL crateable items (app is logistics-first).
  const c = costLine(v.crateCost)
  if (c) { push('Factory cost', c, 'crateCost', c) }
  const mpf = mpfLine(v.crateCost)
  if (mpf) { push('MPF cost x9', mpf, 'crateCost', mpf) }
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