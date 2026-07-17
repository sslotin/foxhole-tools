import { describe, it, expect } from 'vitest'
import { resolvePlan } from './resolver.mjs'
import { powerByFacility, peakPowerMW } from './power.mjs'
import { effectivePower } from './recipes.mjs'

// A plan that actually runs a power plant: produce energy (don't import it)
// for something power-hungry. FlameAmmo pulls enough demand that the resolver
// adds a FacilityPowerOil process to cover the deficit.
function produceEnergyPlan () {
  return resolvePlan([{ codeName: 'FlameAmmo', qty: 50 }], new Map(), new Set(), { energyImported: false })
}

describe('Facilities list: power-producing buildings', () => {
  const plan = produceEnergyPlan()
  const rows = powerByFacility(plan)
  const producers = rows.filter(f => f.productionKw > 0)
  const consumers = rows.filter(f => f.productionKw === 0)

  it('non-vacuous: a power-producing building is present', () => {
    expect(producers.length).toBeGreaterThan(0)
    expect(producers.some(f => f.facilityKey === 'FacilityPowerOil')).toBe(true)
  })

  it('power-producing buildings are listed LAST (after all consumers)', () => {
    // No non-producer may appear after a producer.
    let seenProducer = false
    for (const f of rows) {
      if (f.productionKw > 0) seenProducer = true
      else expect(seenProducer, `consumer ${f.label} appears after a producer`).toBe(false)
    }
    // And the final row is a producer.
    expect(rows[rows.length - 1].productionKw).toBeGreaterThan(0)
  })

  it('within the consumer group, rows stay sorted by total power (desc)', () => {
    const totals = consumers.map(f => f.consumptionKw + f.productionKw)
    for (let i = 1; i < totals.length; i++) expect(totals[i - 1]).toBeGreaterThanOrEqual(totals[i])
  })

  it('INVARIANT: a power plant contributes 0 to its consumption (it supplies, not demands)', () => {
    for (const f of producers) expect(f.consumptionKw).toBe(0)
  })
})

describe('Peak power excludes power production', () => {
  const plan = produceEnergyPlan()
  const rows = powerByFacility(plan)

  it('peak = per-facility max consumption; producers add nothing', () => {
    // A physical building runs one recipe at a time, so base + modification
    // rows of the same facility contribute its MAX draw, never their sum.
    const byFac = new Map()
    for (const f of rows) {
      byFac.set(f.facilityKey, Math.max(byFac.get(f.facilityKey) ?? 0, f.consumptionKw))
    }
    const expected = [...byFac.values()].reduce((s, kw) => s + kw / 1000, 0)
    expect(peakPowerMW(rows)).toBeCloseTo(expected)
    // Producers contribute nothing: dropping their rows leaves peak unchanged.
    const noProducers = rows.filter(f => f.productionKw === 0)
    expect(peakPowerMW(noProducers)).toBeCloseTo(peakPowerMW(rows))
  })

  it('a producer with both production and consumption only counts its draw toward peak', () => {
    // Build a synthetic facility row: it produces power AND draws some.
    const synth = [
      { facilityKey: 'Factory', mod: '', label: 'Factory', consumptionKw: 0, productionKw: 5000, timeActive: 10 },
      { facilityKey: 'Consumer', mod: '', label: 'Consumer', consumptionKw: 3000, productionKw: 0, timeActive: 10 },
    ]
    expect(peakPowerMW(synth)).toBeCloseTo(3) // only the 3000kW draw
  })
})

describe('Facilities list: base building grouped with each of its mods (not merged)', () => {
  // A building used for base + several modifications is shown as separate rows
  // (one per modification, plus a base row) — modifications are never merged
  // into a single row — each labelled by the modification name (or the base
  // facility name when un-modded).
  const plan = {
    processes: [
      { recipe: { facilityKey: 'FacilityRefineryOil', facility: 'Oil Refinery', mod: null, modName: 'Oil Refinery', powerDelta: 0, inputs: [], outputs: [] }, time: 1 },
      { recipe: { facilityKey: 'FacilityRefineryOil', facility: 'Oil Refinery', mod: 'CrackingUnit', modName: 'Cracking Unit', powerDelta: 0, inputs: [], outputs: [] }, time: 1 },
      { recipe: { facilityKey: 'FacilityRefineryOil', facility: 'Oil Refinery', mod: 'PetrochemicalPlant', modName: 'Petrochemical Plant', powerDelta: 0, inputs: [], outputs: [] }, time: 1 },
    ],
  }
  const rows = powerByFacility(plan)
  it('one row per (facility, mod), not merged into one', () => {
    expect(rows.map(r => `${r.facilityKey}|${r.mod || ''}`).sort()).toEqual([
      'FacilityRefineryOil|',
      'FacilityRefineryOil|CrackingUnit',
      'FacilityRefineryOil|PetrochemicalPlant',
    ])
  })
  it('mod rows show only the modification name; base row shows the facility name', () => {
    const labels = Object.fromEntries(rows.map(r => [`${r.facilityKey}|${r.mod || ''}`, r.label]))
    expect(labels['FacilityRefineryOil|']).toBe('Oil Refinery')
    expect(labels['FacilityRefineryOil|CrackingUnit']).toBe('Cracking Unit')
    expect(labels['FacilityRefineryOil|PetrochemicalPlant']).toBe('Petrochemical Plant')
  })
  it('peak dedupes by physical facility, not by row', () => {
    // Same facility across 3 rows still contributes its single peak draw.
    const byFac = new Map()
    for (const f of rows) byFac.set(f.facilityKey, Math.max(byFac.get(f.facilityKey) ?? 0, f.consumptionKw))
    const expected = [...byFac.values()].reduce((s, kw) => s + kw / 1000, 0)
    expect(peakPowerMW(rows)).toBeCloseTo(expected)
  })
})