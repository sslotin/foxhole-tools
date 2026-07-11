// Guard: every facility recipe's inputs/outputs must resolve to a known
// metadata entry. recipes.mjs applies CANON canonicalization at read time, so
// any export casing drift (e.g. "HalftrackW" vs "HalfTrackW",
// "Facilitymaterials4" vs "FacilityMaterials4") that slips through CANON would
// leave a recipe referencing an absent codeName — caught here because such a
// recipe would otherwise be indexed under a wrong/absent key and silently
// vanish from the calculator.
import { describe, it, expect } from 'vitest'
import { recipesFor, facilityProduced } from './recipes.mjs'
import metadata from '../../parser/data/metadata.json' with { type: 'json' }

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