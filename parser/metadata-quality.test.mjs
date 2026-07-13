// Data-extraction quality + provenance.
//
// Policy (see MEMORY.md "Data provenance (authoritative)"): parser/data/metadata.json
// is derived ONLY from the exported game_data/ via process-game-data.js. The foxhole
// wiki (parser/scripts/overrides/wiki-enrich.json) is NOT a data source — it is used solely here as
// a SANITY CHECK (e.g. to flag which fields we intentionally omit because the exports
// lack them). See tmp/wiki-check.mjs for the field-by-field comparison script.
import { describe, it, expect } from 'vitest'
import metaRaw from './data/metadata.json'
import enrich from './scripts/overrides/wiki-enrich.json'
import { formatEntry, missingFields, classify } from '../src/components/metadata-format.js'

const isFiniteNum = x => typeof x === 'number' && Number.isFinite(x)
function walkNumbers(obj, path, bad) {
  if (typeof obj === 'number') { if (!Number.isFinite(obj)) bad.push(path) }
  else if (Array.isArray(obj)) obj.forEach((v, i) => walkNumbers(v, `${path}[${i}]`, bad))
  else if (obj && typeof obj === 'object') for (const k of Object.keys(obj)) walkNumbers(obj[k], `${path}.${k}`, bad)
}

describe('metadata.json structural integrity', () => {
  it('has the expected entry count and valid top-level fields', () => {
    expect(Object.keys(metaRaw).length).toBe(715)
    for (const [code, v] of Object.entries(metaRaw)) {
      expect(typeof v.displayName).toBe('string')
      expect(v.displayName.length).toBeGreaterThan(0)
      expect(['item', 'vehicle', 'structure']).toContain(v.itemType)
    }
  })

  it('contains no NaN/Infinity in any numeric field', () => {
    const bad = []
    walkNumbers(metaRaw, 'root', bad)
    expect(bad, bad.join(', ')).toEqual([])
  })

  it('family bookkeeping is consistent (625 searchable, 90 hidden tier members)', () => {
    const infam = Object.values(metaRaw).filter(v => v.inFamily).length
    const fams = Object.values(metaRaw).filter(v => v.isFamily).length
    expect(infam).toBe(90)
    expect(fams).toBe(31)
    expect(Object.keys(metaRaw).length - infam).toBe(625)
  })
})

describe('provenance: metadata.json contains NO wiki-sourced fields', () => {
  it('handheld firearms have no wiki reload/fireRate (game lacks them)', () => {
    for (const code of ['RifleW', 'SMGHeavyW', 'RifleAutomaticW']) {
      expect(metaRaw[code].reload).toBeUndefined()
      expect(metaRaw[code].fireRate).toBeUndefined()
    }
  })
  it('vehicles have no wiki speed/crew/passengers', () => {
    for (const code of ['TruckW', 'RelicMediumTank', 'RelicArmouredCar']) {
      expect(metaRaw[code].speedKmh).toBeUndefined()
      expect(metaRaw[code].offspeedKmh).toBeUndefined()
      expect(metaRaw[code].crew).toBeUndefined()
      expect(metaRaw[code].passengers).toBeUndefined()
    }
  })
  it('deployed weapons keep game-provided reloadDuration, not a wiki reload', () => {
    expect(metaRaw.MGTC.reload).toBeUndefined()
    expect(metaRaw.MGTC.fireRate).toBeUndefined()
    expect(metaRaw.MGTC.mountData.reloadDuration).toBeDefined()
    expect(metaRaw.MGTC.mountData.reloadDuration).toBeGreaterThan(0)
  })
  it('game-derived fields remain; wiki-only fills are gone', () => {
    // RifleLightW carries game encumbrance; RifleW lacks it (was a wiki-only fill).
    expect(metaRaw.RifleLightW.encumbrance).toBe(70)
    expect(metaRaw.RifleW.encumbrance).toBeUndefined()
    // WaterBucket has a genuine game firingMode; most weapons do not (was wiki).
    expect(metaRaw.WaterBucket.itemComponent?.firingMode).toBeTruthy()
  })
})

describe('wiki-enrich.json SANITY CHECK only (NOT a data source)', () => {
  it('only references real metadata codes', () => {
    for (const code of Object.keys(enrich)) expect(metaRaw[code], `unknown code ${code}`).toBeDefined()
  })
  it('weapon reload/fire-rate/firing-mode values are plausible', () => {
    let n = 0
    for (const [code, e] of Object.entries(enrich)) {
      const isWeapon = !!(metaRaw[code].weaponData || metaRaw[code].mountData)
      if (!isWeapon) continue
      if (e.reload != null) { expect(isFiniteNum(e.reload) && e.reload > 0 && e.reload <= 60, `${code}.reload`).toBe(true); n++ }
      if (e.fireRate != null) expect(isFiniteNum(e.fireRate) && e.fireRate > 0, `${code}.fireRate`).toBe(true)
      if (e.firingMode != null) { expect(typeof e.firingMode).toBe('string'); expect(e.firingMode.trim().length).toBeGreaterThan(0) }
    }
    expect(n).toBeGreaterThan(40)
  })
  it('vehicle speed/crew/passengers are plausible and road >= off-road', () => {
    let n = 0
    for (const [code, e] of Object.entries(enrich)) {
      if (!metaRaw[code].vehicleData) continue
      if (e.speedKmh != null) { expect(isFiniteNum(e.speedKmh) && e.speedKmh > 0, `${code}.speedKmh`).toBe(true) }
      if (e.offspeedKmh != null) { expect(isFiniteNum(e.offspeedKmh) && e.offspeedKmh >= 0, `${code}.offspeedKmh`).toBe(true) }
      if (e.speedKmh != null && e.offspeedKmh != null) expect(e.offspeedKmh).toBeLessThanOrEqual(e.speedKmh)
      if (e.crew != null) expect(Number.isInteger(e.crew) && e.crew >= 0, `${code}.crew`).toBe(true)
      if (e.passengers != null) expect(Number.isInteger(e.passengers) && e.passengers >= 0, `${code}.passengers`).toBe(true)
      n++
    }
    expect(n).toBeGreaterThan(100)
  })
  it('records encumbrance fills for the 5 firearms lacking game encumbrance', () => {
    for (const code of ['SMGHeavyW', 'SMGHeavyC', 'RifleW', 'RifleLightC', 'RifleAutomaticW'])
      expect(enrich[code]?.encumbrance, `${code} encumbrance in wiki ref`).toBeTruthy()
  })
})

describe('internal consistency of game-extracted fields', () => {
  it('firearms (SmallArms/HeavyArms) report a positive magazine size; melee/ammo do not', () => {
    for (const [code, v] of Object.entries(metaRaw)) {
      if (v.mountData || !v.weaponData) continue
      if (!['SmallArms', 'HeavyArms'].includes(v.itemCategory)) continue
      const ma = v.weaponData.maxAmmo
      if (code.startsWith('FlameTorch')) expect(ma, `${code} maxAmmo (flamethrower fuel tank)`).toBe(0)
      else if (ma != null) expect(ma, `${code} maxAmmo`).toBeGreaterThan(0)
    }
  })

  it('vehicles report positive health, non-negative engine force, normalized movement rate', () => {
    for (const [code, v] of Object.entries(metaRaw)) {
      if (!v.vehicleData) continue
      const vd = v.vehicleData
      expect(vd.maxHealth, `${code} maxHealth`).toBeGreaterThan(0)
      expect(vd.engineForce, `${code} engineForce`).toBeGreaterThanOrEqual(0)
      const d = vd.defaultSurfaceMovementRate
      expect(d, `${code} defaultSurfaceMovementRate`).not.toBeLessThan(0)
      expect(d).toBeLessThanOrEqual(1.0001)
    }
  })

  it('TrainEngine fuel capacity is a finite game value (wiki reports 300; trust game files)', () => {
    expect(isFiniteNum(metaRaw.TrainEngine.vehicleData.fuelCapacity)).toBe(true)
  })
})

describe('missing-field reporting reflects provenance (wiki-only fields reported missing on purpose)', () => {
  it('RifleW omits wiki-only Fire rate / Reload / Firing mode and reports them as missing', () => {
    const r = formatEntry('RifleW', metaRaw.RifleW)
    const labels = new Set(r.rows.map(x => x.label))
    expect(labels.has('Fire rate')).toBe(false)
    expect(labels.has('Reload')).toBe(false)
    expect(labels.has('Firing mode')).toBe(false)
    const missing = missingFields('Firearm', labels)
    expect(missing).toContain('Fire rate')
    expect(missing).toContain('Reload')
    expect(missing).toContain('Firing mode')
  })
})

describe('train coal consumption (replaces fuel cap)', () => {
  it('trains show Coal consumption (qty × icon), not a fuel-capacity figure', () => {
    const r = formatEntry('TrainEngine', metaRaw.TrainEngine)
    const labels = r.rows.map(x => x.label)
    expect(labels).toContain('Coal')
    expect(labels).not.toContain('Fuel cap')
    const coal = r.rows.find(x => x.label === 'Coal')
    expect(coal.items).toEqual([{ qty: 100, code: 'Coal', name: 'Coal' }])
  })
  it('relic vehicles keep the Fuel cap row', () => {
    const r = formatEntry('RelicTruck', metaRaw.RelicTruck)
    const labels = r.rows.map(x => x.label)
    expect(labels).toContain('Fuel cap')
    expect(labels).not.toContain('Coal')
  })
})

describe('palletAmount override surfaces as a "Per pallet" infobox row', () => {
  it('150mm (HeavyArtilleryAmmo) shows Per pallet: 120', () => {
    const r = formatEntry('HeavyArtilleryAmmo', metaRaw.HeavyArtilleryAmmo)
    const row = r.rows.find(x => x.label === 'Per pallet')
    expect(row, 'Per pallet row present').toBeTruthy()
    expect(row.value).toBe(120)
  })
  it('Anti-Tank Mine (TankMine) shows Per pallet: 60', () => {
    const r = formatEntry('TankMine', metaRaw.TankMine)
    const row = r.rows.find(x => x.label === 'Per pallet')
    expect(row.value).toBe(60)
  })
  it('non-cratable items (RifleW) have no Per pallet row', () => {
    const r = formatEntry('RifleW', metaRaw.RifleW)
    expect(r.rows.find(x => x.label === 'Per pallet')).toBeUndefined()
  })
  it('Per pallet is not flagged as a missing wiki field', () => {
    const v = metaRaw.HeavyArtilleryAmmo
    const r = formatEntry('HeavyArtilleryAmmo', v)
    const labels = new Set(r.rows.map(x => x.label))
    expect(missingFields(classify(v), labels)).not.toContain('Pallet Amount')
  })
})

describe('liquid volume (liters per unit) override', () => {
  it('Diesel shows Volume: 100 L (1 canister = 1 unit)', () => {
    const r = formatEntry('Diesel', metaRaw.Diesel)
    const row = r.rows.find(x => x.label === 'Volume')
    expect(row, 'Volume row').toBeTruthy()
    expect(row.value).toBe('100 L')
  })
  it('Heavy Oil (FacilityOil1) shows Volume: 30 L', () => {
    const r = formatEntry('FacilityOil1', metaRaw.FacilityOil1)
    const row = r.rows.find(x => x.label === 'Volume')
    expect(row.value).toBe('30 L')
  })
  it('non-liquid items (RifleW) have no Volume row', () => {
    const r = formatEntry('RifleW', metaRaw.RifleW)
    expect(r.rows.find(x => x.label === 'Volume')).toBeUndefined()
  })
})