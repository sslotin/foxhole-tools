import { describe, it, expect } from 'vitest'
import { buildNameToCode } from './generate-positions.js'

// Structure variant listed *before* the item on purpose: the preference must
// hold regardless of metadata iteration order.
const metadata = {
  BarbedWireSpline: { displayName: 'Barbed Wire', itemType: 'structure' },
  BarbedWireMaterials: { displayName: 'Barbed Wire', itemType: 'item' },
  DeployedListeningKit: { displayName: 'Listening Kit', itemType: 'structure' },
  ListeningKit: { displayName: 'Listening Kit', itemType: 'item' },
  DeployedWindsockT: { displayName: 'Wind Sock', itemType: 'structure' },
  WindsockT: { displayName: 'Wind Sock', itemType: 'item' },
  TrenchDestroyedT: { displayName: 'Destroyed Trench', itemType: 'structure' },
  TrenchEmpDestroyedT: { displayName: 'Destroyed Trench', itemType: 'structure' },
}

describe('buildNameToCode', () => {
  const map = buildNameToCode(metadata)

  it('prefers the item over a structure sharing a display name', () => {
    expect(map['Barbed Wire']).toBe('BarbedWireMaterials')
    expect(map['Listening Kit']).toBe('ListeningKit')
    expect(map['Wind Sock']).toBe('WindsockT')
  })

  it('still maps building-only clashes (no item) to a code', () => {
    expect(map['Destroyed Trench']).toBeDefined()
  })
})