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
  'buildLocationType', 'maxHealth',
])

// Sub-objects that are fully internal / physics detail.
const NOISE_SUBS = new Set([
  'itemProfile', 'vehicleProfile', 'vehicleMovementProfile', 'structureProfile',
  'productionCategories', 'fuelTank',
])

function costLine(crateCost) {
  if (!crateCost || !crateCost.length) return null
  return crateCost.map(c => `${c.quantity}x ${c.displayName}`).join(', ')
}

function crateLine(v) {
  const parts = []
  if (v.quantityPerCrate != null) parts.push(`per crate: ${v.quantityPerCrate}`)
  if (v.crateProductionTime != null) parts.push(`time: ${v.crateProductionTime}s`)
  if (v.singleRetrieveTime != null) parts.push(`retrieve: ${v.singleRetrieveTime}s`)
  return parts.length ? parts.join('  ·  ') : null
}

function faction(v) {
  if (v.warden === true) return 'Wardens'
  if (v.warden === false) return 'Colonial'
  return 'Both'
}

function header(v) {
  const out = []
  if (v.warden !== undefined) out.push(`Faction: ${faction(v)}`)
  if (v.requiresTech) out.push('Tech-locked: yes')
  return out
}

// Returns { class, rows:[{label,value}], usedPaths:Set }.
export function formatEntry(codeName, v) {
  const used = new Set()
  const rows = []
  const push = (label, value, path) => {
    if (value === undefined || value === null || value === '') return
    rows.push({ label, value })
    if (path) used.add(path)
  }

  const cls = classify(v)
  push('Type', cls, 'itemType')

  // Shared header bits
  for (const h of header(v)) rows.push({ label: h.split(':')[0], value: h.split(':')[1].trim() })

  switch (cls) {
    case 'Firearm':
    case 'Mount/Deployed':
    case 'Melee Weapon': {
      const w = v.weaponData, a = v.ammoData, me = v.meleeData, md = v.mountData
      if (v.itemComponent?.compatibleAmmoCodeName || v.compatibleAmmoCodeName)
        push('Ammo', v.itemComponent?.compatibleAmmoCodeName || v.compatibleAmmoCodeName, 'itemComponent.compatibleAmmoCodeName')
      if (a?.damage != null) push('Damage', a.damage + (a.damageType?.displayName ? ` (${a.damageType.displayName})` : ''), 'ammoData.damage')
      if (me) {
        if (me.quickAttack) push('Quick attack', `${me.quickAttack.damage} dmg / ${me.quickAttack.delay}s`, 'meleeData.quickAttack')
        if (me.longAttack) push('Charged attack', `${me.longAttack.damage} dmg / ${me.longAttack.delay}s`, 'meleeData.longAttack')
      }
      if (md?.maxAmmo) push('Magazine', md.maxAmmo, 'mountData.maxAmmo')
      else if (w?.maxAmmo) push('Magazine', w.maxAmmo, 'weaponData.maxAmmo')
      if (md?.reloadTime) push('Reload', `${md.reloadTime}s`, 'mountData.reloadTime')
      else if (w?.reloadTime) push('Reload', `${w.reloadTime}s`, 'weaponData.reloadTime')
      if (md?.coverProvided != null) push('Cover', `${md.coverProvided}`, 'mountData.coverProvided')
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
  if (c) { push('Crate cost', c, 'crateCost') }
  const cl = crateLine(v)
  if (cl) { rows.push({ label: 'Crate', value: cl }); used.add('quantityPerCrate'); used.add('crateProductionTime'); used.add('singleRetrieveTime'); used.add('crateRetrieveTime') }

  return { class: cls, rows, used }
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

// List raw fields that were NOT surfaced by the infobox.
export function unformattedFields(codeName, v, used) {
  const out = []
  for (const [k, val] of Object.entries(v)) {
    if (NOISE_TOP.has(k)) continue
    if (NOISE_SUBS.has(k)) continue
    if (used.has(k)) continue
    if (typeof val === 'object' && val !== null) {
      // nested object: list its own keys if not consumed
      for (const sk of Object.keys(val)) {
        if (!used.has(`${k}.${sk}`)) out.push(`${k}.${sk}`)
      }
    } else if (!used.has(k)) {
      out.push(k)
    }
  }
  return out.sort()
}