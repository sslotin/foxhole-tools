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

  it('peak = sum of consumer consumption only; producers add nothing', () => {
    const expected = rows
      .filter(f => f.productionKw === 0)
      .reduce((s, f) => s + f.consumptionKw / 1000, 0)
    expect(peakPowerMW(rows)).toBeCloseTo(expected)
    // And it matches the hand-computed consumption (producers excluded).
    const handConsumption = rows
      .filter(f => f.facilityKey !== 'FacilityPowerOil')
      .reduce((s, f) => s + f.consumptionKw / 1000, 0)
    expect(peakPowerMW(rows)).toBeCloseTo(handConsumption)
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