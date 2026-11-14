import { describe, expect, it } from 'vitest'
import { formatTick, niceTicks } from '../src/core/ticks'

describe('ticks', () => {
  it('makes a readable set of round numbers', () => {
    const ticks = niceTicks(-2.6, 2.6, 8)
    expect(ticks.step).toBe(1)
    expect(ticks.values).toEqual([-2, -1, 0, 1, 2])
    const fine = niceTicks(-2.6, 2.6, 12)
    expect(fine.step).toBeCloseTo(0.5, 12)
    expect(fine.values[0]).toBeCloseTo(-2.5, 12)
    expect(fine.values.at(-1)).toBeCloseTo(2.5, 12)
  })

  it('formats integers without eating their trailing zeroes', () => {
    expect(formatTick(10, 10)).toBe('10')
    expect(formatTick(20, 10)).toBe('20')
    expect(formatTick(0, 0.5)).toBe('0')
    expect(formatTick(0.25, 0.5)).toBe('0.25')
    expect(formatTick(-0.5, 0.5)).toBe('-0.5')
  })
})
