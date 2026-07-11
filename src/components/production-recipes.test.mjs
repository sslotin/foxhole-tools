import { describe, it, expect } from 'vitest'
import { mpfLine, mpfLine5, productionRecipes } from './production-recipes.js'
import meta from '../../parser/data/metadata.json' with { type: 'json' }

describe('MPF discount math', () => {
  it('never zeroes out a 1-unit material (regression: Coke Cloth)', () => {
    // Coke's Factory crate recipe needs exactly 1 Cloth; per-crate flooring
    // (floor(1*0.9)…) summed to 0 and dropped the required input entirely.
    const out = mpfLine([{ codeName: 'Cloth', quantity: 1 }])
    expect(out).toEqual([{ codeName: 'Cloth', quantity: 5 }])
  })

  it('discounts a 2-unit material across the whole order', () => {
    const out = mpfLine([{ codeName: 'Water', quantity: 2 }])
    expect(out).toEqual([{ codeName: 'Water', quantity: 11 }])
  })

  it('applies the shippable-crate multiplier for vehicles/structures', () => {
    // 1 unit * 3 units-per-shippable-crate * 3.5 discount total = 10.5 -> 10
    const out = mpfLine5([{ codeName: 'Steel', quantity: 1 }])
    expect(out).toEqual([{ codeName: 'Steel', quantity: 10 }])
  })

  it('real FacilityCoal1 (Coke) MPF needs > 0 Cloth', () => {
    const cr = meta.FacilityCoal1?.crateCost
    expect(cr && cr.length).toBeTruthy()
    const out = mpfLine(cr)
    const cloth = out.find(o => o.codeName === 'Cloth')
    expect(cloth, 'Coke MPF must require Cloth').toBeTruthy()
    expect(cloth.quantity, 'Cloth must not be dropped to 0').toBeGreaterThan(0)
  })
})
describe('Factory/MPF rows only for genuine Factory/MPF items', () => {
  // Regression: facility-only items (Cmats, Coal, Metal…) carry a legacy
  // CostPerCrate in BPItemDynamicData but are NOT Factory/MPF products, so the
  // Production box must not list them as Factory/MPF-makeable. The game's
  // authoritative signal is `productionCategories` (factory/massProduction
  // queue type from BPFactory/BPMassProduction).
  it('Construction Materials (facility-only) show no Factory/MPF rows', () => {
    const recs = productionRecipes('FacilityMaterials1', meta.FacilityMaterials1)
    expect(recs.some(r => r.kind === 'factory'), 'no Factory row for Cmats').toBe(false)
    expect(recs.some(r => r.kind === 'mpf-item'), 'no MPF-item row for Cmats').toBe(false)
    // yet it IS produced at a facility (Materials Factory)
    expect(recs.some(r => r.kind === 'facility-out' && r.label.includes('Materials Factory'))).toBe(true)
  })
  it('Coal (facility-only raw) shows no Factory/MPF rows', () => {
    const recs = productionRecipes('Coal', meta.Coal)
    expect(recs.some(r => r.kind === 'factory')).toBe(false)
    expect(recs.some(r => r.kind === 'mpf-item')).toBe(false)
  })
  it('Rifle Ammo (genuine Factory/MPF item) keeps Factory + MPF rows', () => {
    const recs = productionRecipes('RifleAmmo', meta.RifleAmmo)
    expect(recs.some(r => r.kind === 'factory')).toBe(true)
    expect(recs.some(r => r.kind === 'mpf-item')).toBe(true)
  })
})

describe('energy output + icons in recipe rows', () => {
  it('power PRODUCERS carry powerDelta but no synthetic Energy output (PowerChip renders it)', () => {
    const recs = productionRecipes('Sulfur', meta.Sulfur)
    const producer = recs.find(r => r.kind === 'facility-out' && r.powerDelta > 0)
    expect(producer, 'Sulfur should have a power-producing facility recipe').toBeTruthy()
    expect(producer.outputs.some(o => o.codeName === 'Energy')).toBe(false)
    expect(producer.powerDelta).toBeGreaterThan(0)
  })
  it('does NOT add Energy for power consumers (Coke refinery)', () => {
    const recs = productionRecipes('FacilityCoal1', meta.FacilityCoal1)
    const consumer = recs.find(r => r.kind === 'facility-out')
    expect(consumer.outputs.some(o => o.codeName === 'Energy')).toBe(false)
  })
  it('uses MapIconVehicle for the Garage (vehicle build)', () => {
    const vehCode = Object.keys(meta).find(c =>
      meta[c].itemType === 'vehicle' && meta[c].buildCost?.length && !meta[c].upgradeFromCodeName)
    expect(vehCode, 'a buildable vehicle should exist').toBeTruthy()
    const buildRow = productionRecipes(vehCode, meta[vehCode]).find(r => r.kind === 'build')
    expect(buildRow.iconKey).toBe('MapIconVehicle')
  })
  it('uses Construction Yard for structures (not MapIconVehicle)', () => {
    const structCode = Object.keys(meta).find(c =>
      meta[c].itemType === 'structure' && meta[c].buildLocationType === 'ConstructionYard' &&
      meta[c].buildCost?.length && !meta[c].upgradeFromCodeName)
    expect(structCode, 'a Construction-Yard structure should exist').toBeTruthy()
    const buildRow = productionRecipes(structCode, meta[structCode]).find(r => r.kind === 'build')
    expect(buildRow.iconKey).toBe('ConstructionYard')
  })
  it('facility-produced upgraded vehicle shows the facility, not a Garage build row (#9)', () => {
    // Every vehicle carrying upgradeFromCodeName is a modification produced at a
    // Small/Large Assembly Station (it has a facility-out recipe), so it must
    // NOT also show a Garage build row — the facility recipe is its sole
    // production. (The upgradeFromCodeName exclusion is for non-vehicles.)
    const code = Object.keys(meta).find(c =>
      meta[c].itemType === 'vehicle' && meta[c].upgradeFromCodeName && meta[c].buildCost?.length)
    expect(code, 'an upgraded vehicle should exist').toBeTruthy()
    const recs = productionRecipes(code, meta[code])
    expect(recs.some(r => r.kind === 'facility-out'), `${code} produced at a facility`).toBe(true)
    expect(recs.some(r => r.kind === 'build'), `${code} must NOT show a Garage/build row`).toBe(false)
  })
  it('non-vehicle with upgradeFromCodeName is still excluded from the build row', () => {
    const clone = { ...meta.ShippingContainer, upgradeFromCodeName: 'SomeBase' }
    const recs = productionRecipes('ShippingContainer', clone)
    expect(recs.some(r => r.kind === 'build'), 'structures keep the upgradeFromCodeName exclusion').toBe(false)
  })
})

describe('build facility is data-driven (not blanket Garage)', () => {
  const buildRow = (code) => productionRecipes(code, meta[code]).find(r => r.kind === 'build')

  it('boats (Barge) build at the Shipyard', () => {
    const r = buildRow('Barge')
    expect(r.iconKey).toBe('Shipyard')
    expect(r.label).toBe('Shipyard')
  })
  it('landing ships (LargeShip) build at the Dry Dock, not a Shipyard', () => {
    const r = buildRow('LandingShipW')
    expect(r.iconKey).toBe('FacilityVehicleFactory3')
    expect(r.label).toBe('Dry Dock')
  })
  it('scout planes (AircraftScoutC) build at the Aircraft Hangar', () => {
    const r = buildRow('AircraftScoutC')
    expect(r.iconKey).toBe('AircraftFactory')
    expect(r.label).toBe('Aircraft Hangar')
  })
  it('world-built vehicles (Motorboat) use the Hammer / World pseudo-facility', () => {
    const r = buildRow('Motorboat')
    expect(r.iconKey).toBe('Hammer')
    expect(r.label).toBe('World')
  })
  it('ground vehicles (TruckW) still build at the Garage', () => {
    const r = buildRow('TruckW')
    expect(r.iconKey).toBe('MapIconVehicle')
    expect(r.label).toBe('Garage')
  })
  it('construction-yard structures (ShippingContainer) keep Construction Yard', () => {
    const r = buildRow('ShippingContainer')
    expect(r.iconKey).toBe('ConstructionYard')
    expect(r.label).toBe('Construction Yard')
  })
  it('world-built structures (WatchTower) use the Hammer / World pseudo-facility', () => {
    const r = buildRow('WatchTower')
    expect(r.iconKey).toBe('Hammer')
    expect(r.label).toBe('World')
  })
})
describe('Crane + Construction build both World and Garage', () => {
  for (const code of ['Crane', 'Construction']) {
    it(`${code} shows both a World and a Garage build entry`, () => {
      const recs = productionRecipes(code, meta[code])
      const builds = recs.filter(r => r.kind === 'build')
      expect(builds, `${code} should have 2 build rows`).toHaveLength(2)
      const labels = builds.map(b => b.label)
      expect(labels).toContain('World')
      expect(labels).toContain('Garage')
      const world = builds.find(b => b.label === 'World')
      const garage = builds.find(b => b.label === 'Garage')
      expect(world.iconKey).toBe('Hammer')
      expect(garage.iconKey).toBe('MapIconVehicle')
      // identical build cost — they differ only in name/icon
      expect(world.inputs).toEqual(garage.inputs)
      // plus the Mass Production Factory (5c) entry
      expect(recs.some(r => r.kind === 'mpf-veh'), `${code} should have an MPF row`).toBe(true)
    })
  }
})
describe('MPF eligibility for shippable structures', () => {
  // Shipping / Resource / Liquid Containers are shippables built at the
  // Construction Yard and ALSO mass-producible at the MPF (5 shippable-crate
  // orders), unlike static world structures (TownBase, Garrison, Seaport, …).
  for (const code of ['ShippingContainer', 'ResourceContainer', 'LiquidContainer']) {
    it(`${code} is MPF-eligible (shippable, not a static world structure)`, () => {
      const recs = productionRecipes(code, meta[code])
      const mpf = recs.find(r => r.kind === 'mpf-veh' && r.label === 'Mass Production Factory')
      expect(mpf, `${code} should have an MPF build row`).toBeTruthy()
      expect(mpf.outputs).toEqual([{ codeName: code, quantity: 1, disp: '5c' }])
    })
  }
  it('Shipping Container MPF cost = 100 Cloth * 3 units * 3.5 discount = 1050', () => {
    const mpf = productionRecipes('ShippingContainer', meta.ShippingContainer)
      .find(r => r.kind === 'mpf-veh')
    expect(mpf.inputs).toEqual([{ codeName: 'Cloth', quantity: 1050 }])
  })
})
describe('world structures without a known build location are not mislabeled', () => {
  // Structures whose blueprint has no BuildLocationType (e.g. Town Centers,
  // Factory, Seaport, trenches/walls) are world-placed, NOT Construction-Yard
  // built, and not MPF-fabricable. They must not get a bogus "Construction
  // Yard" build row or an mpf-veh row.
  it('Town Center (TownCenter1) shows no build row and no MPF', () => {
    const recs = productionRecipes('TownCenter1', meta.TownCenter1)
    expect(recs.some(r => r.kind === 'build'), 'no build row').toBe(false)
    expect(recs.some(r => r.kind === 'mpf-veh'), 'no MPF row').toBe(false)
  })
  it('NO structure with an absent buildLocationType is labeled Construction Yard or MPF', () => {
    const bad = []
    for (const code of Object.keys(meta)) {
      const e = meta[code]
      if (e.itemType !== 'structure' || e.buildLocationType) continue
      if (!e.buildCost || !e.buildCost.length) continue
      const recs = productionRecipes(code, e)
      if (recs.some(r => r.kind === 'build' && r.label === 'Construction Yard')) bad.push(code + ':CY')
      if (recs.some(r => r.kind === 'mpf-veh')) bad.push(code + ':MPF')
    }
    expect(bad, 'unexpected Construction Yard / MPF on world structures: ' + bad.join(', ')).toEqual([])
  })
  it('a genuine Construction Yard structure (ShippingContainer) still shows CY + MPF', () => {
    const recs = productionRecipes('ShippingContainer', meta.ShippingContainer)
    expect(recs.some(r => r.kind === 'build' && r.label === 'Construction Yard')).toBe(true)
    expect(recs.some(r => r.kind === 'mpf-veh')).toBe(true)
  })
  it('a World structure (WatchTower, Anywhere) still shows World', () => {
    const recs = productionRecipes('WatchTower', meta.WatchTower)
    expect(recs.find(r => r.kind === 'build')?.label).toBe('World')
  })
})

describe('facility-produced items show no fake Garage/Construction-Yard/MPF rows', () => {
  // An item produced at a player-built facility (has a facility-out recipe) is
  // produced ONLY there. It must not also show a generic world build (Garage /
  // Dry Dock / Construction Yard / World) or an MPF row. See the 6 categories
  // of fake recipes that previously leaked onto metadata pages.

  it('tools and meds are Factory-only, never MPF', () => {
    for (const code of ['WorkWrench', 'Bandages']) {
      const recs = productionRecipes(code, meta[code])
      expect(recs.some(r => r.kind === 'factory'), `${code} should keep its Factory row`).toBe(true)
      expect(recs.some(r => r.kind === 'mpf-item'), `${code} must NOT have an MPF row`).toBe(false)
    }
  })
  it('vehicles produced at a facility show only the facility (no Garage/MPF)', () => {
    for (const code of ['MotorcycleOffensiveC', 'TruckMobilityC', 'TrainEngine', 'LargeShipBaseShip', 'AircraftFighterW']) {
      const recs = productionRecipes(code, meta[code])
      expect(recs.some(r => r.kind === 'facility-out'), `${code} should have a facility-out row`).toBe(true)
      expect(recs.some(r => r.kind === 'build'), `${code} must NOT have a generic build row`).toBe(false)
      expect(recs.some(r => r.kind === 'mpf-veh'), `${code} must NOT have an MPF row`).toBe(false)
    }
  })
  it('scout planes build at the Aircraft Hangar but never at the MPF', () => {
    for (const code of ['AircraftScoutW', 'AircraftScoutC', 'AircraftScout2W']) {
      const recs = productionRecipes(code, meta[code])
      expect(recs.find(r => r.kind === 'build')?.label, `${code} builds at the Aircraft Hangar`).toBe('Aircraft Hangar')
      expect(recs.some(r => r.kind === 'mpf-veh'), `${code} must NOT be MPF-eligible`).toBe(false)
    }
  })
  it('large planes are produced only at the Aircraft Assembly (no Garage/MPF)', () => {
    for (const code of ['AircraftFighterW', 'AircraftBomberW', 'AircraftDiveC']) {
      const recs = productionRecipes(code, meta[code])
      expect(recs.some(r => r.kind === 'facility-out' && r.label === 'Aircraft Assembly'), `${code} at Aircraft Assembly`).toBe(true)
      expect(recs.some(r => r.kind === 'build'), `${code} no Garage build`).toBe(false)
      expect(recs.some(r => r.kind === 'mpf-veh'), `${code} no MPF`).toBe(false)
    }
  })
  it('large ships build only at the Dry Dock (never Garage/Shipyard/MPF)', () => {
    for (const code of ['LargeShipBaseShip', 'LandingShipW', 'LargeShipDestroyerW', 'LargeShipBattleshipW']) {
      const recs = productionRecipes(code, meta[code])
      const build = recs.find(r => r.kind === 'build')
      // LandingShip has no facility-out recipe, so it shows a Dry Dock *build* row;
      // the rest show a Dry Dock facility-out. Either way: no Garage/Shipyard/MPF.
      if (build) expect(build.label, `${code} builds at the Dry Dock`).toBe('Dry Dock')
      expect(recs.some(r => r.kind === 'build' && r.label === 'Garage'), `${code} no Garage`).toBe(false)
      expect(recs.some(r => r.kind === 'build' && r.label === 'Shipyard'), `${code} no Shipyard`).toBe(false)
      expect(recs.some(r => r.kind === 'mpf-veh'), `${code} no MPF`).toBe(false)
    }
  })
  it('EmplacedMultiC is produced only at the Battery Line, not in the World', () => {
    const recs = productionRecipes('EmplacedMultiC', meta.EmplacedMultiC)
    expect(recs.some(r => r.kind === 'facility-out' && r.label === 'Battery Line'), 'Battery Line facility-out').toBe(true)
    expect(recs.some(r => r.kind === 'build'), 'no generic build row').toBe(false)
  })
  it('battleship Dry Dock recipe resolves to metadata (BattleShip→Battleship canon)', () => {
    // recipes.json output uses "BattleShip" (one s); metadata uses "Battleship".
    // After canonicalization the Dry Dock recipe must resolve so battleships show
    // the Dry Dock, not a bogus Garage + MPF.
    const recs = productionRecipes('LargeShipBattleshipW', meta.LargeShipBattleshipW)
    expect(recs.some(r => r.kind === 'facility-out' && r.label === 'Dry Dock'), 'Dry Dock facility-out').toBe(true)
    expect(recs.some(r => r.kind === 'build' && r.label === 'Garage'), 'no Garage').toBe(false)
    expect(recs.some(r => r.kind === 'mpf-veh'), 'no MPF').toBe(false)
  })
})
