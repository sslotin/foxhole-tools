import { describe, it, expect } from 'vitest'
import { defaultRecipe } from './recipes.mjs'

describe('defaultRecipe specific overrides', () => {
  // [codeName, expected modName]. null modName = the base (mod-less) recipe.
  const cases = [
    ['FacilityMaterials2', 'Recycler'],                         // Processed Construction Materials
    ['FacilityMaterials1', 'Metal Press'],                      // Construction Materials
    ['FacilityMaterials3', 'Engineering Station'],               // Steel Construction Materials
    ['Concrete', 'Advanced Coal Liquefier'],                    // Concrete Materials
    ['FacilityOil2', 'Petrochemical Plant'],                    // Enriched Oil
    ['FacilityOil1', 'Cracking Unit'],                          // Heavy Oil
    ['Petrol', null],                                           // base Oil Refinery recipe
    ['FacilityCoal1', 'Coke Furnace'],                          // Coke
    ['GroundMaterials', null],                                  // Gravel (Concrete Mixer, Metal variant)
  ]
  for (const [code, modName] of cases) {
    it(`${code} defaults to the expected recipe`, () => {
      const r = defaultRecipe(code)
      expect(r).toBeTruthy()
      expect(r.modName).toBe(modName)
    })
  }

  it('Construction Materials default consumes Petrol', () => {
    expect(defaultRecipe('FacilityMaterials1').inputs.some(i => i.codeName === 'Petrol')).toBe(true)
  })

  it('Steel default consumes Enriched Oil', () => {
    expect(defaultRecipe('FacilityMaterials3').inputs.some(i => i.codeName === 'FacilityOil2')).toBe(true)
  })

  it('Gravel default uses Salvage (Metal), not Coal', () => {
    const r = defaultRecipe('GroundMaterials')
    expect(r.inputs.some(i => i.codeName === 'Metal')).toBe(true)
    expect(r.inputs.some(i => i.codeName === 'Coal')).toBe(false)
  })
})

describe('aircraft parts default to new-build, not repair-from-wreckage', () => {
  const parts = [
    'AircraftPartSmallMechanicalW', 'AircraftPartSmallEngineW',
    'AircraftPartSmallMechanicalC', 'AircraftPartSmallEngineC',
    'AircraftPartLargeMechanicalC', 'AircraftPartLargeEngineC',
    'AircraftPartLargeMechanicalW', 'AircraftPartLargeEngineW',
  ]
  for (const code of parts) {
    it(`${code} defaults to the build-new recipe (no Wrecked input)`, () => {
      const r = defaultRecipe(code)
      expect(r.inputs.some(i => i.codeName.includes('Wrecked'))).toBe(false)
    })
  }
})