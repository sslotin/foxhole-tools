// Guard: every facility recipe's inputs/outputs must resolve to a known
// metadata entry. recipes.mjs applies CANON canonicalization at read time, so
// any export casing drift (e.g. "HalftrackW" vs "HalfTrackW",
// "Facilitymaterials4" vs "FacilityMaterials4") that slips through CANON would
// leave a recipe referencing an absent codeName — caught here because such a
// recipe would otherwise be indexed under a wrong/absent key and silently
// vanish from the calculator.
import { describe, it, expect } from 'vitest'
import { recipesFor, facilityProduced, facilityTier, FACILITY_TIER, recipeTechTier, shippable, crateItems } from './recipes.mjs'
import metadata from '../../parser/data/metadata.json' with { type: 'json' }
import recipesData from '../../parser/data/recipes.json' with { type: 'json' }

describe('recipe codeName canonicalization', () => {
  it('every indexed recipe references metadata-resident codeNames', () => {
    const seen = new Set()
    const bad = []
    // 'Energy' is a synthetic pseudo-resource (power MWh), not a metadata item.
    const isSynthetic = c => c === 'Energy'
    for (const outCode of facilityProduced) {
      for (const r of recipesFor(outCode)) {
        if (seen.has(r)) continue
        seen.add(r)
        for (const o of r.outputs) if (!(o.codeName in metadata) && !isSynthetic(o.codeName)) bad.push(`out ${o.codeName}`)
        for (const i of r.inputs) if (!(i.codeName in metadata) && !isSynthetic(i.codeName)) bad.push(`in ${i.codeName}`)
      }
    }
    expect(bad, bad.join(', ')).toEqual([])
  })

  it('resolves previously-broken halftrack/facility-material recipes', () => {
    for (const c of [
      'HalfTrackTwinW', 'HalfTrackDefensiveC', 'HalfTrackArtilleryC',
      'HalfTrackOffensiveW', 'HalftrackMultiW', 'FacilityMaterials4',
    ]) {
      expect(recipesFor(c).length, `expected recipe(s) for ${c}`).toBeGreaterThan(0)
    }
  })
})

describe('facility tech tier', () => {
  it('every facility in recipes.json has an explicit tier (no silent default)', () => {
    // Large Assembly Station is intentionally omitted: it defaults to T1 per the
    // user's tier list (the wiki lists it as T2 — pending confirmation). Engine
    // Room T2/T3 are excluded from the UI (SKIP_FACILITIES) and not in the list.
    const allowedMissing = new Set(['FacilityVehicleFactory2', 'EngineRoomT2', 'EngineRoomT3', 'AircraftDepot'])
    const missing = Object.keys(recipesData.facilities)
      .filter(k => !(k in FACILITY_TIER) && !allowedMissing.has(k))
    expect(missing, `facilities missing a FACILITY_TIER entry: ${missing.join(', ')}`).toEqual([])
  })

  it('maps known facilities to the user\'s tier list', () => {
    expect(facilityTier('FacilityFactoryAmmo')).toBe(2)   // Ammunition Factory (T2)
    expect(facilityTier('FacilityRefinery2')).toBe(2)      // Metalworks Factory (T2)
    expect(facilityTier('FacilityPowerOil')).toBe(2)      // Power Station (T2)
    expect(facilityTier('FacilityVehicleFactory2')).toBe(1) // Large Assembly Station: user list omits it (wiki says T2)
    // Engine Room T2/T3 are excluded from the UI (SKIP_FACILITIES) and not in the user's list.
    expect(facilityTier('FacilityRefinery1')).toBe(1)     // Materials Factory (T1 / start)
    expect(facilityTier('FacilityVehicleFactory3')).toBe(1) // Dry Dock (T1 / start)
  })

  it('defaults unknown facilities to T1 (starting)', () => {
    expect(facilityTier('DoesNotExist')).toBe(1)
  })

  it('recipeTechTier folds in the modification tier (max of facility + mod)', () => {
    const r = (facilityKey, mod) => ({ facilityKey, mod })
    // base facility tier, no mod
    expect(recipeTechTier(r('FacilityRefinery2'))).toBe(2)        // Metalworks (T2)
    expect(recipeTechTier(r('FacilityRefineryOil'))).toBe(1)      // Oil Refinery (T1)
    // T2 modifications
    expect(recipeTechTier(r('FacilityRefineryOil', 'CrackingUnit'))).toBe(2)
    expect(recipeTechTier(r('FacilityRefineryCoal', 'CoalLiquefier'))).toBe(2)
    expect(recipeTechTier(r('FacilityMineOil', 'Electric'))).toBe(2)
    // T3 modifications
    expect(recipeTechTier(r('FacilityRefineryOil', 'PetrochemicalPlant'))).toBe(3)
    expect(recipeTechTier(r('FacilityRefineryCoal', 'AdvCoalLiquefier'))).toBe(3)
    expect(recipeTechTier(r('FacilityRefinery2', 'EngineeringStation'))).toBe(3)
    expect(recipeTechTier(r('FacilityPowerOil', 'SulfuricReactor'))).toBe(3)
    // T2 facility + T3 mod => T3 (binding constraint is the higher tier)
    expect(recipeTechTier(r('FacilityRefinery2', 'EngineeringStation'))).toBe(3)
    // Excavator is tiered per parent harvester
    expect(recipeTechTier(r('FacilityMineResource2', 'Excavator'))).toBe(2) // Components
    expect(recipeTechTier(r('FacilityMineResource3', 'Excavator'))).toBe(3) // Sulfur
    expect(recipeTechTier(r('FacilityMineResource1', 'Excavator'))).toBe(3) // Salvage
    expect(recipeTechTier(r('FacilityMineResource4', 'Excavator'))).toBe(3) // Coal
  })
})

describe('large aircraft: frames + Aircraft Depot', () => {
  it('Large Assembly Station (AircraftAssembly) renames outputs to "<plane>Frame" and drops the bogus AircraftCrate input', () => {
    const asm = recipesData.facilities.FacilityVehicleFactory2.modifications.AircraftAssembly
    const fighter = asm.recipes.find(r => r.outputs[0].codeName === 'AircraftFighterCFrame')
    expect(fighter, 'AircraftFighterC → AircraftFighterCFrame').toBeTruthy()
    expect(fighter.inputs.some(i => i.codeName === 'AircraftCrate')).toBe(false)
    expect(asm.recipes).toHaveLength(9)
    expect(new Set(asm.recipes.map(r => r.outputs[0].codeName))).toEqual(new Set([
      'AircraftFighterCFrame', 'AircraftFighterWFrame', 'AircraftBomberCFrame',
      'AircraftBomberWFrame', 'AircraftWaterWFrame', 'AircraftDiveCFrame',
      'AircraftTorpedoWFrame', 'AircraftParatrooperCFrame', 'AircraftParatrooperWFrame',
    ]))
  })

  it('Aircraft Depot assembles a frame + faction parts into the finished plane', () => {
    const depot = recipesData.facilities.AircraftDepot
    expect(depot.pseudo).toBe(true)
    const r = depot.baseRecipes.find(x => x.outputs[0].codeName === 'AircraftFighterC')
    expect(r, 'AircraftFighterC depot recipe').toBeTruthy()
    expect(r.inputs).toContainEqual({ codeName: 'AircraftFighterCFrame', quantity: 1 })
    expect(r.inputs).toContainEqual({ codeName: 'AircraftPartSmallEngineC', quantity: 1 })
    expect(r.inputs).toContainEqual({ codeName: 'AircraftPartSmallMechanicalC', quantity: 5 })
    expect(r.outputs).toEqual([{ codeName: 'AircraftFighterC', quantity: 1 }])
    expect(r.duration).toBe(0)
  })

  it('every plane frame produced by the Large Assembly Station is consumed by the Depot', () => {
    const frames = new Set(
      recipesData.facilities.FacilityVehicleFactory2.modifications.AircraftAssembly.recipes
        .map(r => r.outputs[0].codeName))
    for (const dr of recipesData.facilities.AircraftDepot.baseRecipes) {
      const frameInput = dr.inputs.find(i => i.codeName.endsWith('Frame'))
      expect(frames.has(frameInput.codeName), `depot uses ${frameInput.codeName}`).toBe(true)
    }
  })
})

describe('shippable — imports panel container equivalents', () => {
  it('raw/refined resources ship in Resource Containers (÷5000)', () => {
    expect(shippable('Components', 10000)).toEqual({ count: 2, unit: 'rcs' })
    expect(shippable('BasicMaterials', 5000)).toEqual({ count: 1, unit: 'rcs' })
  })
  it('crated items ship in Shipping Containers (÷60)', () => {
    const crate = [...crateItems][0]
    expect(shippable(crate, 120).unit).toBe('scs')
    expect(shippable(crate, 120).count).toBe(2)
  })
  it('pallet-able items ship in pallets (÷ palletAmount)', () => {
    expect(shippable('WaterWallMaterials', 60)).toEqual({ count: 1, unit: 'pallets' })
  })
  it('liquids ship in Liquid Containers (q cans ÷ 100)', () => {
    // Plan q for liquids is in cans; 100 cans ÷ 100 cans/LC = 1 LC.
    // (volumeLiters only enters if you start from litres: litres = q×vol,
    //  then ÷vol → cans, then ÷100 → LCs.)
    expect(shippable('Petrol', 100)).toEqual({ count: 1, unit: 'lcs' })
  })
  it('precedence: liquid beats crate/pallet/resource', () => {
    expect(shippable('Petrol', 100).unit).toBe('lcs')
  })
  it('Energy and non-positive q are not shippable', () => {
    expect(shippable('Energy', 5)).toBeNull()
    expect(shippable('Components', 0)).toBeNull()
    expect(shippable('Components', -3)).toBeNull()
  })
})