import { describe, it, expect } from 'vitest'
import { fmtMW, formatPower } from './powerFormat.mjs'

describe('fmtMW — up to one decimal, trailing .0 hidden', () => {
  it('hides a trailing .0', () => {
    expect(fmtMW(4)).toBe('4')
    expect(fmtMW(4.0)).toBe('4')
    expect(fmtMW(-4)).toBe('-4')
    expect(fmtMW(2000)).toBe('2000')
  })
  it('keeps one decimal when non-integer', () => {
    expect(fmtMW(0.8)).toBe('0.8')
    expect(fmtMW(-0.8)).toBe('-0.8')
    expect(fmtMW(2.5)).toBe('2.5')
  })
  it('rounds float dust to 1 dp', () => {
    expect(fmtMW(0.80000001)).toBe('0.8')
    expect(fmtMW(1.949)).toBe('1.9')
  })
})

describe('formatPower — <mag>MW × <duration>s (+ (/5) for multi-order), no sign', () => {
  const producer = { powerDelta: 2000, duration: 900 }
  const consumer = { facilityKey: 'FacilityRefinery', powerDelta: -4000, duration: 900 }
  const pad = { facilityKey: 'FacilityVehicleFactory1', powerDelta: -4000, duration: 900 }

  it('power producer: raw/1000 MW, no (/5) (sign shown via color, not text)', () => {
    expect(formatPower(producer)).toBe('2MW × 900s')
  })
  it('multi-order consumer: magnitude MW with (/5), no sign', () => {
    expect(formatPower(consumer)).toBe('4MW × 180s (/5)')
  })
  it('assembly pad consumer: magnitude MW, no (/5), no sign', () => {
    expect(formatPower(pad)).toBe('4MW × 900s')
  })
})